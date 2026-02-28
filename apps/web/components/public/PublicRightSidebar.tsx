'use client';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { buildMiniCalendarCells, parseDateKey } from '@/lib/time';

const PUBLIC_TIMEZONE = 'Europe/Rome';

const PLACEHOLDER_BOOKINGS = [
  { id: 'placeholder-1', title: 'Product sync', roomName: 'Focus Room', meta: '09:00-10:30' },
  { id: 'placeholder-2', title: 'Sprint planning', roomName: 'Collab Hub', meta: '11:00-12:00' },
  { id: 'placeholder-3', title: 'Town hall', roomName: 'Board Room', meta: '15:00-16:30' },
];

export function PublicRightSidebar({
  monthKey,
  miniCalendarCells,
  onSelectDateKey,
  onSelectMonthKey,
}: {
  monthKey: string;
  miniCalendarCells: ReturnType<typeof buildMiniCalendarCells>;
  onSelectDateKey: (value: string) => void;
  onSelectMonthKey: (value: string) => void;
}) {
  const monthLabel = useMemo(
    () => parseDateKey(`${monthKey}-01`, PUBLIC_TIMEZONE).toFormat('LLLL yyyy'),
    [monthKey],
  );

  function jumpToToday() {
    const now = DateTime.now().setZone(PUBLIC_TIMEZONE);
    onSelectDateKey(now.toFormat('yyyy-LL-dd'));
    onSelectMonthKey(now.toFormat('yyyy-LL'));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</p>
            <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
            <p className="text-xs text-slate-500">{PUBLIC_TIMEZONE}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={jumpToToday}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectMonthKey(
                  DateTime.fromISO(`${monthKey}-01`, { zone: PUBLIC_TIMEZONE })
                    .minus({ months: 1 })
                    .toFormat('yyyy-LL'),
                )
              }
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Previous month"
            >
              {'<-'}
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectMonthKey(
                  DateTime.fromISO(`${monthKey}-01`, { zone: PUBLIC_TIMEZONE })
                    .plus({ months: 1 })
                    .toFormat('yyyy-LL'),
                )
              }
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
              {cell.dayNumber}
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Upcoming preview</h3>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {PLACEHOLDER_BOOKINGS.map((booking) => (
            <div key={booking.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-xs font-semibold leading-tight text-slate-900">{booking.title}</p>
              <p className="truncate text-[11px] text-slate-700">{booking.roomName}</p>
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {booking.meta}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
