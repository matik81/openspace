import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingCriticality,
  BookingStatus,
  InvitationStatus,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

type AuthUser = {
  userId: string;
};

type VerifiedUser = {
  id: string;
  email: string;
};

@Injectable()
export class BookingsService {
  constructor(private readonly prismaService: PrismaService) {}

  async createBooking(
    authUser: AuthUser,
    workspaceId: string,
    dto: CreateBookingDto,
  ) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const roomId = this.requireUuid(dto.roomId, 'roomId');
    const startAt = this.parseDate(dto.startAt, 'startAt');
    const endAt = this.parseDate(dto.endAt, 'endAt');
    const subject = this.requireString(dto.subject, 'subject');
    const criticality = this.parseCriticality(dto.criticality);

    if (endAt <= startAt) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'endAt must be after startAt',
      });
    }

    const room = await this.prismaService.room.findFirst({
      where: {
        id: roomId,
        workspaceId: normalizedWorkspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!room) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Room not found',
      });
    }

    try {
      return await this.prismaService.booking.create({
        data: {
          workspaceId: normalizedWorkspaceId,
          roomId: room.id,
          createdByUserId: user.id,
          startAt,
          endAt,
          subject,
          criticality,
          status: BookingStatus.ACTIVE,
        },
        select: this.bookingSelect(),
      });
    } catch (error) {
      if (this.isBookingOverlapError(error)) {
        throw new ConflictException({
          code: 'BOOKING_OVERLAP',
          message: 'Booking overlaps with an existing active booking',
        });
      }

      throw error;
    }
  }

  async cancelBooking(authUser: AuthUser, workspaceId: string, bookingId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const normalizedBookingId = this.requireUuid(bookingId, 'bookingId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const booking = await this.prismaService.booking.findFirst({
      where: {
        id: normalizedBookingId,
        workspaceId: normalizedWorkspaceId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Booking not found',
      });
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException({
        code: 'BOOKING_ALREADY_CANCELLED',
        message: 'Booking is already cancelled',
      });
    }

    return this.prismaService.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        status: BookingStatus.CANCELLED,
      },
      select: this.bookingSelect(),
    });
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

  private async assertActiveWorkspaceMember(
    workspaceId: string,
    user: VerifiedUser,
  ): Promise<void> {
    const membership = await this.prismaService.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (membership) {
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
        message: 'Only active workspace members can manage bookings',
      });
    }

    throw new ForbiddenException({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });
  }

  private bookingSelect() {
    return {
      id: true,
      workspaceId: true,
      roomId: true,
      createdByUserId: true,
      startAt: true,
      endAt: true,
      subject: true,
      criticality: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private parseDate(value: string | undefined | null, fieldName: string): Date {
    const raw = this.requireString(value, fieldName);
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} must be a valid ISO date string`,
      });
    }

    return date;
  }

  private parseCriticality(value: BookingCriticality | undefined): BookingCriticality {
    if (value === undefined) {
      return BookingCriticality.MEDIUM;
    }

    if (
      value === BookingCriticality.HIGH ||
      value === BookingCriticality.MEDIUM ||
      value === BookingCriticality.LOW
    ) {
      return value;
    }

    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'criticality must be one of HIGH, MEDIUM, LOW',
    });
  }

  private isBookingOverlapError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : '';

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = error.meta as
        | {
            database_error?: unknown;
          }
        | undefined;
      const databaseError =
        typeof meta?.database_error === 'string' ? meta.database_error : '';

      return (
        databaseError.includes('Booking_active_overlap_exclusion') ||
        error.message.includes('Booking_active_overlap_exclusion') ||
        databaseError.toLowerCase().includes('exclusion constraint')
      );
    }

    return (
      errorMessage.includes('Booking_active_overlap_exclusion') ||
      errorMessage.toLowerCase().includes('exclusion constraint')
    );
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
