import { DateTime } from 'luxon';
import type { BookingListItem } from './types';

export const SCHEDULE_INTERVAL_MINUTES = 15;
export const SCHEDULE_START_HOUR = 7;
export const SCHEDULE_END_HOUR = 22;
export const SCHEDULE_START_MINUTES = SCHEDULE_START_HOUR * 60;
export const SCHEDULE_END_MINUTES = SCHEDULE_END_HOUR * 60;
export const SCHEDULE_TOTAL_MINUTES = SCHEDULE_END_MINUTES - SCHEDULE_START_MINUTES;
export const SCHEDULE_PIXELS_PER_MINUTE = 1;
export const SCHEDULE_ROW_MIN_HEIGHT_PX = SCHEDULE_TOTAL_MINUTES * SCHEDULE_PIXELS_PER_MINUTE;

export type CalendarDayCell = {
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  markerCount: number;
};

export type SidebarBookingGroup = {
  key: string;
  label: string;
  items: BookingListItem[];
};

export function workspaceTodayDateKey(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd');
}

export function parseDateKey(dateKey: string, timezone: string): DateTime {
  const parsed = DateTime.fromISO(dateKey, { zone: timezone });
  return parsed.isValid ? parsed.startOf('day') : DateTime.now().setZone(timezone).startOf('day');
}

export function addDaysToDateKey(dateKey: string, days: number, timezone: string): string {
  return parseDateKey(dateKey, timezone).plus({ days }).toFormat('yyyy-LL-dd');
}

export function formatSelectedDateLabel(dateKey: string, timezone: string): string {
  return parseDateKey(dateKey, timezone).toFormat('cccc, LLL dd');
}

export function formatSelectedDateSubLabel(dateKey: string, timezone: string): string {
  return parseDateKey(dateKey, timezone).toFormat('yyyy');
}

export function timeInputToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

