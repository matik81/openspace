'use client';

import { DateTime } from 'luxon';
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BookingBlock } from '@/components/bookings/BookingBlock';
import {
  RoomColumns,
  ROOM_COLUMN_HEADER_HEIGHT_PX,
} from '@/components/calendar/RoomColumns';
import { TimeGutter, TIME_GUTTER_WIDTH_PX } from '@/components/calendar/TimeGutter';
import {
  bookingToLocalRange,
  clampRangeToSchedule,
  formatSelectedDateLabel,
  formatSelectedDateSubLabel,
  formatTimeRangeLabel,
  hasRoomOverlap,
  SCHEDULE_END_MINUTES,
  SCHEDULE_INTERVAL_MINUTES,
  SCHEDULE_PIXELS_PER_MINUTE,
  SCHEDULE_ROW_MIN_HEIGHT_PX,
  SCHEDULE_START_MINUTES,
} from '@/lib/time';
import type { BookingListItem, RoomItem } from '@/lib/types';

type PositionedBooking = {
  booking: BookingListItem;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  timeLabel: string;
};

type ActiveInteraction = {
  kind: 'drag' | 'resize-start' | 'resize-end';
  bookingId: string;
  originClientX: number;
  originClientY: number;
  originRoomId: string;
  originStartMinutes: number;
  originEndMinutes: number;
  didMove: boolean;
};

type PreviewState = {
  bookingId: string;
  title: string;
  subtitle: string | null;
  roomId: string;
  startMinutes: number;
  endMinutes: number;
  hasConflict: boolean;
};

type CreateDraftPreview = {
  roomId: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string | null;
  hasConflict?: boolean;
};

