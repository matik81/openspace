'use client';

import { memo } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { RoomItem } from '@/lib/types';

export const ROOM_COLUMN_MIN_WIDTH_PX = 220;
export const ROOM_COLUMN_HEADER_HEIGHT_PX = 41;

export const RoomColumns = memo(function RoomColumns({
  rooms,
  trackHeightPx,
  currentTimeOffsetPx,
  columnContainerRef,
  renderRoomLayer,
  headerHeightPx = ROOM_COLUMN_HEADER_HEIGHT_PX,
}: {
  rooms: RoomItem[];
  trackHeightPx: number;
  currentTimeOffsetPx: number | null;
  columnContainerRef?: RefObject<HTMLDivElement>;
  renderRoomLayer: (room: RoomItem, index: number) => ReactNode;
  headerHeightPx?: number;
}) {
  return (
    <div
      ref={columnContainerRef}
      className="grid min-w-0"
      style={{
        gridTemplateColumns: `repeat(${Math.max(rooms.length, 1)}, minmax(${ROOM_COLUMN_MIN_WIDTH_PX}px, 1fr))`,
      }}
    >
      {rooms.map((room, index) => (
        <div key={room.id} className="min-w-0 border-r border-slate-200 last:border-r-0">
          <div
            className="sticky top-0 z-20 flex items-center border-b border-slate-200 bg-white/95 px-3 backdrop-blur"
            style={{ height: headerHeightPx }}
          >
            <p className="truncate text-sm font-semibold text-slate-900">{room.name}</p>
          </div>
          <div className="relative" style={{ height: trackHeightPx }}>
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: '#f8fafc',
                backgroundImage: [
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 14px, rgba(148,163,184,0.12) 14px, rgba(148,163,184,0.12) 15px)',
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(148,163,184,0.20) 29px, rgba(148,163,184,0.20) 30px)',
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 59px, rgba(100,116,139,0.28) 59px, rgba(100,116,139,0.28) 60px)',
                ].join(', '),
              }}
            />
            {currentTimeOffsetPx !== null ? (
              <div
                className="absolute left-0 right-0 z-10 border-t border-rose-400"
                style={{ top: currentTimeOffsetPx }}
                aria-hidden="true"
              />
            ) : null}
            {renderRoomLayer(room, index)}
          </div>
        </div>
      ))}
    </div>
  );
});
