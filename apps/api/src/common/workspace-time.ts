import { BadRequestException } from '@nestjs/common';

export function toLocalDateKey(date: Date, timezone: string): string {
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

export function toLocalTimeParts(
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

export function isBookingWithinAllowedHours(
  startAt: Date,
  endAt: Date,
  timezone: string,
  scheduleStartHour: number,
  scheduleEndHour: number,
): boolean {
  const startTime = toLocalTimeParts(startAt, timezone);
  const endTime = toLocalTimeParts(endAt, timezone);

  const startsTooEarly = startTime.hour < scheduleStartHour;
  const endsTooLate =
    endTime.hour > scheduleEndHour ||
    (endTime.hour === scheduleEndHour && (endTime.minute > 0 || endTime.second > 0));

  return !startsTooEarly && !endsTooLate;
}

export function isSingleLocalDay(
  startAt: Date,
  endAt: Date,
  timezone: string,
): boolean {
  return toLocalDateKey(startAt, timezone) === toLocalDateKey(endAt, timezone);
}
