import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
} from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CancelWorkspaceDto } from './dto/cancel-workspace.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ReorderVisibleWorkspacesDto } from './dto/reorder-visible-workspaces.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

type AuthUser = {
  userId: string;
};

type VerifiedUser = {
  id: string;
  email: string;
};

type VisibleWorkspaceListItem = {
  id: string;
  name: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
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
};

@Injectable()
export class WorkspacesService {
  private static readonly DEFAULT_SCHEDULE_START_HOUR = 8;
  private static readonly DEFAULT_SCHEDULE_END_HOUR = 18;

  constructor(private readonly prismaService: PrismaService) {}

  async createWorkspace(authUser: AuthUser, dto: CreateWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const name = this.requireString(dto.name, 'name');
    const timezone =
      dto.timezone === undefined ? 'UTC' : this.requireTimezone(dto.timezone);
    const { scheduleStartHour, scheduleEndHour } = this.resolveScheduleHours(dto);

    return this.prismaService.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          timezone,
          scheduleStartHour,
          scheduleEndHour,
          createdByUserId: user.id,
        },
        select: {
          id: true,
          name: true,
          timezone: true,
          scheduleStartHour: true,
          scheduleEndHour: true,
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
            scheduleStartHour: true,
            scheduleEndHour: true,
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
            scheduleStartHour: true,
            scheduleEndHour: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const byWorkspaceId = new Map<string, VisibleWorkspaceListItem>();

    for (const membership of memberships) {
      byWorkspaceId.set(membership.workspace.id, {
        id: membership.workspace.id,
        name: membership.workspace.name,
        timezone: membership.workspace.timezone,
        scheduleStartHour: membership.workspace.scheduleStartHour,
        scheduleEndHour: membership.workspace.scheduleEndHour,
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
        scheduleStartHour: invitation.workspace.scheduleStartHour,
        scheduleEndHour: invitation.workspace.scheduleEndHour,
        createdAt: invitation.workspace.createdAt,
        updatedAt: invitation.workspace.updatedAt,
        membership: null,
        invitation: invitationSummary,
      });
    }

    const items = Array.from(byWorkspaceId.values());
    const workspaceIds = items.map((item) => item.id);
    const preferences =
      workspaceIds.length === 0
        ? []
        : await this.prismaService.userWorkspacePreference.findMany({
            where: {
              userId: user.id,
              workspaceId: {
                in: workspaceIds,
              },
            },
            select: {
              workspaceId: true,
              sortOrder: true,
            },
          });
    const sortOrderByWorkspaceId = new Map(
      preferences.map((preference) => [preference.workspaceId, preference.sortOrder]),
    );

    items.sort((left, right) => {
      const leftSortOrder = sortOrderByWorkspaceId.get(left.id);
      const rightSortOrder = sortOrderByWorkspaceId.get(right.id);

      if (leftSortOrder !== undefined && rightSortOrder !== undefined) {
        if (leftSortOrder !== rightSortOrder) {
          return leftSortOrder - rightSortOrder;
        }
      } else if (leftSortOrder !== undefined) {
        return -1;
      } else if (rightSortOrder !== undefined) {
        return 1;
      }

      const createdAtDelta = right.createdAt.getTime() - left.createdAt.getTime();
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }

      return left.name.localeCompare(right.name);
    });

