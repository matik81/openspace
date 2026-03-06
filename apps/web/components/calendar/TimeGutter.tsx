'use client';

import { memo, useMemo } from 'react';
import {
  SCHEDULE_PIXELS_PER_MINUTE,
  scheduleRowMinHeightPx,
  type ScheduleWindow,
} from '@/lib/time';

export const TIME_GUTTER_WIDTH_PX = 72;

export const TimeGutter = memo(function TimeGutter({
  schedule,
  heightPx,
  currentTimeOffsetPx,
  currentTimeLabel,
}: {
  schedule: ScheduleWindow;
  heightPx?: number;
  currentTimeOffsetPx?: number | null;
  currentTimeLabel?: string | null;
}) {
  const effectiveHeightPx = heightPx ?? scheduleRowMinHeightPx(schedule);
  const markers = useMemo(
    () =>
      Array.from({ length: schedule.endHour - schedule.startHour + 1 }, (_, index) => {
        const hour = schedule.startHour + index;
        return {
          key: hour,
          label: `${hour.toString().padStart(2, '0')}:00`,
          topPx: (hour - schedule.startHour) * 60 * SCHEDULE_PIXELS_PER_MINUTE,
        };
      }),
    [schedule],
  );

  return (
    <div
      className="relative z-40 overflow-visible border-r border-slate-200 bg-white"
      style={{ width: TIME_GUTTER_WIDTH_PX, minWidth: TIME_GUTTER_WIDTH_PX, height: effectiveHeightPx }}
      aria-hidden="true"
    >
      {markers.map((marker) => {
        const isFirstMarker = marker.key === schedule.startHour;

        return (
          <div key={marker.key}>
            <div
              className="absolute left-0 right-0 border-t border-slate-200"
              style={{ top: Math.min(marker.topPx, Math.max(effectiveHeightPx - 1, 0)) }}
            />
            <span
              className={`absolute left-2 inline-flex min-w-[42px] -translate-y-1/2 justify-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm ${isFirstMarker ? 'z-40' : 'z-10'}`}
              style={{
                top: marker.topPx,
              }}
            >
              {marker.label}
            </span>
          </div>
        );
      })}
      {currentTimeOffsetPx !== null && currentTimeOffsetPx !== undefined && currentTimeLabel ? (
        <>
          <div
            className="absolute left-0 right-0 z-20 border-t border-rose-400"
            style={{ top: currentTimeOffsetPx }}
            aria-hidden="true"
          />
          <span
            className="absolute left-2 z-50 inline-flex min-w-[42px] -translate-y-1/2 justify-center rounded-md border border-rose-600 bg-rose-500 px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm"
            style={{
              top: currentTimeOffsetPx,
            }}
          >
            {currentTimeLabel}
          </span>
        </>
      ) : null}
    </div>
  );
});
