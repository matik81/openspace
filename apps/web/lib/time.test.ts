import { Settings } from 'luxon';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMarkerCountByDateKey,
  buildMiniCalendarCells,
  getBookingConflictMessage,
  groupMyBookingsForSidebar,
  resolveBookingLoadDateRange,
} from '@/lib/time';
import type { BookingListItem } from '@/lib/types';

const ORIGINAL_SETTINGS_NOW = Settings.now;
const FIXED_NOW = new Date('2026-03-18T09:30:00.000Z').getTime();

function createBooking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: 'booking-1',
    workspaceId: 'workspace-1',
    roomId: 'room-1',
    roomName: 'Focus Room',
    createdByUserId: 'user-1',
    createdByDisplayName: 'Ada Lovelace',
    startAt: '2026-03-18T09:00:00.000Z',
    endAt: '2026-03-18T10:00:00.000Z',
    subject: 'Deep work',
    criticality: 'MEDIUM',
    status: 'ACTIVE',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('time helpers', () => {
  afterEach(() => {
    Settings.now = ORIGINAL_SETTINGS_NOW;
  });

  it('builds mini calendar cells with marker counts and selection flags', () => {
    Settings.now = () => FIXED_NOW;

    const cells = buildMiniCalendarCells({
      timezone: 'UTC',
      monthKey: '2026-03',
      selectedDateKey: '2026-03-19',
      markerCountByDateKey: new Map([
        ['2026-03-18', 2],
        ['2026-03-19', 1],
      ]),
    });

    const todayCell = cells.find((cell) => cell.dateKey === '2026-03-18');
    const selectedCell = cells.find((cell) => cell.dateKey === '2026-03-19');

    expect(cells).toHaveLength(42);
    expect(todayCell).toMatchObject({
      isToday: true,
      isSelected: false,
      markerCount: 2,
    });
    expect(selectedCell).toMatchObject({
      isToday: false,
      isSelected: true,
      markerCount: 1,
    });
  });

  it('returns the most relevant booking conflict message', () => {
    const bookings = [
      createBooking(),
      createBooking({
        id: 'booking-2',
        roomId: 'room-2',
        createdByUserId: 'user-2',
        startAt: '2026-03-18T11:00:00.000Z',
        endAt: '2026-03-18T12:00:00.000Z',
      }),
    ];

    expect(
      getBookingConflictMessage({
        bookings,
        timezone: 'UTC',
        dateKey: '2026-03-18',
        roomId: 'room-1',
        startMinutes: 570,
        endMinutes: 630,
        userId: 'user-3',
      }),
    ).toBe('This booking overlaps an existing active booking');

    expect(
      getBookingConflictMessage({
        bookings,
        timezone: 'UTC',
        dateKey: '2026-03-18',
        roomId: 'room-3',
        startMinutes: 675,
        endMinutes: 705,
        userId: 'user-2',
      }),
    ).toBe('You already have an active booking during this time');
  });

  it('groups only active current-user bookings for the sidebar timeline', () => {
    Settings.now = () => FIXED_NOW;

    const groups = groupMyBookingsForSidebar(
      [
        createBooking({
          id: 'today',
          subject: 'Today booking',
          startAt: '2026-03-18T15:00:00.000Z',
          endAt: '2026-03-18T16:00:00.000Z',
        }),
        createBooking({
          id: 'tomorrow',
          subject: 'Tomorrow booking',
          startAt: '2026-03-19T09:00:00.000Z',
          endAt: '2026-03-19T10:00:00.000Z',
        }),
        createBooking({
          id: 'later',
          subject: 'Later booking',
          startAt: '2026-04-07T09:00:00.000Z',
          endAt: '2026-04-07T10:00:00.000Z',
        }),
        createBooking({
          id: 'earlier',
          subject: 'Earlier booking',
          startAt: '2026-03-17T09:00:00.000Z',
          endAt: '2026-03-17T10:00:00.000Z',
        }),
        createBooking({
          id: 'next-week',
          subject: 'Next week booking',
          startAt: '2026-03-24T09:00:00.000Z',
          endAt: '2026-03-24T10:00:00.000Z',
        }),
        createBooking({
          id: 'cancelled',
          subject: 'Cancelled booking',
          status: 'CANCELLED',
          startAt: '2026-03-18T11:00:00.000Z',
          endAt: '2026-03-18T12:00:00.000Z',
        }),
        createBooking({
          id: 'other-user',
          subject: 'Other user booking',
          createdByUserId: 'user-2',
          startAt: '2026-03-18T13:00:00.000Z',
          endAt: '2026-03-18T14:00:00.000Z',
        }),
      ],
      'UTC',
      'user-1',
    );

    expect(groups).toEqual([
      {
        key: 'today',
        label: 'Today',
        items: [expect.objectContaining({ id: 'today' })],
      },
      {
        key: 'tomorrow',
        label: 'Tomorrow',
        items: [expect.objectContaining({ id: 'tomorrow' })],
      },
      {
        key: 'nextWeek',
        label: 'Next week',
        items: [expect.objectContaining({ id: 'next-week' })],
      },
    ]);
  });

  it('resolves a booking load range that covers next week and the visible mini-calendar grid', () => {
    Settings.now = () => FIXED_NOW;

    expect(resolveBookingLoadDateRange({ timezone: 'UTC', monthKey: '2026-03' })).toEqual({
      fromDate: '2026-03-18',
      toDate: '2026-04-05',
    });
    expect(
      resolveBookingLoadDateRange({
        timezone: 'UTC',
        monthKey: '2026-03',
        paddingDays: 2,
      }),
    ).toEqual({
      fromDate: '2026-03-16',
      toDate: '2026-04-07',
    });
  });

  it('counts marker dots only for active bookings and optional current user scope', () => {
    const counts = buildMarkerCountByDateKey(
      [
        createBooking({
          id: 'mine-active',
          startAt: '2026-03-18T09:00:00.000Z',
          endAt: '2026-03-18T10:00:00.000Z',
        }),
        createBooking({
          id: 'mine-active-2',
          startAt: '2026-03-18T11:00:00.000Z',
          endAt: '2026-03-18T12:00:00.000Z',
        }),
        createBooking({
          id: 'mine-cancelled',
          status: 'CANCELLED',
        }),
        createBooking({
          id: 'other-user',
          createdByUserId: 'user-2',
          startAt: '2026-03-19T09:00:00.000Z',
          endAt: '2026-03-19T10:00:00.000Z',
        }),
      ],
      'UTC',
      'user-1',
    );

    expect(counts.get('2026-03-18')).toBe(2);
    expect(counts.has('2026-03-19')).toBe(false);
  });
});
