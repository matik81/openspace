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
  private static readonly BOOKING_WINDOW_START_HOUR = 7;
  private static readonly BOOKING_WINDOW_END_HOUR = 22;
  private static readonly BOOKING_MINUTE_STEP = 5;

  constructor(private readonly prismaService: PrismaService) {}

  async listBookings(
    authUser: AuthUser,
    workspaceId: string,
    query: ListBookingsQuery = {},
  ) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);
    const workspace = await this.prismaService.workspace.findUnique({
      where: {
        id: normalizedWorkspaceId,
      },
      select: {
        timezone: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

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

    const bookings = await this.prismaService.booking.findMany({
      where,
      select: this.bookingListSelect(),
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
    });

    const todayDateKey = this.toLocalDateKey(new Date(), workspace.timezone);
    const visibleBookings = includePast
      ? bookings
      : bookings.filter(
          (booking) => this.toLocalDateKey(booking.startAt, workspace.timezone) >= todayDateKey,
        );

    return {
      items: visibleBookings.map((booking) => ({
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

    this.assertBookingWithinAllowedHours(startAt, endAt, workspace.timezone);
    this.assertBookingOnAllowedMinuteStep(startAt, endAt, workspace.timezone);

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
      const bookingConflict = this.getBookingConflict(error);
      if (bookingConflict) {
        throw new ConflictException({
          code: bookingConflict.code,
          message: bookingConflict.message,
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

    await this.prismaService.booking.delete({
      where: {
        id: booking.id,
      },
    });

    return {
      deleted: true,
    };
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

  private assertBookingWithinAllowedHours(
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): void {
    const startTime = this.toLocalTimeParts(startAt, timezone);
    const endTime = this.toLocalTimeParts(endAt, timezone);

    const startsTooEarly =
      startTime.hour < BookingsService.BOOKING_WINDOW_START_HOUR;
    const endsTooLate =
      endTime.hour > BookingsService.BOOKING_WINDOW_END_HOUR ||
      (endTime.hour === BookingsService.BOOKING_WINDOW_END_HOUR &&
        (endTime.minute > 0 || endTime.second > 0));

    if (startsTooEarly || endsTooLate) {
      throw new BadRequestException({
        code: 'BOOKING_OUTSIDE_ALLOWED_HOURS',
        message: 'Bookings must be within 07:00-22:00 in the workspace timezone',
      });
    }
  }

  private assertBookingOnAllowedMinuteStep(
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): void {
    const startTime = this.toLocalTimeParts(startAt, timezone);
    const endTime = this.toLocalTimeParts(endAt, timezone);

    const hasInvalidMilliseconds =
      startAt.getUTCMilliseconds() !== 0 || endAt.getUTCMilliseconds() !== 0;
    const startNotAligned =
      startTime.minute % BookingsService.BOOKING_MINUTE_STEP !== 0 || startTime.second !== 0;
    const endNotAligned =
      endTime.minute % BookingsService.BOOKING_MINUTE_STEP !== 0 || endTime.second !== 0;

    if (hasInvalidMilliseconds || startNotAligned || endNotAligned) {
      throw new BadRequestException({
        code: 'BOOKING_INVALID_TIME_INCREMENT',
        message: 'Bookings must start and end on 5-minute increments in the workspace timezone',
      });
    }
  }

  private toLocalTimeParts(
    date: Date,
    timezone: string,
  ): {
    hour: number;
    minute: number;
    second: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const second = Number(parts.find((part) => part.type === 'second')?.value);

    if ([hour, minute, second].some((value) => Number.isNaN(value))) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Unable to evaluate booking time in workspace timezone',
      });
    }

    return { hour, minute, second };
  }

  private getBookingConflict(
    error: unknown,
  ): { code: string; message: string } | null {
    const errorMessage = error instanceof Error ? error.message : '';
    const normalizedErrorMessage = errorMessage.toLowerCase();

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = error.meta as
        | {
            database_error?: unknown;
          }
        | undefined;
      const databaseError =
        typeof meta?.database_error === 'string' ? meta.database_error : '';
      const normalizedDatabaseError = databaseError.toLowerCase();

      if (
        databaseError.includes('Booking_active_user_overlap_exclusion') ||
        error.message.includes('Booking_active_user_overlap_exclusion')
      ) {
        return {
          code: 'BOOKING_USER_OVERLAP',
          message: 'User already has an active booking in this time range',
        };
      }

      if (
        databaseError.includes('Booking_active_overlap_exclusion') ||
        error.message.includes('Booking_active_overlap_exclusion') ||
        normalizedDatabaseError.includes('exclusion constraint')
      ) {
        return {
          code: 'BOOKING_OVERLAP',
          message: 'Booking overlaps with an existing active booking',
        };
      }

      return null;
    }

    if (errorMessage.includes('Booking_active_user_overlap_exclusion')) {
      return {
        code: 'BOOKING_USER_OVERLAP',
        message: 'User already has an active booking in this time range',
      };
    }

    if (
      errorMessage.includes('Booking_active_overlap_exclusion') ||
      normalizedErrorMessage.includes('exclusion constraint')
    ) {
      return {
        code: 'BOOKING_OVERLAP',
        message: 'Booking overlaps with an existing active booking',
      };
    }

    return null;
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
