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

type ListBookingsQuery = {
  mine?: string;
  includePast?: string;
  includeCancelled?: string;
};

@Injectable()
export class BookingsService {
  constructor(private readonly prismaService: PrismaService) {}

  async listBookings(
    authUser: AuthUser,
    workspaceId: string,
    query: ListBookingsQuery = {},
  ) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const mine = this.parseBooleanQuery(query.mine, true, 'mine');
    const includePast = this.parseBooleanQuery(query.includePast, false, 'includePast');
    const includeCancelled = this.parseBooleanQuery(
      query.includeCancelled,
      false,
      'includeCancelled',
    );

    const where: Prisma.BookingWhereInput = {
      workspaceId: normalizedWorkspaceId,
    };

    if (mine) {
      where.createdByUserId = user.id;
    }

    if (!includeCancelled) {
      where.status = BookingStatus.ACTIVE;
    }

    if (!includePast) {
      where.endAt = {
        gte: new Date(),
      };
    }

    const bookings = await this.prismaService.booking.findMany({
      where,
      select: this.bookingListSelect(),
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: bookings.map((booking) => ({
        id: booking.id,
        workspaceId: booking.workspaceId,
        roomId: booking.roomId,
        roomName: booking.room.name,
        createdByUserId: booking.createdByUserId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        subject: booking.subject,
        criticality: booking.criticality,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      })),
    };
  }

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
    const workspace = await this.prismaService.workspace.findUnique({
      where: {
        id: normalizedWorkspaceId,
      },
      select: {
        id: true,
        timezone: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

    if (endAt <= startAt) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'endAt must be after startAt',
      });
    }

    const startDateKey = this.toLocalDateKey(startAt, workspace.timezone);
    const endDateKey = this.toLocalDateKey(endAt, workspace.timezone);
    if (startDateKey !== endDateKey) {
      throw new BadRequestException({
        code: 'BOOKING_MULTI_DAY_NOT_ALLOWED',
        message: 'Booking must start and end on the same date in the workspace timezone',
      });
    }

    const todayDateKey = this.toLocalDateKey(new Date(), workspace.timezone);
    if (startDateKey < todayDateKey) {
      throw new BadRequestException({
        code: 'BOOKING_PAST_DATE_NOT_ALLOWED',
        message: 'Booking date cannot be in the past',
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

  private bookingListSelect() {
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
      room: {
        select: {
          name: true,
        },
      },
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

  private toLocalDateKey(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Unable to evaluate booking date in workspace timezone',
      });
    }

    return `${year}-${month}-${day}`;
  }

  private parseBooleanQuery(
    value: string | undefined,
    defaultValue: boolean,
    fieldName: string,
  ): boolean {
    if (value === undefined) {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === '0') {
      return false;
    }

    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: `${fieldName} must be a boolean`,
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
