import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingCancellationReason,
  BookingStatus,
  InvitationStatus,
  MembershipStatus,
  Prisma,
  RateLimitOperationType,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { BackendPolicyService } from '../common/backend-policy.service';
import { OperationLimitsService } from '../common/operation-limits.service';
import { isBookingWithinAllowedHours, isSingleLocalDay } from '../common/workspace-time';
import { PrismaService } from '../prisma/prisma.service';
import { CancelWorkspaceDto } from './dto/cancel-workspace.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { LeaveWorkspaceDto } from './dto/leave-workspace.dto';
import { ReorderVisibleWorkspacesDto } from './dto/reorder-visible-workspaces.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

type AuthUser = { userId: string };
type VerifiedUser = { id: string; email: string };

@Injectable()
export class WorkspacesService {
  private static readonly DEFAULT_SCHEDULE_START_HOUR = 8;
  private static readonly DEFAULT_SCHEDULE_END_HOUR = 18;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly backendPolicyService: BackendPolicyService,
    private readonly operationLimitsService: OperationLimitsService,
  ) {}

  async createWorkspace(authUser: AuthUser, dto: CreateWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    await this.operationLimitsService.assertUserOperationAllowed(
      user.id,
      RateLimitOperationType.CREATE_WORKSPACE,
    );
    await this.assertUserWorkspaceCapacity(user.id);

    const name = this.requireString(dto.name, 'name');
    const timezone = dto.timezone === undefined ? 'UTC' : this.requireTimezone(dto.timezone);
    const { scheduleStartHour, scheduleEndHour } = this.resolveScheduleHours(dto);
    const now = new Date();
    await this.assertWorkspaceNameAvailable(name);

    try {
      const workspace = await this.prismaService.$transaction(async (tx) => {
        const created = await tx.workspace.create({
          data: {
            name,
            timezone,
            scheduleStartHour,
            scheduleEndHour,
            status: WorkspaceStatus.ACTIVE,
            createdByUserId: user.id,
          },
          select: this.workspaceSelect(),
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: created.id,
            userId: user.id,
            role: WorkspaceRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          },
        });

        await tx.workspaceScheduleVersion.create({
          data: {
            workspaceId: created.id,
            timezone,
            scheduleStartHour,
            scheduleEndHour,
            effectiveFrom: now,
          },
        });

        return created;
      });

      await this.operationLimitsService.recordUserOperation(
        user.id,
        RateLimitOperationType.CREATE_WORKSPACE,
      );

      return {
        ...workspace,
        membership: { role: WorkspaceRole.ADMIN, status: MembershipStatus.ACTIVE },
      };
    } catch (error) {
      if (this.isWorkspaceNameConflict(error)) {
        throw new ConflictException({
          code: 'WORKSPACE_NAME_ALREADY_EXISTS',
          message: 'A workspace with this name already exists',
        });
      }
      throw error;
    }
  }

  async listVisibleWorkspaces(authUser: AuthUser) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const now = new Date();
    await this.expirePendingInvitations(now, { email: user.email });

    const memberships = await this.prismaService.workspaceMember.findMany({
      where: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
      select: {
        role: true,
        status: true,
        workspace: { select: this.workspaceListSelect() },
      },
    });
    const invitations = await this.prismaService.invitation.findMany({
      where: {
        email: user.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
      select: {
        id: true,
        status: true,
        email: true,
        expiresAt: true,
        invitedByUserId: true,
        createdAt: true,
        workspace: { select: this.workspaceListSelect() },
      },
    });

    const itemsByWorkspaceId = new Map<
      string,
      ReturnType<WorkspacesService['toVisibleWorkspaceItem']>
    >();
    for (const membership of memberships) {
      itemsByWorkspaceId.set(
        membership.workspace.id,
        this.toVisibleWorkspaceItem(membership.workspace, {
          role: membership.role,
          status: membership.status,
        }),
      );
    }
    for (const invitation of invitations) {
      const existing = itemsByWorkspaceId.get(invitation.workspace.id);
      const summary = {
        id: invitation.id,
        status: invitation.status,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        invitedByUserId: invitation.invitedByUserId,
        createdAt: invitation.createdAt,
      };
      if (existing) {
        existing.invitation = summary;
      } else {
        itemsByWorkspaceId.set(
          invitation.workspace.id,
          this.toVisibleWorkspaceItem(invitation.workspace, null, summary),
        );
      }
    }

    const items = Array.from(itemsByWorkspaceId.values());
    const preferences =
      items.length === 0
        ? []
        : await this.prismaService.userWorkspacePreference.findMany({
            where: {
              userId: user.id,
              workspaceId: { in: items.map((item) => item.id) },
            },
            select: { workspaceId: true, sortOrder: true },
          });
    const sortOrderByWorkspaceId = new Map(
      preferences.map((preference) => [preference.workspaceId, preference.sortOrder]),
    );

    items.sort((left, right) => {
      const leftSort = sortOrderByWorkspaceId.get(left.id);
      const rightSort = sortOrderByWorkspaceId.get(right.id);
      if (leftSort !== undefined && rightSort !== undefined && leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      if (leftSort !== undefined) {
        return -1;
      }
      if (rightSort !== undefined) {
        return 1;
      }
      return (
        right.createdAt.getTime() - left.createdAt.getTime() || left.name.localeCompare(right.name)
      );
    });

    return { items };
  }

  async getVisibleWorkspace(authUser: AuthUser, workspaceId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const now = new Date();
    await this.expirePendingInvitations(now, { workspaceId: normalizedWorkspaceId, email: user.email });

    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: normalizedWorkspaceId },
      select: this.workspaceDetailSelect(),
    });
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }

    const membership = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId: normalizedWorkspaceId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true, status: true },
    });

    const invitation = membership
      ? null
      : await this.prismaService.invitation.findFirst({
          where: {
            workspaceId: normalizedWorkspaceId,
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
          },
        });

    if (!membership && !invitation) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }

    return this.toVisibleWorkspaceItem(workspace, membership, invitation);
  }

  async reorderVisibleWorkspaces(authUser: AuthUser, dto: ReorderVisibleWorkspacesDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const workspaceIds = this.requireWorkspaceOrderList(dto.workspaceIds);
    const visibleWorkspaceIds = new Set(
      (await this.listVisibleWorkspaces(authUser)).items.map((item) => item.id),
    );

    if (workspaceIds.length !== visibleWorkspaceIds.size) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }
    for (const workspaceId of workspaceIds) {
      if (!visibleWorkspaceIds.has(workspaceId)) {
        throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
      }
    }

    await this.prismaService.$transaction(async (tx) => {
      for (const [sortOrder, workspaceId] of workspaceIds.entries()) {
        await tx.userWorkspacePreference.upsert({
          where: { userId_workspaceId: { userId: user.id, workspaceId } },
          update: { sortOrder },
          create: { userId: user.id, workspaceId, sortOrder },
        });
      }
    });

    return { updated: true };
  }

  async updateWorkspace(authUser: AuthUser, workspaceId: string, dto: UpdateWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const current = await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    const name = dto.name !== undefined ? this.requireString(dto.name, 'name') : undefined;
    const timezone = dto.timezone !== undefined ? this.requireTimezone(dto.timezone) : current.timezone;
    const schedule = this.resolveScheduleHours({
      scheduleStartHour: dto.scheduleStartHour ?? current.scheduleStartHour,
      scheduleEndHour: dto.scheduleEndHour ?? current.scheduleEndHour,
    });
    const scheduleChanged =
      timezone !== current.timezone ||
      schedule.scheduleStartHour !== current.scheduleStartHour ||
      schedule.scheduleEndHour !== current.scheduleEndHour;

    if (
      name === undefined &&
      dto.timezone === undefined &&
      dto.scheduleStartHour === undefined &&
      dto.scheduleEndHour === undefined
    ) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'At least one field must be provided to update workspace',
      });
    }
    if (name !== undefined && name !== current.name) {
      await this.assertWorkspaceNameAvailable(name, normalizedWorkspaceId);
    }

    const now = new Date();
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const updated = await tx.workspace.update({
          where: { id: normalizedWorkspaceId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(dto.timezone !== undefined ? { timezone } : {}),
            ...(dto.scheduleStartHour !== undefined || dto.scheduleEndHour !== undefined
              ? schedule
              : {}),
          },
          select: this.workspaceSelect(),
        });

        if (scheduleChanged) {
          await tx.workspaceScheduleVersion.create({
            data: {
              workspaceId: normalizedWorkspaceId,
              timezone,
              scheduleStartHour: schedule.scheduleStartHour,
              scheduleEndHour: schedule.scheduleEndHour,
              effectiveFrom: now,
            },
          });

          const futureBookings = await tx.booking.findMany({
            where: {
              workspaceId: normalizedWorkspaceId,
              status: BookingStatus.ACTIVE,
              startAt: { gte: now },
            },
            select: { id: true, startAt: true, endAt: true },
          });
          const incompatibleIds = futureBookings
            .filter(
              (booking) =>
                !isSingleLocalDay(booking.startAt, booking.endAt, timezone) ||
                !isBookingWithinAllowedHours(
                  booking.startAt,
                  booking.endAt,
                  timezone,
                  schedule.scheduleStartHour,
                  schedule.scheduleEndHour,
                ),
            )
            .map((booking) => booking.id);

          if (incompatibleIds.length > 0) {
            await tx.booking.updateMany({
              where: { id: { in: incompatibleIds } },
              data: {
                status: BookingStatus.CANCELLED,
                cancelledAt: now,
                cancellationReason: BookingCancellationReason.SCHEDULE_INCOMPATIBLE,
              },
            });
          }
        }

        return updated;
      });
    } catch (error) {
      if (this.isWorkspaceNameConflict(error)) {
        throw new ConflictException({
          code: 'WORKSPACE_NAME_ALREADY_EXISTS',
          message: 'A workspace with this name already exists',
        });
      }
      throw error;
    }
  }

  async cancelWorkspace(authUser: AuthUser, workspaceId: string, dto: CancelWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const workspace = await this.assertWorkspaceAdmin(this.requireUuid(workspaceId, 'workspaceId'), user);
    const workspaceName = this.requireString(dto.workspaceName, 'workspaceName');
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');

    if (workspace.name !== workspaceName || user.email !== email) {
      this.throwWorkspaceCancelConfirmationFailed();
    }

    const credentials = await this.prismaService.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!credentials || !(await compare(password, credentials.passwordHash))) {
      this.throwWorkspaceCancelConfirmationFailed();
    }

    await this.prismaService.workspace.update({
      where: { id: workspace.id },
      data: { status: WorkspaceStatus.CANCELLED, cancelledAt: new Date() },
    });

    return { deleted: true };
  }

  async inviteUser(authUser: AuthUser, workspaceId: string, dto: InviteUserDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const email = this.normalizeEmail(dto.email);
    const now = new Date();

    await this.expirePendingInvitations(now, { workspaceId: normalizedWorkspaceId, email });
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.operationLimitsService.assertUserOperationAllowed(
      user.id,
      RateLimitOperationType.CREATE_INVITATION,
    );
    await this.assertWorkspacePendingInvitationCapacity(normalizedWorkspaceId);

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (existingUser?.status === UserStatus.CANCELLED) {
      throw new ConflictException({
        code: 'USER_ACCOUNT_CANCELLED',
        message: 'The invited user account is not active',
      });
    }
    if (existingUser) {
      const activeMember = await this.prismaService.workspaceMember.findFirst({
        where: {
          workspaceId: normalizedWorkspaceId,
          userId: existingUser.id,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
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
      select: { id: true },
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

    await this.operationLimitsService.recordUserOperation(
      user.id,
      RateLimitOperationType.CREATE_INVITATION,
    );

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
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
      select: {
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
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
    await this.expirePendingInvitations(now, { workspaceId: normalizedWorkspaceId });
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    return {
      items: await this.prismaService.invitation.findMany({
        where: {
          workspaceId: normalizedWorkspaceId,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
          workspace: { status: WorkspaceStatus.ACTIVE },
        },
        select: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          invitedByUserId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async acceptInvitation(authUser: AuthUser, invitationId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedInvitationId = this.requireUuid(invitationId, 'invitationId');
    const now = new Date();

    await this.expirePendingInvitations(now, { email: user.email });
    await this.assertUserWorkspaceCapacity(user.id);

    const invitation = await this.prismaService.invitation.findUnique({
      where: { id: normalizedInvitationId },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        status: true,
        expiresAt: true,
        workspace: { select: { status: true } },
      },
    });
    if (
      !invitation ||
      invitation.email !== user.email ||
      invitation.workspace.status !== WorkspaceStatus.ACTIVE
    ) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException({ code: 'INVITATION_NOT_PENDING', message: 'Invitation is not pending' });
    }
    if (invitation.expiresAt <= now) {
      await this.prismaService.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ConflictException({ code: 'INVITATION_EXPIRED', message: 'Invitation has expired' });
    }

    await this.assertWorkspaceUserCapacity(invitation.workspaceId);
    await this.prismaService.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        update: { status: MembershipStatus.ACTIVE },
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
    await this.expirePendingInvitations(new Date(), { email: user.email });

    const invitation = await this.prismaService.invitation.findUnique({
      where: { id: normalizedInvitationId },
      select: { id: true, email: true, status: true, workspace: { select: { status: true } } },
    });
    if (
      !invitation ||
      invitation.email !== user.email ||
      invitation.workspace.status !== WorkspaceStatus.ACTIVE
    ) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException({ code: 'INVITATION_NOT_PENDING', message: 'Invitation is not pending' });
    }

    await this.prismaService.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REJECTED },
    });
    return { rejected: true };
  }

  async leaveWorkspace(authUser: AuthUser, workspaceId: string, dto: LeaveWorkspaceDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');
    const membership = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId: normalizedWorkspaceId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
      select: { id: true, role: true },
    });
    if (!membership) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }
    if (membership.role === WorkspaceRole.ADMIN) {
      throw new ForbiddenException({
        code: 'ADMIN_CANNOT_LEAVE_WORKSPACE',
        message: 'Workspace admins cannot leave the workspace',
      });
    }
    if (user.email !== email) {
      throw new ForbiddenException({
        code: 'WORKSPACE_LEAVE_CONFIRMATION_FAILED',
        message: 'Workspace leave confirmation failed',
      });
    }
    const credentials = await this.prismaService.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!credentials || !(await compare(password, credentials.passwordHash))) {
      throw new ForbiddenException({
        code: 'WORKSPACE_LEAVE_CONFIRMATION_FAILED',
        message: 'Workspace leave confirmation failed',
      });
    }

    const now = new Date();
    await this.prismaService.$transaction(async (tx) => {
      await tx.workspaceMember.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.INACTIVE },
      });
      await tx.booking.updateMany({
        where: {
          workspaceId: normalizedWorkspaceId,
          createdByUserId: user.id,
          status: BookingStatus.ACTIVE,
          startAt: { gte: now },
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
        },
      });
    });

    return { left: true };
  }

  private async requireVerifiedUser(userId: string): Promise<VerifiedUser> {
    const user = await this.prismaService.user.findUnique({
      where: { id: this.requireUuid(userId, 'userId') },
      select: { id: true, email: true, status: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid access token' });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'ACCOUNT_CANCELLED', message: 'Account is no longer active' });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email must be verified before accessing workspaces',
      });
    }
    return { id: user.id, email: this.normalizeEmail(user.email) };
  }

  private async assertWorkspaceAdmin(workspaceId: string, user: VerifiedUser) {
    const workspace = await this.findActiveWorkspaceOrThrow(workspaceId);
    const membership = await this.prismaService.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id, status: MembershipStatus.ACTIVE },
      select: { role: true },
    });
    if (membership?.role === WorkspaceRole.ADMIN) {
      return workspace;
    }
    if (membership) {
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
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pendingInvitation) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only workspace admins can perform this action',
      });
    }
    throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
  }

  private async findActiveWorkspaceOrThrow(workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ...this.workspaceSelect(), status: true },
    });
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }
    return workspace;
  }

  private async expirePendingInvitations(
    now: Date,
    filters: { workspaceId?: string; email?: string },
  ) {
    await this.prismaService.invitation.updateMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { lte: now },
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.email ? { email: filters.email } : {}),
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  private async assertUserWorkspaceCapacity(userId: string) {
    const count = await this.prismaService.workspaceMember.count({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
    });
    if (count >= this.backendPolicyService.maxWorkspacesPerUser) {
      throw new ConflictException({
        code: 'USER_WORKSPACE_LIMIT_REACHED',
        message: 'User has reached the maximum number of workspaces',
      });
    }
  }

  private async assertWorkspaceUserCapacity(workspaceId: string) {
    const count = await this.prismaService.workspaceMember.count({
      where: { workspaceId, status: MembershipStatus.ACTIVE },
    });
    if (count >= this.backendPolicyService.maxUsersPerWorkspace) {
      throw new ConflictException({
        code: 'WORKSPACE_USER_LIMIT_REACHED',
        message: 'Workspace has reached the maximum number of users',
      });
    }
  }

  private async assertWorkspacePendingInvitationCapacity(workspaceId: string) {
    const count = await this.prismaService.invitation.count({
      where: {
        workspaceId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (count >= this.backendPolicyService.maxPendingInvitationsPerWorkspace) {
      throw new ConflictException({
        code: 'WORKSPACE_PENDING_INVITATION_LIMIT_REACHED',
        message: 'Workspace has reached the maximum number of pending invitations',
      });
    }
  }

  private async assertWorkspaceNameAvailable(name: string, excludeWorkspaceId?: string) {
    const existing = await this.prismaService.workspace.findFirst({
      where: {
        name,
        ...(excludeWorkspaceId ? { id: { not: excludeWorkspaceId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'WORKSPACE_NAME_ALREADY_EXISTS',
        message: 'A workspace with this name already exists',
      });
    }
  }

  private toVisibleWorkspaceItem(
    workspace: {
      id: string;
      name: string;
      timezone: string;
      scheduleStartHour: number;
      scheduleEndHour: number;
      createdAt: Date;
      updatedAt: Date;
      scheduleVersions?: Array<{
        timezone: string;
        scheduleStartHour: number;
        scheduleEndHour: number;
        effectiveFrom: Date;
      }>;
    },
    membership: { role: WorkspaceRole; status: MembershipStatus } | null,
    invitation: {
      id: string;
      status: InvitationStatus;
      email: string;
      expiresAt: Date;
      invitedByUserId: string;
      createdAt: Date;
    } | null = null,
  ) {
    return { ...workspace, membership, invitation };
  }

  private workspaceSelect() {
    return {
      id: true,
      name: true,
      timezone: true,
      scheduleStartHour: true,
      scheduleEndHour: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private workspaceListSelect() {
    return {
      id: true,
      name: true,
      timezone: true,
      scheduleStartHour: true,
      scheduleEndHour: true,
      createdAt: true,
      updatedAt: true,
      scheduleVersions: {
        select: {
          timezone: true,
          scheduleStartHour: true,
          scheduleEndHour: true,
          effectiveFrom: true,
        },
        orderBy: { effectiveFrom: 'asc' as const },
      },
    };
  }

  private workspaceDetailSelect() {
    return {
      ...this.workspaceListSelect(),
      status: true,
    };
  }

  private isWorkspaceNameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const meta = error.meta as { target?: string | string[] } | undefined;
    if (Array.isArray(meta?.target)) {
      return meta.target.includes('name');
    }
    if (typeof meta?.target === 'string') {
      return meta.target.includes('name');
    }
    return error.message.includes('Workspace_name_key');
  }

  private throwWorkspaceCancelConfirmationFailed(): never {
    throw new ForbiddenException({
      code: 'WORKSPACE_CANCEL_CONFIRMATION_FAILED',
      message: 'Workspace cancellation confirmation failed',
    });
  }

  private requireString(value: string | undefined | null, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException({ code: 'BAD_REQUEST', message: `${fieldName} is required` });
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

  private resolveScheduleHours(value: { scheduleStartHour?: number; scheduleEndHour?: number }) {
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
    const normalized = value.map((workspaceId) => this.requireUuid(workspaceId, 'workspaceIds[]'));
    if (new Set(normalized).size !== normalized.length) {
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
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}