    return { items };
  }

  async reorderVisibleWorkspaces(authUser: AuthUser, dto: ReorderVisibleWorkspacesDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const workspaceIds = this.requireWorkspaceOrderList(dto.workspaceIds);
    const now = new Date();

    await this.expirePendingInvitations(now, {
      email: user.email,
    });

    const [activeMemberships, pendingInvitations] = await Promise.all([
      this.prismaService.workspaceMember.findMany({
        where: {
          userId: user.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          workspaceId: true,
        },
      }),
      this.prismaService.invitation.findMany({
        where: {
          email: user.email,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
        },
        select: {
          workspaceId: true,
        },
      }),
    ]);

    const visibleWorkspaceIds = new Set<string>();
    for (const membership of activeMemberships) {
      visibleWorkspaceIds.add(membership.workspaceId);
    }
    for (const invitation of pendingInvitations) {
      visibleWorkspaceIds.add(invitation.workspaceId);
    }

    if (workspaceIds.length !== visibleWorkspaceIds.size) {
      throw new ForbiddenException({
        code: 'WORKSPACE_NOT_VISIBLE',
        message: 'Workspace not visible',
      });
    }

    for (const workspaceId of workspaceIds) {
      if (!visibleWorkspaceIds.has(workspaceId)) {
        throw new ForbiddenException({
          code: 'WORKSPACE_NOT_VISIBLE',
          message: 'Workspace not visible',
        });
      }
    }

    await this.prismaService.$transaction(async (tx) => {
      for (const [sortOrder, workspaceId] of workspaceIds.entries()) {
        await tx.userWorkspacePreference.upsert({
          where: {
            userId_workspaceId: {
              userId: user.id,
              workspaceId,
            },
          },
          update: {
            sortOrder,
          },
          create: {
            userId: user.id,
            workspaceId,
            sortOrder,
          },
        });
      }
    });

    return {
      updated: true,
    };
  }

  async updateWorkspace(authUser: AuthUser, workspaceId: string, dto: UpdateWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.findWorkspaceOrThrow(normalizedWorkspaceId);

    const data: {
      name?: string;
      timezone?: string;
      scheduleStartHour?: number;
      scheduleEndHour?: number;
    } = {};

    if (dto.name !== undefined) {
      data.name = this.requireString(dto.name, 'name');
    }

    if (dto.timezone !== undefined) {
      data.timezone = this.requireTimezone(dto.timezone);
    }

    if (dto.scheduleStartHour !== undefined || dto.scheduleEndHour !== undefined) {
      const currentWorkspace = await this.findWorkspaceOrThrow(normalizedWorkspaceId);
      const scheduleHours = this.resolveScheduleHours({
        scheduleStartHour:
          dto.scheduleStartHour ?? currentWorkspace.scheduleStartHour,
        scheduleEndHour: dto.scheduleEndHour ?? currentWorkspace.scheduleEndHour,
      });
      data.scheduleStartHour = scheduleHours.scheduleStartHour;
      data.scheduleEndHour = scheduleHours.scheduleEndHour;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'At least one field must be provided to update workspace',
      });
    }

    return this.prismaService.workspace.update({
      where: { id: normalizedWorkspaceId },
      data,
      select: {
        id: true,
        name: true,
        timezone: true,
        scheduleStartHour: true,
        scheduleEndHour: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async cancelWorkspace(authUser: AuthUser, workspaceId: string, dto: CancelWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    const workspace = await this.findWorkspaceOrThrow(normalizedWorkspaceId);
    const workspaceName = this.requireString(dto.workspaceName, 'workspaceName');
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');

    if (workspace.name !== workspaceName || user.email !== email) {
      this.throwWorkspaceCancelConfirmationFailed();
    }

    const userCredentials = await this.prismaService.user.findUnique({
      where: { id: user.id },
      select: {
        passwordHash: true,
      },
    });

    if (!userCredentials) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    const isPasswordValid = await compare(password, userCredentials.passwordHash);
    if (!isPasswordValid) {
      this.throwWorkspaceCancelConfirmationFailed();
    }

    await this.prismaService.workspace.delete({
      where: {
        id: normalizedWorkspaceId,
      },
    });

    return {
      deleted: true,
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

    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

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

  async listWorkspaceMembers(authUser: AuthUser, workspaceId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    const members = await this.prismaService.workspaceMember.findMany({
      where: {
        workspaceId: normalizedWorkspaceId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      items: members.map((member) => ({
        userId: member.userId,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        role: member.role,
        status: member.status,
        joinedAt: member.createdAt,
      })),
    };
  }

  async listWorkspacePendingInvitations(authUser: AuthUser, workspaceId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const now = new Date();
    await this.expirePendingInvitations(now, {
      workspaceId: normalizedWorkspaceId,
    });
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    const invitations = await this.prismaService.invitation.findMany({
      where: {
        workspaceId: normalizedWorkspaceId,
        status: InvitationStatus.PENDING,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        invitedByUserId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: invitations,
    };
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

  private async assertWorkspaceAdmin(workspaceId: string, user: VerifiedUser): Promise<void> {
    const activeMembership = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        role: true,
      },
    });

    if (activeMembership?.role === WorkspaceRole.ADMIN) {
      return;
    }

    if (activeMembership) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only workspace admins can perform this action',
      });
    }

    const pendingInvitation = await this.prismaService.invitation.findFirst({
      where: {
        workspaceId,
        email: user.email,
        status: InvitationStatus.PENDING,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (pendingInvitation) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only workspace admins can perform this action',
      });
    }

    throw new ForbiddenException({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });
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

  private async findWorkspaceOrThrow(workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        scheduleStartHour: true,
        scheduleEndHour: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

    return workspace;
  }

  private throwWorkspaceCancelConfirmationFailed(): never {
    throw new ForbiddenException({
      code: 'WORKSPACE_CANCEL_CONFIRMATION_FAILED',
      message: 'Workspace cancellation confirmation failed',
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

  private resolveScheduleHours(value: {
    scheduleStartHour?: number;
    scheduleEndHour?: number;
  }): {
    scheduleStartHour: number;
    scheduleEndHour: number;
  } {
    const scheduleStartHour =
      value.scheduleStartHour === undefined
        ? WorkspacesService.DEFAULT_SCHEDULE_START_HOUR
        : this.requireScheduleHour(value.scheduleStartHour, 'scheduleStartHour');
    const scheduleEndHour =
      value.scheduleEndHour === undefined
        ? WorkspacesService.DEFAULT_SCHEDULE_END_HOUR
        : this.requireScheduleHour(value.scheduleEndHour, 'scheduleEndHour');

    if (scheduleEndHour <= scheduleStartHour) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'scheduleEndHour must be greater than scheduleStartHour',
      });
    }

    return { scheduleStartHour, scheduleEndHour };
  }

  private requireScheduleHour(value: number, fieldName: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 24) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} must be an integer between 0 and 24`,
      });
    }

    return value;
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

  private requireWorkspaceOrderList(value: string[] | undefined): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'workspaceIds must be an array of UUIDs',
      });
    }

    const normalized = value.map((workspaceId) =>
      this.requireUuid(workspaceId, 'workspaceIds[]'),
    );
    const uniqueIds = new Set(normalized);

    if (uniqueIds.size !== normalized.length) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'workspaceIds must not contain duplicates',
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
