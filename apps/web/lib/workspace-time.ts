import { DateTime } from 'luxon';

export function formatUtcInTimezone(value: string, timezone: string): string {
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid) {
    return value;
  }

  const zoned = parsed.setZone(timezone);
  if (!zoned.isValid) {
    return parsed.toUTC().toISO() ?? value;
  }

  return zoned.toLocaleString(DateTime.DATETIME_MED);
}

export function localInputToUtcIso(localValue: string, timezone: string): string | null {
  const parsed = DateTime.fromFormat(localValue, "yyyy-LL-dd'T'HH:mm", { zone: timezone });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toISO();
}

export function dateAndTimeToUtcIso(
  dateValue: string,
  timeValue: string,
  timezone: string,
): string | null {
  if (!dateValue || !timeValue) {
    return null;
  }

  return localInputToUtcIso(`${dateValue}T${timeValue}`, timezone);
}

export function workspaceTodayDateInput(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd');
}

export function addHoursToTimeInput(timeValue: string, hours: number): string | null {
  if (!timeValue) {
    return null;
  }

  const parsed = DateTime.fromFormat(timeValue, 'HH:mm', { zone: 'utc' });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.plus({ hours }).toFormat('HH:mm');
}

export function utcIsoToLocalInput(utcValue: string, timezone: string): string {
  const parsed = DateTime.fromISO(utcValue, { zone: 'utc' });
  if (!parsed.isValid) {
    return '';
  }

  const zoned = parsed.setZone(timezone);
  if (!zoned.isValid) {
    return '';
  }

  return zoned.toFormat("yyyy-LL-dd'T'HH:mm");
}
