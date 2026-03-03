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
  BookingCriticality,
  BookingStatus,
  InvitationStatus,
  MembershipStatus,
  Prisma,
  RateLimitOperationType,
  RoomStatus,
  UserStatus,
  WorkspaceStatus,
} from '@prisma/client';
import { BackendPolicyService } from '../common/backend-policy.service';
import { OperationLimitsService } from '../common/operation-limits.service';
import {
  isBookingWithinAllowedHours,
  isSingleLocalDay,
  toLocalDateKey,
  toLocalTimeParts,
} from '../common/workspace-time';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

type AuthUser = { userId: string };
type VerifiedUser = { id: string; email: string };
type ListBookingsQuery = { mine?: string; includePast?: string; includeCancelled?: string };

@Injectable()
export class BookingsService {
  private static readonly BOOKING_MINUTE_STEP = 15;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly backendPolicyService: BackendPolicyService,
    private readonly operationLimitsService: OperationLimitsService,
  ) {}

  async listBookings(authUser: AuthUser, workspaceId: string, query: ListBookingsQuery = {}) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const workspace = await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);

    const where: Prisma.BookingWhereInput = { workspaceId: normalizedWorkspaceId };
    if (this.parseBooleanQuery(query.mine, true, 'mine')) {
      where.createdByUserId = user.id;
    }
    if (!this.parseBooleanQuery(query.includeCancelled, false, 'includeCancelled')) {
      where.status = BookingStatus.ACTIVE;
    }

    const bookings = await this.prismaService.booking.findMany({
      where,
      select: this.bookingListSelect(),
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
    });
    const todayDateKey = toLocalDateKey(new Date(), workspace.timezone);
    const includePast = this.parseBooleanQuery(query.includePast, false, 'includePast');

    return {
      items: bookings
        .filter(
          (booking) =>
            includePast || toLocalDateKey(booking.startAt, workspace.timezone) >= todayDateKey,
        )
        .map((booking) => ({
          id: booking.id,
          workspaceId: booking.workspaceId,
          roomId: booking.roomId,
          roomName: booking.room.name,
          createdByUserId: booking.createdByUserId,
          createdByDisplayName: this.toDisplayName(
            booking.createdByUser.firstName,
            booking.createdByUser.lastName,
          ),
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

  async createBooking(authUser: AuthUser, workspaceId: string, dto: CreateBookingDto) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const workspace = await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);
    await this.operationLimitsService.assertUserOperationAllowed(
      user.id,
      RateLimitOperationType.CREATE_BOOKING,
    );

    const roomId = this.requireUuid(dto.roomId, 'roomId');
    const startAt = this.parseDate(dto.startAt, 'startAt');
    const endAt = this.parseDate(dto.endAt, 'endAt');
    this.validateBookingTimeRange(workspace, startAt, endAt);
    await this.assertFutureBookingCapacity(normalizedWorkspaceId, user.id);

    const room = await this.prismaService.room.findFirst({
      where: {
        id: roomId,
        workspaceId: normalizedWorkspaceId,
        status: RoomStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Room not found' });
    }

    try {
      const booking = await this.prismaService.booking.create({
        data: {
          workspaceId: normalizedWorkspaceId,
          roomId: room.id,
          createdByUserId: user.id,
          startAt,
          endAt,
          subject: this.requireString(dto.subject, 'subject'),
          criticality: this.parseCriticality(dto.criticality),
          status: BookingStatus.ACTIVE,
        },
        select: this.bookingSelect(),
      });
      await this.operationLimitsService.recordUserOperation(
        user.id,
        RateLimitOperationType.CREATE_BOOKING,
      );
      return booking;
    } catch (error) {
      const bookingConflict = this.getBookingConflict(error);
      if (bookingConflict) {
        throw new ConflictException(bookingConflict);
      }
      throw error;
    }
  }

  async updateBooking(
    authUser: AuthUser,
    workspaceId: string,
    bookingId: string,
    dto: UpdateBookingDto,
  ) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const workspace = await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);
    const existing = await this.prismaService.booking.findFirst({
      where: { id: this.requireUuid(bookingId, 'bookingId'), workspaceId: normalizedWorkspaceId },
      select: {
        id: true,
        roomId: true,
        createdByUserId: true,
        startAt: true,
        endAt: true,
        subject: true,
        criticality: true,
        status: true,
      },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (existing.createdByUserId !== user.id) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only the booking owner can update this booking',
      });
    }
    if (existing.status === BookingStatus.CANCELLED) {
      throw new ConflictException({
        code: 'BOOKING_ALREADY_CANCELLED',
        message: 'Booking is already cancelled',
      });
    }
    this.assertBookingCanStillBeMutated(existing.startAt, workspace.timezone);

    const roomId = dto.roomId !== undefined ? this.requireUuid(dto.roomId, 'roomId') : existing.roomId;
    const startAt = dto.startAt !== undefined ? this.parseDate(dto.startAt, 'startAt') : existing.startAt;
    const endAt = dto.endAt !== undefined ? this.parseDate(dto.endAt, 'endAt') : existing.endAt;
    const subject = dto.subject !== undefined ? this.requireString(dto.subject, 'subject') : existing.subject;
    const criticality =
      dto.criticality !== undefined ? this.parseCriticality(dto.criticality) : existing.criticality;

    if (
      dto.roomId === undefined &&
      dto.startAt === undefined &&
      dto.endAt === undefined &&
      dto.subject === undefined &&
      dto.criticality === undefined
    ) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'At least one field must be provided to update booking',
      });
    }

    this.validateBookingTimeRange(workspace, startAt, endAt);
    const room = await this.prismaService.room.findFirst({
      where: { id: roomId, workspaceId: normalizedWorkspaceId, status: RoomStatus.ACTIVE },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Room not found' });
    }

    try {
      return await this.prismaService.booking.update({
        where: { id: existing.id },
        data: { roomId: room.id, startAt, endAt, subject, criticality },
        select: this.bookingSelect(),
      });
    } catch (error) {
      const bookingConflict = this.getBookingConflict(error);
      if (bookingConflict) {
        throw new ConflictException(bookingConflict);
      }
      throw error;
    }
  }

  async cancelBooking(authUser: AuthUser, workspaceId: string, bookingId: string) {
    const user = await this.requireVerifiedUser(authUser.userId);
    const normalizedWorkspaceId = this.requireUuid(workspaceId, 'workspaceId');
    const workspace = await this.assertActiveWorkspaceMember(normalizedWorkspaceId, user);
    const booking = await this.prismaService.booking.findFirst({
      where: { id: this.requireUuid(bookingId, 'bookingId'), workspaceId: normalizedWorkspaceId },
      select: {
        id: true,
        createdByUserId: true,
        startAt: true,
        status: true,
      },
    });
    if (!booking) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.createdByUserId !== user.id) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Only the booking owner can cancel this booking',
      });
    }
    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException({
        code: 'BOOKING_ALREADY_CANCELLED',
        message: 'Booking is already cancelled',
      });
    }
    this.assertBookingCanStillBeMutated(booking.startAt, workspace.timezone);

    await this.prismaService.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: BookingCancellationReason.USER_CANCELLED,
      },
    });

    return { cancelled: true };
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

  private async assertActiveWorkspaceMember(workspaceId: string, user: VerifiedUser) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        timezone: true,
        scheduleStartHour: true,
        scheduleEndHour: true,
        status: true,
      },
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
        message: 'Only active workspace members can manage bookings',
      });
    }
    throw new ForbiddenException({ code: 'WORKSPACE_NOT_VISIBLE', message: 'Workspace not visible' });
  }

  private async assertFutureBookingCapacity(workspaceId: string, userId: string) {
    const count = await this.prismaService.booking.count({
      where: {
        workspaceId,
        createdByUserId: userId,
        status: BookingStatus.ACTIVE,
        startAt: { gte: new Date() },
      },
    });
    if (count >= this.backendPolicyService.maxFutureBookingsPerUserPerWorkspace) {
      throw new ConflictException({
        code: 'USER_FUTURE_BOOKING_LIMIT_REACHED',
        message: 'User has reached the maximum number of future bookings in this workspace',
      });
    }
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
      ...this.bookingSelect(),
      room: { select: { name: true } },
      createdByUser: { select: { firstName: true, lastName: true } },
    };
  }

  private validateBookingTimeRange(
    workspace: { timezone: string; scheduleStartHour: number; scheduleEndHour: number },
    startAt: Date,
    endAt: Date,
  ) {
    if (endAt <= startAt) {
      throw new BadRequestException({ code: 'BAD_REQUEST', message: 'endAt must be after startAt' });
    }
    if (!isSingleLocalDay(startAt, endAt, workspace.timezone)) {
      throw new BadRequestException({
        code: 'BOOKING_MULTI_DAY_NOT_ALLOWED',
        message: 'Booking must start and end on the same date in the workspace timezone',
      });
    }

    const todayKey = toLocalDateKey(new Date(), workspace.timezone);
    const startDateKey = toLocalDateKey(startAt, workspace.timezone);
    if (startDateKey < todayKey) {
      throw new BadRequestException({
        code: 'BOOKING_PAST_DATE_NOT_ALLOWED',
        message: 'Booking date cannot be in the past',
      });
    }
    if (this.daysBetweenDateKeys(todayKey, startDateKey) > this.backendPolicyService.maxBookingDaysAhead) {
      throw new BadRequestException({
        code: 'BOOKING_TOO_FAR_IN_FUTURE',
        message: 'Booking date cannot be more than 365 days in the future',
      });
    }
    if (
      !isBookingWithinAllowedHours(
        startAt,
        endAt,
        workspace.timezone,
        workspace.scheduleStartHour,
        workspace.scheduleEndHour,
      )
    ) {
      throw new BadRequestException({
        code: 'BOOKING_OUTSIDE_ALLOWED_HOURS',
        message: `Bookings must be within ${this.formatHourLabel(workspace.scheduleStartHour)}-${this.formatHourLabel(workspace.scheduleEndHour)} in the workspace timezone`,
      });
    }
    this.assertBookingOnAllowedMinuteStep(startAt, endAt, workspace.timezone);
  }

  private assertBookingCanStillBeMutated(startAt: Date, timezone: string) {
    if (toLocalDateKey(startAt, timezone) < toLocalDateKey(new Date(), timezone)) {
      throw new BadRequestException({
        code: 'BOOKING_PAST_MUTATION_NOT_ALLOWED',
        message: 'Past bookings before today cannot be changed',
      });
    }
  }

  private parseDate(value: string | undefined | null, fieldName: string): Date {
    const date = new Date(this.requireString(value, fieldName));
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
    if (value === BookingCriticality.HIGH || value === BookingCriticality.MEDIUM || value === BookingCriticality.LOW) {
      return value;
    }
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'criticality must be one of HIGH, MEDIUM, LOW',
    });
  }

  private parseBooleanQuery(value: string | undefined, defaultValue: boolean, fieldName: string) {
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

  private assertBookingOnAllowedMinuteStep(startAt: Date, endAt: Date, timezone: string): void {
    const startTime = toLocalTimeParts(startAt, timezone);
    const endTime = toLocalTimeParts(endAt, timezone);
    const hasInvalidMilliseconds =
      startAt.getUTCMilliseconds() !== 0 || endAt.getUTCMilliseconds() !== 0;
    const startNotAligned =
      startTime.minute % BookingsService.BOOKING_MINUTE_STEP !== 0 || startTime.second !== 0;
    const endNotAligned =
      endTime.minute % BookingsService.BOOKING_MINUTE_STEP !== 0 || endTime.second !== 0;
    if (hasInvalidMilliseconds || startNotAligned || endNotAligned) {
      throw new BadRequestException({
        code: 'BOOKING_INVALID_TIME_INCREMENT',
        message: 'Bookings must start and end on 15-minute increments in the workspace timezone',
      });
    }
  }

  private getBookingConflict(error: unknown): { code: string; message: string } | null {
    const message = error instanceof Error ? error.message : '';
    const normalized = message.toLowerCase();
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const databaseError =
        typeof (error.meta as { database_error?: unknown } | undefined)?.database_error === 'string'
          ? ((error.meta as { database_error?: string }).database_error ?? '')
          : '';
      if (
        databaseError.includes('Booking_active_user_overlap_exclusion') ||
        message.includes('Booking_active_user_overlap_exclusion')
      ) {
        return {
          code: 'BOOKING_USER_OVERLAP',
          message: 'User already has an active booking in this time range',
        };
      }
      if (
        databaseError.includes('Booking_active_overlap_exclusion') ||
        message.includes('Booking_active_overlap_exclusion') ||
        databaseError.toLowerCase().includes('exclusion constraint')
      ) {
        return {
          code: 'BOOKING_OVERLAP',
          message: 'Booking overlaps with an existing active booking',
        };
      }
      return null;
    }
    if (message.includes('Booking_active_user_overlap_exclusion')) {
      return {
        code: 'BOOKING_USER_OVERLAP',
        message: 'User already has an active booking in this time range',
      };
    }
    if (message.includes('Booking_active_overlap_exclusion') || normalized.includes('exclusion constraint')) {
      return {
        code: 'BOOKING_OVERLAP',
        message: 'Booking overlaps with an existing active booking',
      };
    }
    return null;
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

  private formatHourLabel(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  private toDisplayName(firstName: string, lastName: string): string {
    return `${firstName.trim()} ${lastName.trim()}`.trim() || 'Unknown User';
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

  private daysBetweenDateKeys(start: string, end: string): number {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  }
}
