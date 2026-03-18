import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingCancellationReason,
  BookingStatus,
  InvitationStatus,
  MembershipStatus,
  Prisma,
  RateLimitOperationType,
  RoomStatus,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '../generated/prisma';
import { compare } from 'bcryptjs';
import { BackendPolicyService } from '../common/backend-policy.service';
import { OperationLimitsService } from '../common/operation-limits.service';
import { toLocalDateKey } from '../common/workspace-time';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { DeleteRoomDto } from './dto/delete-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

type AuthUser = { userId: string };
type VerifiedUser = { id: string; email: string };

@Injectable()
export class RoomsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly backendPolicyService: BackendPolicyService,
    private readonly operationLimitsService: OperationLimitsService,
  ) {}

  async createRoom(authUser: AuthUser, workspaceId: string, dto: CreateRoomDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.operationLimitsService.assertUserOperationAllowed(
      user.id,
      RateLimitOperationType.CREATE_ROOM,
    );
    await this.assertWorkspaceRoomCapacity(normalizedWorkspaceId);
    const roomName = this.requireString(dto.name, 'name');
    await this.assertRoomNameAvailable(normalizedWorkspaceId, roomName);

    try {
      const room = await this.prismaService.room.create({
        data: {
          workspaceId: normalizedWorkspaceId,
          name: roomName,
          description: this.normalizeCreateDescription(dto.description),
          status: RoomStatus.ACTIVE,
        },
        select: this.roomSelect(),
      });
      await this.operationLimitsService.recordUserOperation(
        user.id,
        RateLimitOperationType.CREATE_ROOM,
      );
      return room;
    } catch (error) {
      if (this.isRoomNameConflict(error)) {
        throw new ConflictException({
          code: 'ROOM_NAME_ALREADY_EXISTS',
          message: 'A room with this name already exists in the workspace',
        });
      }
      throw error;
    }
  }

  async listRooms(authUser: AuthUser, workspaceId: string, dateKey?: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const workspace = await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const selectedDateKey =
      dateKey === undefined ? null : this.requireDateKey(dateKey, 'date');
    const todayDateKey = toLocalDateKey(new Date(), workspace.timezone);
    const shouldFilterHistorically = selectedDateKey !== null;
    const effectiveDateKey = selectedDateKey ?? todayDateKey;

    const rooms = await this.prismaService.room.findMany({
      where: {
        workspaceId: normalizedWorkspaceId,
        ...(shouldFilterHistorically ? {} : { status: RoomStatus.ACTIVE }),
      },
      select: this.roomSelect(),
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: rooms.filter((room) =>
        shouldFilterHistorically
          ? this.isRoomVisibleOnDate(room.createdAt, room.cancelledAt, workspace.timezone, effectiveDateKey)
          : true,
      ),
    };
  }

  async getRoom(authUser: AuthUser, workspaceId: string, roomId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);
    return this.findWorkspaceRoom(normalizedWorkspaceId, this.requireUuid(roomId, 'roomId'));
  }

  async updateRoom(authUser: AuthUser, workspaceId: string, roomId: string, dto: UpdateRoomDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedRoomId = this.requireUuid(roomId, 'roomId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.findWorkspaceRoom(normalizedWorkspaceId, normalizedRoomId);

    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) {
      data.name = this.requireString(dto.name, 'name');
    }
    if (dto.description !== undefined) {
      data.description = this.normalizeUpdateDescription(dto.description);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'At least one field must be provided to update room',
      });
    }
    if (data.name !== undefined) {
      await this.assertRoomNameAvailable(normalizedWorkspaceId, data.name, normalizedRoomId);
    }

    try {
      return await this.prismaService.room.update({
        where: { id: normalizedRoomId },
        data,
        select: this.roomSelect(),
      });
    } catch (error) {
      if (this.isRoomNameConflict(error)) {
        throw new ConflictException({
          code: 'ROOM_NAME_ALREADY_EXISTS',
          message: 'A room with this name already exists in the workspace',
        });
      }
      throw error;
    }
  }

  async deleteRoom(authUser: AuthUser, workspaceId: string, roomId: string, dto: DeleteRoomDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedRoomId = this.requireUuid(roomId, 'roomId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    const room = await this.findWorkspaceRoom(normalizedWorkspaceId, normalizedRoomId);

    if (
      room.name !== this.requireString(dto.roomName, 'roomName') ||
      user.email !== this.normalizeEmail(dto.email)
    ) {
      this.throwRoomDeleteConfirmationFailed();
    }

    const credentials = await this.prismaService.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!credentials || !(await compare(this.requireString(dto.password, 'password'), credentials.passwordHash))) {
      this.throwRoomDeleteConfirmationFailed();
    }

    const now = new Date();
    const cancelledBookings = await this.prismaService.$transaction(async (tx) => {
      const bookingUpdate = await tx.booking.updateMany({
        where: {
          workspaceId: normalizedWorkspaceId,
          roomId: normalizedRoomId,
          status: BookingStatus.ACTIVE,
          startAt: { gte: now },
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: BookingCancellationReason.ROOM_UNAVAILABLE,
        },
      });

      await tx.room.update({
        where: { id: normalizedRoomId },
        data: { status: RoomStatus.CANCELLED, cancelledAt: now },
      });

      return bookingUpdate.count;
    });

    return { cancelled: true, cancelledBookingsCount: cancelledBookings };
  }

  private async findWorkspaceRoom(workspaceId: string, roomId: string) {
    const room = await this.prismaService.room.findFirst({
      where: { id: roomId, workspaceId, status: RoomStatus.ACTIVE },
      select: this.roomSelect(),
    });
    if (!room) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Room not found' });
    }
    return room;
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

  private async assertWorkspaceAdmin(workspaceId: string, user: VerifiedUser): Promise<void> {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }

    const membership = await this.prismaService.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id, status: MembershipStatus.ACTIVE },
      select: { role: true },
    });
    if (membership?.role === WorkspaceRole.ADMIN) {
      return;
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

  private async assertActiveWorkspaceMember(
    workspaceId: string,
    user: VerifiedUser,
  ): Promise<{ status: WorkspaceStatus; timezone: string }> {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true, timezone: true },
    });
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
    }

    const membership = await this.prismaService.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (membership) {
      return workspace;
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
        message: 'Only active workspace members can view rooms',
      });
    }
    throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
  }

  private async assertWorkspaceRoomCapacity(workspaceId: string) {
    const count = await this.prismaService.room.count({
      where: { workspaceId, status: RoomStatus.ACTIVE },
    });
    if (count >= this.backendPolicyService.maxRoomsPerWorkspace) {
      throw new ConflictException({
        code: 'WORKSPACE_ROOM_LIMIT_REACHED',
        message: 'Workspace has reached the maximum number of rooms',
      });
    }
  }

  private async assertRoomNameAvailable(
    workspaceId: string,
    name: string,
    excludeRoomId?: string,
  ) {
    const existing = await this.prismaService.room.findFirst({
      where: {
        workspaceId,
        name,
        status: RoomStatus.ACTIVE,
        ...(excludeRoomId ? { id: { not: excludeRoomId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ROOM_NAME_ALREADY_EXISTS',
        message: 'A room with this name already exists in the workspace',
      });
    }
  }

  private isRoomNameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const meta = error.meta as { target?: string | string[] } | undefined;
    if (Array.isArray(meta?.target)) {
      return meta.target.includes('workspaceId') && meta.target.includes('name');
    }
    if (typeof meta?.target === 'string') {
      return meta.target.includes('workspaceId') && meta.target.includes('name');
    }
    return (
      error.message.includes('Room_workspaceId_name_key') ||
      error.message.includes('Room_active_workspaceId_name_key')
    );
  }

  private throwRoomDeleteConfirmationFailed(): never {
    throw new ForbiddenException({
      code: 'ROOM_DELETE_CONFIRMATION_FAILED',
      message: 'Room deletion confirmation failed',
    });
  }

  private roomSelect() {
    return {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
      status: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private normalizeCreateDescription(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    return this.requireString(value, 'description');
  }

  private normalizeUpdateDescription(value: string | null | undefined): string | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }
    return this.requireString(value, 'description');
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

  private requireDateKey(value: string, fieldName: string): string {
    const normalized = this.requireString(value, fieldName);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} must be a valid date key in YYYY-MM-DD format`,
      });
    }
    return normalized;
  }

  private isRoomVisibleOnDate(
    createdAt: Date,
    cancelledAt: Date | null,
    timezone: string,
    selectedDateKey: string,
  ): boolean {
    const createdDateKey = toLocalDateKey(createdAt, timezone);
    if (createdDateKey > selectedDateKey) {
      return false;
    }
    if (!cancelledAt) {
      return true;
    }
    return toLocalDateKey(cancelledAt, timezone) > selectedDateKey;
  }
}