export function DaySchedule({
  rooms,
  bookings,
  timezone,
  selectedDateKey,
  editableBookingIds,
  selectedBookingId,
  isMutating,
  onPrevDay,
  onNextDay,
  onToday,
  createDraftPreview,
  onCreateSlot,
  onOpenBooking,
  onUpdateBooking,
  onInlineError,
}: {
  rooms: RoomItem[];
  bookings: BookingListItem[];
  timezone: string;
  selectedDateKey: string;
  editableBookingIds: ReadonlySet<string>;
  selectedBookingId: string | null;
  isMutating: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  createDraftPreview?: CreateDraftPreview | null;
  onCreateSlot: (slot: {
    roomId: string;
    startMinutes: number;
    endMinutes: number;
    anchorPoint: { clientX: number; clientY: number };
  }) => void;
  onOpenBooking: (booking: BookingListItem) => void;
  onUpdateBooking: (update: {
    bookingId: string;
    roomId: string;
    startMinutes: number;
    endMinutes: number;
  }) => Promise<void>;
  onInlineError: (message: string) => void;
}) {
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const suppressedClickBookingIdRef = useRef<string | null>(null);
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [commitPreview, setCommitPreview] = useState<PreviewState | null>(null);
  const [committingBookingId, setCommittingBookingId] = useState<string | null>(null);

  const roomsById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const activeBookings = useMemo(
    () => bookings.filter((booking) => booking.status === 'ACTIVE'),
    [bookings],
  );
  const activeBookingsById = useMemo(
    () => new Map(activeBookings.map((booking) => [booking.id, booking])),
    [activeBookings],
  );

  const dayBookingsByRoom = useMemo(() => {
    const byRoom = new Map<string, PositionedBooking[]>();
    for (const room of rooms) {
      byRoom.set(room.id, []);
    }

    for (const booking of activeBookings) {
      const local = bookingToLocalRange(booking, timezone);
      if (!local || local.dateKey !== selectedDateKey) {
        continue;
      }

      const visibleStart = Math.max(local.startMinutes, SCHEDULE_START_MINUTES);
      const visibleEnd = Math.min(local.endMinutes, SCHEDULE_END_MINUTES);
      if (visibleEnd <= visibleStart) {
        continue;
      }

      const list = byRoom.get(booking.roomId);
      if (!list) {
        continue;
      }

      list.push({
        booking,
        startMinutes: local.startMinutes,
        endMinutes: local.endMinutes,
        topPx: (visibleStart - SCHEDULE_START_MINUTES) * SCHEDULE_PIXELS_PER_MINUTE,
        heightPx: Math.max(
          (visibleEnd - visibleStart) * SCHEDULE_PIXELS_PER_MINUTE,
          SCHEDULE_INTERVAL_MINUTES * SCHEDULE_PIXELS_PER_MINUTE,
        ),
        timeLabel: formatTimeRangeLabel(local.startMinutes, local.endMinutes),
      });
    }

    for (const roomBookings of byRoom.values()) {
      roomBookings.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
    }

    return byRoom;
  }, [rooms, activeBookings, timezone, selectedDateKey]);

  const currentTimeOffsetPx = useMemo(() => {
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid || now.toFormat('yyyy-LL-dd') !== selectedDateKey) {
      return null;
    }
    const minutes = now.hour * 60 + now.minute + now.second / 60;
    if (minutes < SCHEDULE_START_MINUTES || minutes > SCHEDULE_END_MINUTES) {
      return null;
    }
    return (minutes - SCHEDULE_START_MINUTES) * SCHEDULE_PIXELS_PER_MINUTE;
  }, [timezone, selectedDateKey]);

  const visibleDateLabel = useMemo(() => formatSelectedDateLabel(selectedDateKey, timezone), [selectedDateKey, timezone]);
  const visibleDateYear = useMemo(() => formatSelectedDateSubLabel(selectedDateKey, timezone), [selectedDateKey, timezone]);

  const getRoomIdFromClientX = useCallback(
    (clientX: number): string | null => {
      if (!columnsRef.current || rooms.length === 0) {
        return null;
      }
      const rect = columnsRef.current.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right) {
        return null;
      }
      const relativeX = clientX - rect.left;
      const columnWidth = rect.width / rooms.length;
      if (columnWidth <= 0) {
        return null;
      }
      const index = Math.max(0, Math.min(rooms.length - 1, Math.floor(relativeX / columnWidth)));
      return rooms[index]?.id ?? null;
    },
    [rooms],
  );

  const computePreviewFromPointer = useCallback(
    (
      currentClientX: number,
      currentClientY: number,
      active: ActiveInteraction,
    ): PreviewState | null => {
      const deltaMinutes =
        Math.round(
          (currentClientY - active.originClientY) /
            (SCHEDULE_PIXELS_PER_MINUTE * SCHEDULE_INTERVAL_MINUTES),
        ) * SCHEDULE_INTERVAL_MINUTES;

      let nextRoomId = active.originRoomId;
      let nextStartMinutes = active.originStartMinutes;
      let nextEndMinutes = active.originEndMinutes;

      if (active.kind === 'drag') {
        const detectedRoomId = getRoomIdFromClientX(currentClientX);
        if (detectedRoomId && roomsById.has(detectedRoomId)) {
          nextRoomId = detectedRoomId;
        }

        const duration = active.originEndMinutes - active.originStartMinutes;
        ({ startMinutes: nextStartMinutes, endMinutes: nextEndMinutes } = clampRangeToSchedule(
          active.originStartMinutes + deltaMinutes,
          active.originStartMinutes + deltaMinutes + duration,
        ));
      } else if (active.kind === 'resize-start') {
        nextStartMinutes = Math.max(
          SCHEDULE_START_MINUTES,
          Math.min(
            active.originEndMinutes - SCHEDULE_INTERVAL_MINUTES,
            active.originStartMinutes + deltaMinutes,
          ),
        );
        nextStartMinutes =
          Math.round(nextStartMinutes / SCHEDULE_INTERVAL_MINUTES) * SCHEDULE_INTERVAL_MINUTES;
      } else {
        nextEndMinutes = Math.min(
          SCHEDULE_END_MINUTES,
          Math.max(
            active.originStartMinutes + SCHEDULE_INTERVAL_MINUTES,
            active.originEndMinutes + deltaMinutes,
          ),
        );
        nextEndMinutes =
          Math.round(nextEndMinutes / SCHEDULE_INTERVAL_MINUTES) * SCHEDULE_INTERVAL_MINUTES;
      }

      const clamped = clampRangeToSchedule(nextStartMinutes, nextEndMinutes);
      const hasConflict = hasRoomOverlap({
        bookings: activeBookings,
        timezone,
        dateKey: selectedDateKey,
        roomId: nextRoomId,
        startMinutes: clamped.startMinutes,
        endMinutes: clamped.endMinutes,
        ignoreBookingId: active.bookingId,
      });

      return {
        bookingId: active.bookingId,
        title: activeBookingsById.get(active.bookingId)?.subject ?? 'Booking',
        subtitle: activeBookingsById.get(active.bookingId)?.createdByDisplayName ?? null,
        roomId: nextRoomId,
        startMinutes: clamped.startMinutes,
        endMinutes: clamped.endMinutes,
        hasConflict,
      };
    },
    [activeBookings, activeBookingsById, getRoomIdFromClientX, roomsById, selectedDateKey, timezone],
  );

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      setInteraction((current) =>
        current
          ? {
              ...current,
              didMove:
                current.didMove ||
                Math.abs(event.clientX - current.originClientX) > 2 ||
                Math.abs(event.clientY - current.originClientY) > 2,
            }
          : current,
      );

      const nextPreview = computePreviewFromPointer(event.clientX, event.clientY, interaction);
      if (nextPreview) {
        setPreview(nextPreview);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const finalPreview = computePreviewFromPointer(event.clientX, event.clientY, interaction);
      const active = interaction;

      setInteraction(null);
      setPreview(null);

      if (!active.didMove || !finalPreview) {
        return;
      }

      const changed =
        finalPreview.roomId !== active.originRoomId ||
        finalPreview.startMinutes !== active.originStartMinutes ||
        finalPreview.endMinutes !== active.originEndMinutes;

      if (!changed) {
        return;
      }

      if (finalPreview.hasConflict) {
        onInlineError('Booking overlaps with an existing active booking.');
        return;
      }

      setCommittingBookingId(active.bookingId);
      setCommitPreview(finalPreview);
      void onUpdateBooking({
        bookingId: active.bookingId,
        roomId: finalPreview.roomId,
        startMinutes: finalPreview.startMinutes,
        endMinutes: finalPreview.endMinutes,
      }).finally(() => {
        setCommittingBookingId((current) => (current === active.bookingId ? null : current));
        setCommitPreview((current) =>
          current?.bookingId === active.bookingId ? null : current,
        );
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [interaction, computePreviewFromPointer, onUpdateBooking, onInlineError]);

  const beginInteraction = (
    event: ReactPointerEvent<HTMLButtonElement>,
    booking: BookingListItem,
    kind: ActiveInteraction['kind'],
  ) => {
    if (isMutating || committingBookingId || !editableBookingIds.has(booking.id)) {
      return;
    }

    const local = bookingToLocalRange(booking, timezone);
    if (!local || local.dateKey !== selectedDateKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setInteraction({
      kind,
      bookingId: booking.id,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originRoomId: booking.roomId,
      originStartMinutes: local.startMinutes,
      originEndMinutes: local.endMinutes,
      didMove: false,
    });
    setPreview({
      bookingId: booking.id,
      title: booking.subject,
      subtitle: booking.createdByDisplayName ?? null,
      roomId: booking.roomId,
      startMinutes: local.startMinutes,
      endMinutes: local.endMinutes,
      hasConflict: false,
    });
  };

  const handleBookingClick = (booking: BookingListItem) => {
    if (suppressedClickBookingIdRef.current === booking.id) {
      suppressedClickBookingIdRef.current = null;
      return;
    }
    onOpenBooking(booking);
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }
    if (interaction.didMove) {
      suppressedClickBookingIdRef.current = interaction.bookingId;
    }
  }, [interaction]);

  const handleEmptySlotClick = (
    roomId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (isMutating || committingBookingId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = SCHEDULE_START_MINUTES + relativeY / SCHEDULE_PIXELS_PER_MINUTE;
    const snappedStart = Math.round(rawMinutes / SCHEDULE_INTERVAL_MINUTES) * SCHEDULE_INTERVAL_MINUTES;
    const startMinutes = Math.max(
      SCHEDULE_START_MINUTES,
      Math.min(SCHEDULE_END_MINUTES - SCHEDULE_INTERVAL_MINUTES, snappedStart),
    );
    const endMinutes = Math.min(SCHEDULE_END_MINUTES, startMinutes + 60);
    onCreateSlot({
      roomId,
      startMinutes,
      endMinutes,
      anchorPoint: { clientX: event.clientX, clientY: event.clientY },
    });
  };

  const renderRoomLayer = (room: RoomItem) => {
    const roomBookings = dayBookingsByRoom.get(room.id) ?? [];
    const effectivePreview = preview ?? commitPreview;
    const hiddenBookingId = effectivePreview?.bookingId ?? null;

    return (
      <>
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-cell"
          onPointerDown={(event) => handleEmptySlotClick(room.id, event)}
          aria-label={`Create booking in ${room.name}`}
        />

        {roomBookings.map((item) => {
          if (hiddenBookingId === item.booking.id) {
            return null;
          }
          const isMine = editableBookingIds.has(item.booking.id);
          return (
            <BookingBlock
              key={item.booking.id}
              title={item.booking.subject}
              subtitle={item.booking.createdByDisplayName}
              meta={item.timeLabel}
              layout={{ topPx: item.topPx, heightPx: item.heightPx }}
              variant={isMine ? 'mine' : 'default'}
              isInteractive={isMine}
              isSelected={selectedBookingId === item.booking.id}
              showResizeHandles={isMine}
              onClick={() => handleBookingClick(item.booking)}
              onDragPointerDown={
                isMine ? (event) => beginInteraction(event, item.booking, 'drag') : undefined
              }
              onResizePointerDown={
                isMine
                  ? (edge, event) =>
                      beginInteraction(
                        event,
                        item.booking,
                        edge === 'start' ? 'resize-start' : 'resize-end',
                      )
                  : undefined
              }
            />
          );
        })}

        {effectivePreview && effectivePreview.roomId === room.id ? (
          <BookingBlock
            title={effectivePreview.title}
            subtitle={effectivePreview.subtitle}
            meta={formatTimeRangeLabel(effectivePreview.startMinutes, effectivePreview.endMinutes)}
            layout={{
              topPx:
                (effectivePreview.startMinutes - SCHEDULE_START_MINUTES) *
                SCHEDULE_PIXELS_PER_MINUTE,
              heightPx:
                (effectivePreview.endMinutes - effectivePreview.startMinutes) *
                SCHEDULE_PIXELS_PER_MINUTE,
            }}
            variant={effectivePreview.hasConflict ? 'preview-error' : 'preview'}
          />
        ) : null}

        {!effectivePreview && createDraftPreview && createDraftPreview.roomId === room.id ? (
          <BookingBlock
            title={createDraftPreview.title}
            subtitle={createDraftPreview.subtitle ?? null}
            meta={formatTimeRangeLabel(createDraftPreview.startMinutes, createDraftPreview.endMinutes)}
            layout={{
              topPx:
                (createDraftPreview.startMinutes - SCHEDULE_START_MINUTES) *
                SCHEDULE_PIXELS_PER_MINUTE,
              heightPx:
                (createDraftPreview.endMinutes - createDraftPreview.startMinutes) *
                SCHEDULE_PIXELS_PER_MINUTE,
            }}
            variant={createDraftPreview.hasConflict ? 'preview-error' : 'mine'}
          />
        ) : null}
      </>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-lg font-semibold text-slate-900">{visibleDateLabel}</p>
          <p className="text-xs text-slate-500">
            {visibleDateYear} · {timezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onPrevDay}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Previous day"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onNextDay}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Next day"
          >
            →
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rooms.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">No rooms available for this workspace yet.</div>
        ) : (
          <div className="min-w-[720px]">
            <div className="flex">
              <div className="sticky left-0 z-30 border-r border-slate-200 bg-white" style={{ width: TIME_GUTTER_WIDTH_PX, minWidth: TIME_GUTTER_WIDTH_PX }}>
                <div
                  className="sticky top-0 z-30 border-b border-slate-200 bg-white"
                  style={{ height: ROOM_COLUMN_HEADER_HEIGHT_PX }}
                />
                <TimeGutter />
              </div>
              <div className="min-w-0 flex-1">
                <RoomColumns
                  rooms={rooms}
                  trackHeightPx={SCHEDULE_ROW_MIN_HEIGHT_PX}
                  currentTimeOffsetPx={currentTimeOffsetPx}
                  columnContainerRef={columnsRef}
                  renderRoomLayer={renderRoomLayer}
                  headerHeightPx={ROOM_COLUMN_HEADER_HEIGHT_PX}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
