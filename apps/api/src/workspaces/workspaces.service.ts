import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteUserDto } from './dto/invite-user.dto';

type AuthUser = {
  userId: string;
};

type VerifiedUser = {
  id: string;
  email: string;
};

@Injectable()
export class WorkspacesService {
  constructor(private readonly prismaService: PrismaService) {}

  async createWorkspace(authUser: AuthUser, dto: CreateWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const name = this.requireString(dto.name, 'name');
    const timezone =
      dto.timezone === undefined ? 'UTC' : this.requireTimezone(dto.timezone);

    return this.prismaService.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          timezone,
          createdByUserId: user.id,
        },
        select: {
          id: true,
          name: true,
          timezone: true,
          createdByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      });

      return {
        ...workspace,
        membership: {
          role: WorkspaceRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      };
    });
  }

  async listVisibleWorkspaces(authUser: AuthUser) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const now = new Date();

    await this.expirePendingInvitations(now, {
      email: user.email,
    });

    const memberships = await this.prismaService.workspaceMember.findMany({
      where: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        role: true,
        status: true,
        workspace: {
          select: {
            id: true,
            name: true,
            timezone: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const invitations = await this.prismaService.invitation.findMany({
      where: {
        email: user.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        status: true,
        email: true,
        expiresAt: true,
        invitedByUserId: true,
        createdAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            timezone: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const byWorkspaceId = new Map<
      string,
      {
        id: string;
        name: string;
        timezone: string;
        createdAt: Date;
        updatedAt: Date;
        membership: { role: WorkspaceRole; status: MembershipStatus } | null;
        invitation: {
          id: string;
          status: InvitationStatus;
          email: string;
          expiresAt: Date;
          invitedByUserId: string;
          createdAt: Date;
        } | null;
      }
    >();

    for (const membership of memberships) {
      byWorkspaceId.set(membership.workspace.id, {
        id: membership.workspace.id,
        name: membership.workspace.name,
        timezone: membership.workspace.timezone,
        createdAt: membership.workspace.createdAt,
        updatedAt: membership.workspace.updatedAt,
        membership: {
          role: membership.role,
          status: membership.status,
        },
        invitation: null,
      });
    }

    for (const invitation of invitations) {
      const existing = byWorkspaceId.get(invitation.workspace.id);
      const invitationSummary = {
        id: invitation.id,
        status: invitation.status,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        invitedByUserId: invitation.invitedByUserId,
        createdAt: invitation.createdAt,
      };

      if (existing) {
        existing.invitation = invitationSummary;
        continue;
      }

      byWorkspaceId.set(invitation.workspace.id, {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        timezone: invitation.workspace.timezone,
        createdAt: invitation.workspace.createdAt,
        updatedAt: invitation.workspace.updatedAt,
        membership: null,
        invitation: invitationSummary,
      });
    }

    return {
      items: Array.from(byWorkspaceId.values()).sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      ),
    };
  }

  async inviteUser(authUser: AuthUser, workspaceId: string, dto: InviteUserDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const email = this.normalizeEmail(dto.email);
    const now = new Date();

    await this.expirePendingInvitations(now, {
      workspaceId: normalizedWorkspaceId,
      email,
    });

    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user.id);

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      const activeMember = await this.prismaService.workspaceMember.findFirst({
        where: {
          workspaceId: normalizedWorkspaceId,
          userId: existingUser.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (activeMember) {
        throw new ConflictException({
          code: 'ALREADY_WORKSPACE_MEMBER',
          message: 'User is already an active workspace member',
        });
      }
    }

    const existingInvitation = await this.prismaService.invitation.findFirst({
      where: {
        workspaceId: normalizedWorkspaceId,
        email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
      },
    });

    if (existingInvitation) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_PENDING',
        message: 'A pending invitation already exists for this email',
      });
    }

    const invitation = await this.prismaService.invitation.create({
      data: {
        workspaceId: normalizedWorkspaceId,
        email,
        tokenHash: this.hashToken(this.generateOpaqueToken()),
        status: InvitationStatus.PENDING,
        expiresAt: this.buildInvitationExpiration(),
        invitedByUserId: user.id,
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        status: true,
        expiresAt: true,
        invitedByUserId: true,
        createdAt: true,
      },
    });

    return invitation;
  }

  async acceptInvitation(authUser: AuthUser, invitationId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedInvitationId = this.requireUuid(invitationId, 'invitationId');
    const now = new Date();

    await this.expirePendingInvitations(now, {
      email: user.email,
    });

    const invitation = await this.prismaService.invitation.findUnique({
      where: {
        id: normalizedInvitationId,
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!invitation || invitation.email !== user.email) {
      throw new ForbiddenException({
        code: 'WORKSPACE_NOT_VISIBLE',
        message: 'Workspace not visible',
      });
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException({
        code: 'INVITATION_NOT_PENDING',
        message: 'Invitation is not pending',
      });
    }

    if (invitation.expiresAt <= now) {
      await this.prismaService.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });

      throw new ConflictException({
        code: 'INVITATION_EXPIRED',
        message: 'Invitation has expired',
      });
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
          },
        },
        update: {
          status: MembershipStatus.ACTIVE,
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: WorkspaceRole.MEMBER,
          status: MembershipStatus.ACTIVE,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });
    });

    return { accepted: true };
  }

  async rejectInvitation(authUser: AuthUser, invitationId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedInvitationId = this.requireUuid(invitationId, 'invitationId');
    const now = new Date();

    await this.expirePendingInvitations(now, {
      email: user.email,
    });

    const invitation = await this.prismaService.invitation.findUnique({
      where: {
        id: normalizedInvitationId,
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    if (!invitation || invitation.email !== user.email) {
      throw new ForbiddenException({
        code: 'WORKSPACE_NOT_VISIBLE',
        message: 'Workspace not visible',
      });
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException({
        code: 'INVITATION_NOT_PENDING',
        message: 'Invitation is not pending',
      });
    }

    await this.prismaService.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REJECTED },
    });

    return { rejected: true };
  }

  private async requireVerifiedUser(userId: string): Promise<VerifiedUser> {
    const normalizedUserId = this.requireUuid(userId, 'userId');
    const user = await this.prismaService.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email must be verified before accessing workspaces',
      });
    }

    return {
      id: user.id,
      email: this.normalizeEmail(user.email),
    };
  }

  private async assertWorkspaceAdmin(workspaceId: string, userId: string): Promise<void> {
    const member = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        role: WorkspaceRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only workspace admins can perform this action',
      });
    }
  }

  private async expirePendingInvitations(
    now: Date,
    filters: {
      workspaceId?: string;
      email?: string;
    } = {},
  ): Promise<void> {
    const where: {
      status: InvitationStatus;
      expiresAt: { lte: Date };
      workspaceId?: string;
      email?: string;
    } = {
      status: InvitationStatus.PENDING,
      expiresAt: { lte: now },
    };

    if (filters.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }

    if (filters.email) {
      where.email = filters.email;
    }

    await this.prismaService.invitation.updateMany({
      where,
      data: {
        status: InvitationStatus.EXPIRED,
      },
    });
  }

  private requireString(value: string | undefined | null, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} is required`,
      });
    }

    return value.trim();
  }

  private normalizeEmail(value: string | undefined | null): string {
    return this.requireString(value, 'email').toLowerCase();
  }

  private requireTimezone(value: string): string {
    const timezone = this.requireString(value, 'timezone');

    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return timezone;
    } catch {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'timezone must be a valid IANA timezone',
      });
    }
  }

  private requireUuid(value: string | undefined | null, fieldName: string): string {
    const normalized = this.requireString(value, fieldName);
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(normalized)) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} must be a valid UUID`,
      });
    }

    return normalized;
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private buildInvitationExpiration(): Date {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + sevenDaysMs);
  }
}