export function minutesToTimeInput(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const minute = (normalized % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

export function snapMinutes(
  value: number,
  intervalMinutes: number = SCHEDULE_INTERVAL_MINUTES,
): number {
  return Math.round(value / intervalMinutes) * intervalMinutes;
}

export function clampScheduleMinutes(
  value: number,
  { min = SCHEDULE_START_MINUTES, max = SCHEDULE_END_MINUTES }: { min?: number; max?: number } = {},
): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRangeToSchedule(startMinutes: number, endMinutes: number) {
  const duration = Math.max(SCHEDULE_INTERVAL_MINUTES, endMinutes - startMinutes);
  let nextStart = clampScheduleMinutes(startMinutes, {
    min: SCHEDULE_START_MINUTES,
    max: SCHEDULE_END_MINUTES - SCHEDULE_INTERVAL_MINUTES,
  });
  let nextEnd = nextStart + duration;

  if (nextEnd > SCHEDULE_END_MINUTES) {
    nextEnd = SCHEDULE_END_MINUTES;
    nextStart = Math.max(SCHEDULE_START_MINUTES, nextEnd - duration);
  }

  if (nextEnd - nextStart < SCHEDULE_INTERVAL_MINUTES) {
    nextEnd = Math.min(SCHEDULE_END_MINUTES, nextStart + SCHEDULE_INTERVAL_MINUTES);
  }

  return {
    startMinutes: nextStart,
    endMinutes: nextEnd,
  };
}

export function formatTimeRangeLabel(startMinutes: number, endMinutes: number): string {
  return `${minutesToTimeInput(startMinutes)}-${minutesToTimeInput(endMinutes)}`;
}

export function utcIsoToDateKeyAndMinutes(
  utcIso: string,
  timezone: string,
): { dateKey: string; minutes: number } | null {
  const dt = DateTime.fromISO(utcIso, { zone: 'utc' }).setZone(timezone);
  if (!dt.isValid) {
    return null;
  }

  return {
    dateKey: dt.toFormat('yyyy-LL-dd'),
    minutes: dt.hour * 60 + dt.minute,
  };
}

export function bookingToLocalRange(booking: BookingListItem, timezone: string) {
  const start = DateTime.fromISO(booking.startAt, { zone: 'utc' }).setZone(timezone);
  const end = DateTime.fromISO(booking.endAt, { zone: 'utc' }).setZone(timezone);

  if (!start.isValid || !end.isValid) {
    return null;
  }

  return {
    start,
    end,
    dateKey: start.toFormat('yyyy-LL-dd'),
    startMinutes: start.hour * 60 + start.minute,
    endMinutes: end.hour * 60 + end.minute,
  };
}

export function rangesOverlap(
  leftStartMinutes: number,
  leftEndMinutes: number,
  rightStartMinutes: number,
  rightEndMinutes: number,
): boolean {
  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

export function hasRoomOverlap(options: {
  bookings: BookingListItem[];
  timezone: string;
  dateKey: string;
  roomId: string;
  startMinutes: number;
  endMinutes: number;
  ignoreBookingId?: string;
}): boolean {
  const { bookings, timezone, dateKey, roomId, startMinutes, endMinutes, ignoreBookingId } =
    options;

  return bookings.some((booking) => {
    if (
      booking.status !== 'ACTIVE' ||
      booking.roomId !== roomId ||
      booking.id === ignoreBookingId
    ) {
      return false;
    }

    const local = bookingToLocalRange(booking, timezone);
    if (!local || local.dateKey !== dateKey) {
      return false;
    }

    return rangesOverlap(startMinutes, endMinutes, local.startMinutes, local.endMinutes);
  });
}

export function hasUserOverlap(options: {
  bookings: BookingListItem[];
  timezone: string;
  dateKey: string;
  userId: string;
  startMinutes: number;
  endMinutes: number;
  ignoreBookingId?: string;
}): boolean {
  const { bookings, timezone, dateKey, userId, startMinutes, endMinutes, ignoreBookingId } =
    options;

  return bookings.some((booking) => {
    if (
      booking.status !== 'ACTIVE' ||
      booking.createdByUserId !== userId ||
      booking.id === ignoreBookingId
    ) {
      return false;
    }

    const local = bookingToLocalRange(booking, timezone);
    if (!local || local.dateKey !== dateKey) {
      return false;
    }

    return rangesOverlap(startMinutes, endMinutes, local.startMinutes, local.endMinutes);
  });
}

export function getBookingConflictMessage(options: {
  bookings: BookingListItem[];
  timezone: string;
  dateKey: string;
  roomId: string;
  startMinutes: number;
  endMinutes: number;
  userId?: string;
  ignoreBookingId?: string;
}): string | null {
  const { bookings, timezone, dateKey, roomId, startMinutes, endMinutes, userId, ignoreBookingId } =
    options;

  if (
    hasRoomOverlap({
      bookings,
      timezone,
      dateKey,
      roomId,
      startMinutes,
      endMinutes,
      ignoreBookingId,
    })
  ) {
    return 'Booking overlaps with an existing active booking';
  }

  if (
    userId &&
    hasUserOverlap({
      bookings,
      timezone,
      dateKey,
      userId,
      startMinutes,
      endMinutes,
      ignoreBookingId,
    })
  ) {
    return 'User already has an active booking in this time range';
  }

  return null;
}

export function buildMiniCalendarCells(options: {
  timezone: string;
  monthKey: string;
  selectedDateKey: string;
  markerCountByDateKey?: ReadonlyMap<string, number>;
}): CalendarDayCell[] {
  const { timezone, monthKey, selectedDateKey, markerCountByDateKey } = options;
  const monthStart = DateTime.fromISO(`${monthKey}-01`, { zone: timezone }).startOf('month').isValid
    ? DateTime.fromISO(`${monthKey}-01`, { zone: timezone }).startOf('month')
    : DateTime.now().setZone(timezone).startOf('month');
  const gridStart = monthStart.minus({ days: monthStart.weekday - 1 });
  const today = workspaceTodayDateKey(timezone);

  return Array.from({ length: 42 }, (_, index) => {
    const day = gridStart.plus({ days: index });
    const dateKey = day.toFormat('yyyy-LL-dd');

    return {
      dateKey,
      dayNumber: day.day,
      isCurrentMonth: day.month === monthStart.month,
      isToday: dateKey === today,
      isSelected: dateKey === selectedDateKey,
      markerCount: markerCountByDateKey?.get(dateKey) ?? 0,
    };
  });
}

export function buildMarkerCountByDateKey(
  bookings: BookingListItem[],
  timezone: string,
  onlyMineUserId?: string,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const booking of bookings) {
    if (booking.status !== 'ACTIVE') {
      continue;
    }
    if (onlyMineUserId && booking.createdByUserId !== onlyMineUserId) {
      continue;
    }
    const local = bookingToLocalRange(booking, timezone);
    if (!local) {
      continue;
    }
    counts.set(local.dateKey, (counts.get(local.dateKey) ?? 0) + 1);
  }

  return counts;
}

export function groupMyBookingsForSidebar(
  bookings: BookingListItem[],
  timezone: string,
  currentUserId: string,
): SidebarBookingGroup[] {
  const now = DateTime.now().setZone(timezone);
  const startOfToday = now.startOf('day');
  const startOfTomorrow = startOfToday.plus({ days: 1 });
  const startOfNextWeek = startOfToday
    .plus({ days: 7 - (startOfToday.weekday - 1) })
    .startOf('day');
  const startOfFollowingWeek = startOfNextWeek.plus({ days: 7 });

  const mine = bookings
    .filter((booking) => booking.status === 'ACTIVE' && booking.createdByUserId === currentUserId)
    .map((booking) => ({ booking, local: bookingToLocalRange(booking, timezone) }))
    .filter(
      (
        item,
      ): item is {
        booking: BookingListItem;
        local: NonNullable<ReturnType<typeof bookingToLocalRange>>;
      } => item.local !== null,
    )
    .sort((left, right) => left.local.start.toMillis() - right.local.start.toMillis());

  const grouped: Record<string, BookingListItem[]> = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
    earlier: [],
  };

  for (const item of mine) {
    const start = item.local.start;

    if (start < startOfToday) {
      grouped.earlier.push(item.booking);
      continue;
    }
    if (start < startOfTomorrow) {
      grouped.today.push(item.booking);
      continue;
    }
    if (start < startOfTomorrow.plus({ days: 1 })) {
      grouped.tomorrow.push(item.booking);
      continue;
    }
    if (start < startOfNextWeek) {
      grouped.thisWeek.push(item.booking);
      continue;
    }
    if (start < startOfFollowingWeek) {
      grouped.nextWeek.push(item.booking);
      continue;
    }
    grouped.later.push(item.booking);
  }

  return [
    { key: 'today', label: 'Today', items: grouped.today },
    { key: 'tomorrow', label: 'Tomorrow', items: grouped.tomorrow },
    { key: 'thisWeek', label: 'This week', items: grouped.thisWeek },
    { key: 'nextWeek', label: 'Next week', items: grouped.nextWeek },
    { key: 'later', label: 'Later', items: grouped.later },
    { key: 'earlier', label: 'Earlier', items: grouped.earlier },
  ].filter((group) => group.items.length > 0);
}

export function formatBookingTimeRangeInTimezone(
  booking: BookingListItem,
  timezone: string,
): string {
  const local = bookingToLocalRange(booking, timezone);
  if (!local) {
    return `${booking.startAt} - ${booking.endAt}`;
  }

  return `${local.start.toFormat('HH:mm')}-${local.end.toFormat('HH:mm')}`;
}

export function formatBookingDateAndTimeInTimezone(
  booking: BookingListItem,
  timezone: string,
): string {
  const local = bookingToLocalRange(booking, timezone);
  if (!local) {
    return booking.startAt;
  }

  return `${local.start.toFormat('ccc, LLL dd')} ${local.start.toFormat('HH:mm')}-${local.end.toFormat('HH:mm')}`;
}
