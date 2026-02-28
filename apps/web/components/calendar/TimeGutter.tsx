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
}: {
  schedule: ScheduleWindow;
  heightPx?: number;
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
      className="sticky left-0 z-20 relative border-r border-slate-200 bg-white"
      style={{ width: TIME_GUTTER_WIDTH_PX, minWidth: TIME_GUTTER_WIDTH_PX, height: effectiveHeightPx }}
      aria-hidden="true"
    >
      {markers.map((marker) => (
        <div key={marker.key}>
          <div
            className="absolute left-0 right-0 border-t border-slate-200"
            style={{ top: Math.min(marker.topPx, Math.max(effectiveHeightPx - 1, 0)) }}
          />
          <span
            className="absolute left-2 rounded bg-white px-1 text-[11px] font-medium text-slate-500"
            style={{
              top: Math.min(Math.max(marker.topPx - 8, 0), Math.max(effectiveHeightPx - 18, 0)),
            }}
          >
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  );
});
