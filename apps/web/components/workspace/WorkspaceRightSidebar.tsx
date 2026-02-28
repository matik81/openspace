'use client';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  formatBookingDateAndTimeInTimezone,
  parseDateKey,
  type CalendarDayCell,
  type SidebarBookingGroup,
} from '@/lib/time';
import type { BookingListItem } from '@/lib/types';

export function WorkspaceRightSidebar({
  timezone,
  dateKey,
  monthKey,
  onSelectDateKey,
  onSelectMonthKey,
  onToday,
  miniCalendarCells,
  bookingGroups,
  onOpenBooking,
}: {
  timezone: string;
  dateKey: string;
  monthKey: string;
  onSelectDateKey: (value: string) => void;
  onSelectMonthKey: (value: string) => void;
  onToday: () => void;
  miniCalendarCells: CalendarDayCell[];
  bookingGroups: SidebarBookingGroup[];
  onOpenBooking: (booking: BookingListItem) => void;
}) {
  const monthLabel = useMemo(
    () => parseDateKey(`${monthKey}-01`.slice(0, 10), timezone).toFormat('LLLL yyyy'),
    [monthKey, timezone],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</p>
            <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
            <p className="text-xs text-slate-500">{timezone}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToday}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const next = DateTime.fromISO(`${monthKey}-01`, { zone: timezone }).minus({
                  months: 1,
                });
                onSelectMonthKey(next.toFormat('yyyy-LL'));
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Previous month"
            >
              {'<-'}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = DateTime.fromISO(`${monthKey}-01`, { zone: timezone }).plus({
                  months: 1,
                });
                onSelectMonthKey(next.toFormat('yyyy-LL'));
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Next month"
            >
              {'->'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}

          {miniCalendarCells.map((cell) => (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => {
                onSelectDateKey(cell.dateKey);
                onSelectMonthKey(cell.dateKey.slice(0, 7));
              }}
              className={`relative h-8 rounded-md border text-xs font-medium transition ${
                cell.isSelected
                  ? 'border-brand bg-cyan-100 text-cyan-900'
                  : cell.isToday
                    ? 'border-slate-400 bg-white text-slate-900'
                    : cell.isCurrentMonth
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      : 'border-transparent bg-transparent text-slate-400 hover:bg-white'
              }`}
              aria-label={`Select ${cell.dateKey}`}
            >
              <span>{cell.dayNumber}</span>
              {cell.markerCount > 0 ? (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                    cell.isSelected ? 'bg-cyan-700' : 'bg-slate-500'
                  }`}
                />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">My bookings</h3>
          <p className="mt-1 text-xs text-slate-500">
            {parseDateKey(dateKey, timezone).toFormat('cccc, dd LLL yyyy')}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {bookingGroups.length === 0 ? (
            <p className="text-sm text-slate-600">No bookings yet in this workspace.</p>
          ) : null}

          {bookingGroups.map((group) => (
            <div key={group.key}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </h4>
              <ul className="space-y-2">
                {group.items.map((booking) => (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => onOpenBooking(booking)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    >
                      <p className="truncate text-xs font-semibold leading-tight text-slate-900">
                        {booking.subject}
                      </p>
                      <p className="truncate text-[11px] text-slate-900/90">{booking.roomName}</p>
                      <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {formatBookingDateAndTimeInTimezone(booking, timezone)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
