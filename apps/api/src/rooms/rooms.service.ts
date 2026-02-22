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
  Prisma,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

type AuthUser = {
  userId: string;
};

type VerifiedUser = {
  id: string;
  email: string;
};

@Injectable()
export class RoomsService {
  constructor(private readonly prismaService: PrismaService) {}

  async createRoom(authUser: AuthUser, workspaceId: string, dto: CreateRoomDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);

    const name = this.requireString(dto.name, 'name');
    const description = this.normalizeCreateDescription(dto.description);

    try {
      return await this.prismaService.room.create({
        data: {
          workspaceId: normalizedWorkspaceId,
          name,
          description,
        },
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

  async listRooms(authUser: AuthUser, workspaceId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const items = await this.prismaService.room.findMany({
      where: {
        workspaceId: normalizedWorkspaceId,
      },
      select: this.roomSelect(),
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { items };
  }

  async getRoom(authUser: AuthUser, workspaceId: string, roomId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedRoomId = this.requireUuid(roomId, 'roomId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    return this.findWorkspaceRoom(normalizedWorkspaceId, normalizedRoomId);
  }

  async updateRoom(
    authUser: AuthUser,
    workspaceId: string,
    roomId: string,
    dto: UpdateRoomDto,
  ) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedRoomId = this.requireUuid(roomId, 'roomId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.findWorkspaceRoom(normalizedWorkspaceId, normalizedRoomId);

    const data: {
      name?: string;
      description?: string | null;
    } = {};

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

  async deleteRoom(authUser: AuthUser, workspaceId: string, roomId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedRoomId = this.requireUuid(roomId, 'roomId');
    await this.assertWorkspaceAdmin(normalizedWorkspaceId, user);
    await this.findWorkspaceRoom(normalizedWorkspaceId, normalizedRoomId);

    const existingBookingsCount = await this.prismaService.booking.count({
      where: {
        workspaceId: normalizedWorkspaceId,
        roomId: normalizedRoomId,
      },
    });

    if (existingBookingsCount > 0) {
      throw new ConflictException({
        code: 'ROOM_HAS_BOOKINGS',
        message: 'Cannot delete a room that has bookings',
      });
    }

    await this.prismaService.room.delete({
      where: {
        id: normalizedRoomId,
      },
    });

    return {
      deleted: true,
    };
  }

  private async findWorkspaceRoom(workspaceId: string, roomId: string) {
    const room = await this.prismaService.room.findFirst({
      where: {
        id: roomId,
        workspaceId,
      },
      select: this.roomSelect(),
    });

    if (!room) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Room not found',
      });
    }

    return room;
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

  private async assertActiveWorkspaceMember(
    workspaceId: string,
    user: VerifiedUser,
  ): Promise<void> {
    const activeMembership = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (activeMembership) {
      return;
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
        message: 'Only active workspace members can view rooms',
      });
    }

    throw new ForbiddenException({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });
  }

  private isRoomNameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const meta = error.meta as { target?: string | string[] } | undefined;

    if (Array.isArray(meta?.target)) {
      return meta.target.includes('workspaceId') && meta.target.includes('name');
    }

    if (typeof meta?.target === 'string') {
      return (
        meta.target.includes('workspaceId') &&
        meta.target.includes('name')
      );
    }

    return error.message.includes('Room_workspaceId_name_key');
  }

  private roomSelect() {
    return {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
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

  private normalizeUpdateDescription(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return this.requireString(value, 'description');
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
}
