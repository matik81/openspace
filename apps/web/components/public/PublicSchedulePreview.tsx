'use client';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { BookingBlock } from '@/components/bookings/BookingBlock';
import { RoomColumns, ROOM_COLUMN_HEADER_HEIGHT_PX } from '@/components/calendar/RoomColumns';
import { TimeGutter, TIME_GUTTER_WIDTH_PX } from '@/components/calendar/TimeGutter';
import { scheduleRowMinHeightPx, type ScheduleWindow } from '@/lib/time';
import type { RoomItem } from '@/lib/types';

const PUBLIC_TIMEZONE = 'Europe/Rome';
const PUBLIC_SCHEDULE: ScheduleWindow = {
  startHour: 8,
  endHour: 20,
};

const PLACEHOLDER_ROOMS: RoomItem[] = [
  { id: 'room-focus', workspaceId: 'public-demo', name: 'Focus Room', description: null, createdAt: '', updatedAt: '' },
  { id: 'room-collab', workspaceId: 'public-demo', name: 'Collab Hub', description: null, createdAt: '', updatedAt: '' },
  { id: 'room-board', workspaceId: 'public-demo', name: 'Board Room', description: null, createdAt: '', updatedAt: '' },
];

const PLACEHOLDER_BOOKINGS = [
  { id: 'placeholder-1', roomId: 'room-focus', title: 'Product sync', subtitle: 'Giulia Rossi', meta: '09:00-10:30', startMinutes: 540, endMinutes: 630, variant: 'default' as const },
  { id: 'placeholder-2', roomId: 'room-collab', title: 'Sprint planning', subtitle: 'Marco Bianchi', meta: '11:00-12:00', startMinutes: 660, endMinutes: 720, variant: 'mine' as const },
  { id: 'placeholder-3', roomId: 'room-board', title: 'Town hall', subtitle: 'Sara Conti', meta: '15:00-16:30', startMinutes: 900, endMinutes: 990, variant: 'default' as const },
];

export function PublicSchedulePreview({
  selectedDateLabel,
  selectedDateSubLabel,
}: {
  selectedDateLabel: string;
  selectedDateSubLabel: string;
}) {
  const trackHeightPx = scheduleRowMinHeightPx(PUBLIC_SCHEDULE);
  const currentTimeOffsetPx = useMemo(() => {
    const now = DateTime.now().setZone(PUBLIC_TIMEZONE);
    const minutes = now.hour * 60 + now.minute + now.second / 60;
    const scheduleStart = PUBLIC_SCHEDULE.startHour * 60;
    const scheduleEnd = PUBLIC_SCHEDULE.endHour * 60;
    if (minutes < scheduleStart || minutes > scheduleEnd) {
      return null;
    }
    return minutes - scheduleStart;
  }, []);

  function renderRoomLayer(room: RoomItem) {
    const roomBookings = PLACEHOLDER_BOOKINGS.filter((booking) => booking.roomId === room.id);

    return (
      <>
        <div className="absolute inset-0 z-0 cursor-default" aria-hidden="true" />
        {roomBookings.map((booking) => (
          <BookingBlock
            key={booking.id}
            bookingId={booking.id}
            title={booking.title}
            subtitle={booking.subtitle}
            meta={booking.meta}
            layout={{
              topPx: booking.startMinutes - PUBLIC_SCHEDULE.startHour * 60,
              heightPx: booking.endMinutes - booking.startMinutes,
            }}
            variant={booking.variant}
          />
        ))}
      </>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-lg font-semibold text-slate-900">{selectedDateLabel}</p>
          <p className="text-xs text-slate-500">
            {selectedDateSubLabel} | {PUBLIC_TIMEZONE}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[720px]">
          <div className="flex">
            <div
              className="sticky left-0 z-30 border-r border-slate-200 bg-white"
              style={{ width: TIME_GUTTER_WIDTH_PX, minWidth: TIME_GUTTER_WIDTH_PX }}
            >
              <div
                className="sticky top-0 z-30 border-b border-slate-200 bg-white"
                style={{ height: ROOM_COLUMN_HEADER_HEIGHT_PX }}
              />
              <TimeGutter schedule={PUBLIC_SCHEDULE} heightPx={trackHeightPx} />
            </div>
            <div className="min-w-0 flex-1">
              <RoomColumns
                rooms={PLACEHOLDER_ROOMS}
                trackHeightPx={trackHeightPx}
                currentTimeOffsetPx={currentTimeOffsetPx}
                renderRoomLayer={renderRoomLayer}
                headerHeightPx={ROOM_COLUMN_HEADER_HEIGHT_PX}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
