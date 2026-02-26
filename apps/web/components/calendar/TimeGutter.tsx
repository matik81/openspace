'use client';

import { memo, useMemo } from 'react';
import {
  SCHEDULE_END_HOUR,
  SCHEDULE_PIXELS_PER_MINUTE,
  SCHEDULE_ROW_MIN_HEIGHT_PX,
  SCHEDULE_START_HOUR,
} from '@/lib/time';

export const TIME_GUTTER_WIDTH_PX = 72;

export const TimeGutter = memo(function TimeGutter({
  heightPx = SCHEDULE_ROW_MIN_HEIGHT_PX,
}: {
  heightPx?: number;
}) {
  const markers = useMemo(
    () =>
      Array.from({ length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 }, (_, index) => {
        const hour = SCHEDULE_START_HOUR + index;
        return {
          key: hour,
          label: `${hour.toString().padStart(2, '0')}:00`,
          topPx: (hour - SCHEDULE_START_HOUR) * 60 * SCHEDULE_PIXELS_PER_MINUTE,
        };
      }),
    [],
  );

  return (
    <div
      className="sticky left-0 z-20 relative border-r border-slate-200 bg-white"
      style={{ width: TIME_GUTTER_WIDTH_PX, minWidth: TIME_GUTTER_WIDTH_PX, height: heightPx }}
      aria-hidden="true"
    >
      {markers.map((marker) => (
        <div key={marker.key}>
          <div
            className="absolute left-0 right-0 border-t border-slate-200"
            style={{ top: Math.min(marker.topPx, Math.max(heightPx - 1, 0)) }}
          />
          <span
            className="absolute left-2 rounded bg-white px-1 text-[11px] font-medium text-slate-500"
            style={{
              top: Math.min(Math.max(marker.topPx - 8, 0), Math.max(heightPx - 18, 0)),
            }}
          >
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  );
});
