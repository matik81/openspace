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
