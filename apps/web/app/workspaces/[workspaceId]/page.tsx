'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DateTime } from 'luxon';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceShell, WorkspaceShellRenderContext } from '@/components/workspace-shell';
import { normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import type {
  BookingCriticality,
  BookingListItem,
  ErrorPayload,
  RoomItem,
  WorkspaceItem,
} from '@/lib/types';
import { isBookingListPayload, isRoomListPayload } from '@/lib/workspace-payloads';
import {
  addHoursToTimeInput,
  dateAndTimeToUtcIso,
  formatUtcInTimezone,
  formatUtcRangeInTimezone,
  quantizeTimeInputToMinuteStep,
  workspaceTodayDateInput,
} from '@/lib/workspace-time';

type WorkspacePageParams = {
  workspaceId: string;
};

type BookingFormState = {
  roomId: string;
  subject: string;
  criticality: BookingCriticality;
  dateLocal: string;
  startTimeLocal: string;
  endTimeLocal: string;
};

const BOOKING_TIME_STEP_MINUTES = 15;
const BOOKING_TIME_START_HOUR = 7;
const BOOKING_TIME_END_HOUR = 22;
const BOOKING_TIME_OPTIONS = Array.from(
  {
    length:
      ((BOOKING_TIME_END_HOUR - BOOKING_TIME_START_HOUR) * 60) / BOOKING_TIME_STEP_MINUTES + 1,
  },
  (_, index) => {
    const totalMinutes = BOOKING_TIME_START_HOUR * 60 + index * BOOKING_TIME_STEP_MINUTES;
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');

    return `${hours}:${minutes}`;
  },
);

const bookingFormInitialState: BookingFormState = {
  roomId: '',
  subject: '',
  criticality: 'MEDIUM',
  dateLocal: '',
  startTimeLocal: '',
  endTimeLocal: '',
};

const DAY_SCHEDULE_PIXELS_PER_MINUTE = 1;
const DAY_SCHEDULE_TOTAL_MINUTES = (BOOKING_TIME_END_HOUR - BOOKING_TIME_START_HOUR) * 60;
const DAY_SCHEDULE_TRACK_HEIGHT_PX = DAY_SCHEDULE_TOTAL_MINUTES * DAY_SCHEDULE_PIXELS_PER_MINUTE;
const DAY_SCHEDULE_TIME_COLUMN_PX = 72;
const DAY_SCHEDULE_ROOM_COLUMN_MIN_PX = 220;
const DAY_SCHEDULE_VIEWPORT_MAX_HEIGHT_REM = 30;
const SCHEDULE_CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type DaySchedulePositionedBooking = {
  booking: BookingListItem;
  topPx: number;
  heightPx: number;
  timeLabel: string;
};

function WorkspaceCurrentDaySchedule({
  rooms,
  bookings,
  myBookingIds,
  timezone,
  isLoading,
  isReady,
  selectedDateKey,
  onSelectDateKey,
  onSelectCalendarMonthKey,
}: {
  rooms: RoomItem[];
  bookings: BookingListItem[];
  myBookingIds: ReadonlySet<string>;
  timezone: string;
  isLoading: boolean;
  isReady: boolean;
  selectedDateKey: string;
  onSelectDateKey: (value: string) => void;
  calendarMonthKey: string;
  onSelectCalendarMonthKey: (value: string) => void;
}) {
  const todayDateKey = workspaceTodayDateInput(timezone);
  const bottomScheduleScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedDate = useMemo(() => {
    const parsed = DateTime.fromISO(selectedDateKey, { zone: timezone });
    return parsed.isValid ? parsed : DateTime.now().setZone(timezone);
  }, [selectedDateKey, timezone]);

  const scheduleDateLabel = useMemo(
    () => (selectedDate.isValid ? selectedDate.toFormat('cccc, dd LLL yyyy') : selectedDateKey),
    [selectedDate, selectedDateKey],
  );

  const hourMarkers = useMemo(
    () =>
      Array.from({ length: BOOKING_TIME_END_HOUR - BOOKING_TIME_START_HOUR + 1 }, (_, index) => {
        const hour = BOOKING_TIME_START_HOUR + index;
        return {
          hour,
          label: `${hour.toString().padStart(2, '0')}:00`,
          offsetPx: (hour - BOOKING_TIME_START_HOUR) * 60 * DAY_SCHEDULE_PIXELS_PER_MINUTE,
        };
      }),
    [],
  );

  const { bookingsByRoomId, totalBookingsSelectedDate, currentTimeOffsetPx } = useMemo(() => {
    const grouped = new Map<string, DaySchedulePositionedBooking[]>();
    for (const room of rooms) grouped.set(room.id, []);

    let total = 0;
    for (const booking of bookings) {
      if (booking.status !== 'ACTIVE') continue;

      const start = DateTime.fromISO(booking.startAt, { zone: 'utc' }).setZone(timezone);
      const end = DateTime.fromISO(booking.endAt, { zone: 'utc' }).setZone(timezone);
      if (!start.isValid || !end.isValid) continue;
      if (start.toFormat('yyyy-LL-dd') !== selectedDateKey) continue;

      const trackStartMinutes = BOOKING_TIME_START_HOUR * 60;
      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = end.hour * 60 + end.minute;
      const clampedStartMinutes = Math.max(0, startMinutes - trackStartMinutes);
      const clampedEndMinutes = Math.min(DAY_SCHEDULE_TOTAL_MINUTES, endMinutes - trackStartMinutes);
      const visibleDurationMinutes = clampedEndMinutes - clampedStartMinutes;
      if (visibleDurationMinutes <= 0) continue;

      const roomBookings = grouped.get(booking.roomId);
      if (!roomBookings) continue;

      roomBookings.push({
        booking,
        topPx: clampedStartMinutes * DAY_SCHEDULE_PIXELS_PER_MINUTE,
        heightPx: visibleDurationMinutes * DAY_SCHEDULE_PIXELS_PER_MINUTE,
        timeLabel: `${start.toFormat('HH:mm')} - ${end.toFormat('HH:mm')}`,
      });
      total += 1;
    }

    for (const roomBookings of grouped.values()) {
      roomBookings.sort((left, right) => left.topPx - right.topPx);
    }

    const now = DateTime.now().setZone(timezone);
    let nowOffsetPx: number | null = null;
    if (now.isValid && selectedDateKey === todayDateKey) {
      const minutesFromMidnight = now.hour * 60 + now.minute + now.second / 60;
      const trackStartMinutes = BOOKING_TIME_START_HOUR * 60;
      const trackEndMinutes = BOOKING_TIME_END_HOUR * 60;
      if (minutesFromMidnight >= trackStartMinutes && minutesFromMidnight <= trackEndMinutes) {
        nowOffsetPx = (minutesFromMidnight - trackStartMinutes) * DAY_SCHEDULE_PIXELS_PER_MINUTE;
      }
    }

    return { bookingsByRoomId: grouped, totalBookingsSelectedDate: total, currentTimeOffsetPx: nowOffsetPx };
  }, [bookings, rooms, selectedDateKey, timezone, todayDateKey]);

  const gridTemplateColumns = `${DAY_SCHEDULE_TIME_COLUMN_PX}px repeat(${Math.max(
    rooms.length,
    1,
  )}, minmax(${DAY_SCHEDULE_ROOM_COLUMN_MIN_PX}px, 1fr))`;
  const scheduleTableMinWidthPx =
    DAY_SCHEDULE_TIME_COLUMN_PX + rooms.length * DAY_SCHEDULE_ROOM_COLUMN_MIN_PX;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">Room Schedule</h3>
          <p className="mt-1 text-sm text-slate-600">
            {scheduleDateLabel} in {timezone}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => {
              const nextDate = selectedDate.minus({ days: 1 });
              onSelectDateKey(nextDate.toFormat('yyyy-LL-dd'));
              onSelectCalendarMonthKey(nextDate.toFormat('yyyy-LL'));
            }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Prev day</button>
            <button type="button" onClick={() => {
              onSelectDateKey(todayDateKey);
              onSelectCalendarMonthKey(todayDateKey.slice(0, 7));
            }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Today</button>
            <button type="button" onClick={() => {
              const nextDate = selectedDate.plus({ days: 1 });
              onSelectDateKey(nextDate.toFormat('yyyy-LL-dd'));
              onSelectCalendarMonthKey(nextDate.toFormat('yyyy-LL'));
            }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Next day</button>
            <div className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Meetings</p>
              <p className="text-sm font-semibold text-slate-900">{totalBookingsSelectedDate}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 min-w-0">
        {isLoading && !isReady ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
            <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="h-[320px] animate-pulse rounded-lg bg-slate-100" /></div>
          </div>
        ) : null}

        {!isLoading && isReady && rooms.length === 0 ? (
          <p className="text-sm text-slate-600">No rooms available for this workspace yet.</p>
        ) : null}

        {isReady && rooms.length > 0 ? (
          <div className="min-w-0 space-y-3">
            <div
              ref={bottomScheduleScrollRef}
              className="max-w-full overflow-auto pb-1"
              style={{ maxHeight: `${DAY_SCHEDULE_VIEWPORT_MAX_HEIGHT_REM}rem` }}
            >
              <div className="rounded-xl border border-slate-200 bg-white" style={{ minWidth: `${scheduleTableMinWidthPx}px` }}>
                <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm" style={{ gridTemplateColumns }}>
                  <div className="sticky left-0 z-30 border-r border-slate-200 bg-slate-50/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Time</div>
                  {rooms.map((room) => (
                    <div key={room.id} className="border-r border-slate-200 px-3 py-2 last:border-r-0">
                      <p className="text-sm font-semibold text-slate-900">{room.name}</p>
                      <p className="text-xs text-slate-500">{(bookingsByRoomId.get(room.id) ?? []).length} meeting{(bookingsByRoomId.get(room.id) ?? []).length === 1 ? '' : 's'}</p>
                    </div>
                  ))}
                </div>

                <div className="grid" style={{ gridTemplateColumns }}>
                  <div className="sticky left-0 z-10 relative border-r border-slate-200 bg-slate-50" style={{ height: DAY_SCHEDULE_TRACK_HEIGHT_PX }}>
                    {hourMarkers.map((marker) => {
                      const lineTopPx = Math.min(marker.offsetPx, DAY_SCHEDULE_TRACK_HEIGHT_PX - 1);
                      const labelTopPx = Math.min(Math.max(lineTopPx - 8, 0), DAY_SCHEDULE_TRACK_HEIGHT_PX - 18);
                      return (
                        <div key={marker.hour}>
                          <div className="absolute left-0 right-0 border-t border-slate-300" style={{ top: lineTopPx }} />
                          <span className="absolute left-2 rounded bg-slate-50 px-1 text-[11px] font-medium text-slate-600" style={{ top: labelTopPx }}>{marker.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {rooms.map((room) => {
                    const roomBookings = bookingsByRoomId.get(room.id) ?? [];
                    return (
                      <div key={room.id} className="relative border-r border-slate-200 last:border-r-0" style={{ height: DAY_SCHEDULE_TRACK_HEIGHT_PX }}>
                        <div className="absolute inset-0" style={{ backgroundColor: '#f8fafc', backgroundImage: ['repeating-linear-gradient(to bottom, transparent 0, transparent 4px, rgba(148,163,184,0.1) 4px, rgba(148,163,184,0.1) 5px)','repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(148,163,184,0.18) 29px, rgba(148,163,184,0.18) 30px)','repeating-linear-gradient(to bottom, transparent 0, transparent 59px, rgba(100,116,139,0.28) 59px, rgba(100,116,139,0.28) 60px)'].join(', ') }} />
                        {currentTimeOffsetPx !== null ? (<div className="absolute left-0 right-0 z-10 border-t border-rose-400/80" style={{ top: currentTimeOffsetPx }} />) : null}
                        {roomBookings.map(({ booking, topPx, heightPx, timeLabel }) => (
                          <div key={booking.id} title={`${booking.subject} • ${booking.createdByDisplayName} • ${timeLabel}`} className={`absolute left-2 right-2 overflow-hidden rounded-lg border px-2 py-1 shadow-sm ${myBookingIds.has(booking.id) ? 'ring-2 ring-brand/60 ring-offset-1' : ''} ${getScheduleBookingCardClasses(booking.criticality, myBookingIds.has(booking.id))}`} style={{ top: topPx, height: heightPx, minHeight: heightPx }}>
                            <p className="truncate text-xs font-semibold leading-tight">{booking.subject}</p>
                            <p className="mt-0.5 truncate text-[11px] leading-tight opacity-90">{booking.createdByDisplayName}</p>
                            {heightPx >= 42 ? (<p className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide opacity-80">{timeLabel}</p>) : null}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoading && isReady && rooms.length > 0 && totalBookingsSelectedDate === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No meetings scheduled for {selectedDateKey}.</p>
        ) : null}
      </div>
    </section>
  );
}

function WorkspaceScheduleCalendar({
  timezone,
  bookings,
  selectedDateKey,
  onSelectDateKey,
  calendarMonthKey,
  onSelectCalendarMonthKey,
}: {
  timezone: string;
  bookings: BookingListItem[];
  selectedDateKey: string;
  onSelectDateKey: (value: string) => void;
  calendarMonthKey: string;
  onSelectCalendarMonthKey: (value: string) => void;
}) {
  const todayDateKey = workspaceTodayDateInput(timezone);
  const calendarMonth = useMemo(() => {
    const parsed = DateTime.fromISO(`${calendarMonthKey}-01`, { zone: timezone });
    return parsed.isValid ? parsed.startOf('month') : DateTime.now().setZone(timezone).startOf('month');
  }, [calendarMonthKey, timezone]);

  const bookingCountByDateKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      if (booking.status !== 'ACTIVE') continue;
      const start = DateTime.fromISO(booking.startAt, { zone: 'utc' }).setZone(timezone);
      if (!start.isValid) continue;
      const dateKey = start.toFormat('yyyy-LL-dd');
      counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    }
    return counts;
  }, [bookings, timezone]);

  const calendarDayCells = useMemo(() => {
    const monthStart = calendarMonth.startOf('month');
    const gridStart = monthStart.minus({ days: monthStart.weekday - 1 });
    return Array.from({ length: 42 }, (_, index) => {
      const day = gridStart.plus({ days: index });
      const dateKey = day.toFormat('yyyy-LL-dd');
      return {
        dateKey,
        dayNumber: day.day,
        isCurrentMonth: day.month === monthStart.month,
        isToday: dateKey === todayDateKey,
        isSelected: dateKey === selectedDateKey,
        meetingCount: bookingCountByDateKey.get(dateKey) ?? 0,
      };
    });
  }, [bookingCountByDateKey, calendarMonth, selectedDateKey, todayDateKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</p>
      <p className="mt-1 text-sm text-slate-900">{timezone}</p>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onSelectCalendarMonthKey(calendarMonth.minus({ months: 1 }).toFormat('yyyy-LL'))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" aria-label="Previous month">{'<'}</button>
          <p className="text-sm font-semibold text-slate-900">{calendarMonth.toFormat('LLLL yyyy')}</p>
          <button type="button" onClick={() => onSelectCalendarMonthKey(calendarMonth.plus({ months: 1 }).toFormat('yyyy-LL'))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" aria-label="Next month">{'>'}</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {SCHEDULE_CALENDAR_WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          ))}
          {calendarDayCells.map((cell) => (
            <button key={cell.dateKey} type="button" onClick={() => { onSelectDateKey(cell.dateKey); onSelectCalendarMonthKey(cell.dateKey.slice(0, 7)); }} className={`relative h-8 rounded-md border text-xs font-medium transition ${cell.isSelected ? 'border-brand bg-cyan-100 text-cyan-900' : cell.isToday ? 'border-slate-400 bg-white text-slate-900' : cell.isCurrentMonth ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100' : 'border-transparent bg-transparent text-slate-400 hover:bg-white/60'}`} aria-label={`Select ${cell.dateKey}`}>
              <span>{cell.dayNumber}</span>
              {cell.meetingCount > 0 ? (<span className={`absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${cell.isSelected ? 'bg-cyan-700' : 'bg-slate-500'}`} />) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function getScheduleBookingCardClasses(
  criticality: BookingCriticality,
  isMine: boolean,
): string {
  if (isMine) {
    return 'border-amber-300 bg-amber-100 text-amber-950';
  }

  switch (criticality) {
    case 'HIGH':
      return 'border-rose-300 bg-rose-100 text-rose-900';
    case 'LOW':
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    case 'MEDIUM':
    default:
      return 'border-cyan-300 bg-cyan-100 text-cyan-900';
  }
}

export default function WorkspacePage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params.workspaceId;

  return (
    <WorkspaceShell
      selectedWorkspaceId={workspaceId}
      pageTitle="Workspace"
      pageDescription="Reservation flow for active members and invitation management for pending access."
    >
      {(context) => WorkspaceMemberContent({ context, workspaceId })}
    </WorkspaceShell>
  );
}

function WorkspaceMemberContent({
  context,
  workspaceId,
}: {
  context: WorkspaceShellRenderContext;
  workspaceId: string;
}) {
  const { selectedWorkspace, isLoading, runInvitationAction, pendingInvitationAction } = context;
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [scheduleBookings, setScheduleBookings] = useState<BookingListItem[]>([]);
  const [localError, setLocalError] = useState<ErrorPayload | null>(null);
  const [localBanner, setLocalBanner] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isLoadingScheduleBookings, setIsLoadingScheduleBookings] = useState(false);
  const [hasLoadedRoomsOnce, setHasLoadedRoomsOnce] = useState(false);
  const [hasLoadedScheduleBookingsOnce, setHasLoadedScheduleBookingsOnce] = useState(false);
  const [selectedScheduleDateKey, setSelectedScheduleDateKey] = useState('');
  const [scheduleCalendarMonthKey, setScheduleCalendarMonthKey] = useState('');
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(bookingFormInitialState);

  const isPendingInvitationOnly =
    selectedWorkspace?.membership === null &&
    selectedWorkspace?.invitation?.status === 'PENDING';
  const isActiveMember = selectedWorkspace?.membership?.status === 'ACTIVE';

  const loadRooms = useCallback(async (workspace: WorkspaceItem) => {
    setIsLoadingRooms(true);
    const response = await fetch(`/api/workspaces/${workspace.id}/rooms`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await safeReadJson(response);

    if (!response.ok) {
      setLocalError(normalizeErrorPayload(payload, response.status));
      setRooms([]);
      setHasLoadedRoomsOnce(true);
      setIsLoadingRooms(false);
      return;
    }

    if (!isRoomListPayload(payload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected rooms payload',
      });
      setRooms([]);
      setHasLoadedRoomsOnce(true);
      setIsLoadingRooms(false);
      return;
    }

    setRooms(payload.items);
    setHasLoadedRoomsOnce(true);
    setIsLoadingRooms(false);
  }, []);

  const loadBookings = useCallback(
    async (workspace: WorkspaceItem, options: { includePast: boolean }) => {
      setIsLoadingBookings(true);
      const query = new URLSearchParams({
        mine: 'true',
        includePast: String(options.includePast),
      });

      const response = await fetch(`/api/workspaces/${workspace.id}/bookings?${query.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(payload, response.status));
        setBookings([]);
        setIsLoadingBookings(false);
        return;
      }

      if (!isBookingListPayload(payload)) {
        setLocalError({
          code: 'BAD_GATEWAY',
          message: 'Unexpected bookings payload',
        });
        setBookings([]);
        setIsLoadingBookings(false);
        return;
      }

      setBookings(payload.items);
      setIsLoadingBookings(false);
    },
    [],
  );

  const loadScheduleBookings = useCallback(async (workspace: WorkspaceItem) => {
    setIsLoadingScheduleBookings(true);
    const query = new URLSearchParams({
      mine: 'false',
      includePast: 'true',
    });

    const response = await fetch(`/api/workspaces/${workspace.id}/bookings?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await safeReadJson(response);

    if (!response.ok) {
      setLocalError(normalizeErrorPayload(payload, response.status));
      setScheduleBookings([]);
      setHasLoadedScheduleBookingsOnce(true);
      setIsLoadingScheduleBookings(false);
      return;
    }

    if (!isBookingListPayload(payload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected bookings payload',
      });
      setScheduleBookings([]);
      setHasLoadedScheduleBookingsOnce(true);
      setIsLoadingScheduleBookings(false);
      return;
    }

    setScheduleBookings(payload.items);
    setHasLoadedScheduleBookingsOnce(true);
    setIsLoadingScheduleBookings(false);
  }, []);

  useEffect(() => {
    setLocalBanner(null);
    setLocalError(null);

    if (!selectedWorkspace || !isActiveMember) {
      setRooms([]);
      setBookings([]);
      setScheduleBookings([]);
      setHasLoadedRoomsOnce(false);
      setHasLoadedScheduleBookingsOnce(false);
      return;
    }

    void loadRooms(selectedWorkspace);
    void loadBookings(selectedWorkspace, {
      includePast,
    });
    void loadScheduleBookings(selectedWorkspace);
  }, [selectedWorkspace, isActiveMember, includePast, loadBookings, loadRooms, loadScheduleBookings]);

  useEffect(() => {
    if (!rooms.length) {
      setBookingForm((previous) => ({
        ...previous,
        roomId: '',
      }));
      return;
    }

    setBookingForm((previous) => ({
      ...previous,
      roomId: previous.roomId || rooms[0].id,
    }));
  }, [rooms]);

  useEffect(() => {
    if (!selectedWorkspace || !isActiveMember) {
      return;
    }

    const today = workspaceTodayDateInput(selectedWorkspace.timezone);
    setBookingForm((previous) => ({
      ...previous,
      dateLocal: previous.dateLocal || today,
    }));
  }, [selectedWorkspace, isActiveMember]);

  useEffect(() => {
    if (!selectedWorkspace || !isActiveMember) {
      setSelectedScheduleDateKey('');
      setScheduleCalendarMonthKey('');
      return;
    }

    const today = workspaceTodayDateInput(selectedWorkspace.timezone);
    setSelectedScheduleDateKey(today);
    setScheduleCalendarMonthKey(today.slice(0, 7));
  }, [selectedWorkspace, isActiveMember]);

  const handleCreateBooking = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isActiveMember || isCreatingBooking) {
        return;
      }

      if (!bookingForm.dateLocal || !bookingForm.startTimeLocal || !bookingForm.endTimeLocal) {
        setLocalError({
          code: 'BAD_REQUEST',
          message: 'date, start time, and end time are required',
        });
        return;
      }

      const startTimeLocal =
        quantizeTimeInputToMinuteStep(bookingForm.startTimeLocal, BOOKING_TIME_STEP_MINUTES) ??
        bookingForm.startTimeLocal;
      const endTimeLocal =
        quantizeTimeInputToMinuteStep(bookingForm.endTimeLocal, BOOKING_TIME_STEP_MINUTES) ??
        bookingForm.endTimeLocal;
      const startLocal = `${bookingForm.dateLocal}T${startTimeLocal}`;
      const endLocal = `${bookingForm.dateLocal}T${endTimeLocal}`;
      if (endLocal <= startLocal) {
        setLocalError({
          code: 'BAD_REQUEST',
          message: 'End time must be after start time on the selected date',
        });
        return;
      }

      const startAt = dateAndTimeToUtcIso(
        bookingForm.dateLocal,
        startTimeLocal,
        selectedWorkspace.timezone,
      );
      const endAt = dateAndTimeToUtcIso(
        bookingForm.dateLocal,
        endTimeLocal,
        selectedWorkspace.timezone,
      );

      if (!startAt || !endAt) {
        setLocalError({
          code: 'BAD_REQUEST',
          message: 'Date and time values must be valid in the workspace timezone',
        });
        return;
      }

      setIsCreatingBooking(true);
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          roomId: bookingForm.roomId,
          subject: bookingForm.subject,
          criticality: bookingForm.criticality,
          startAt,
          endAt,
        }),
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(payload, response.status));
        setIsCreatingBooking(false);
        return;
      }

      setLocalBanner('Reservation created.');
      setBookingForm((previous) => ({
        ...previous,
        subject: '',
        dateLocal: workspaceTodayDateInput(selectedWorkspace.timezone),
        startTimeLocal: '',
        endTimeLocal: '',
      }));
      await Promise.all([
        loadBookings(selectedWorkspace, { includePast }),
        loadScheduleBookings(selectedWorkspace),
      ]);
      setIsCreatingBooking(false);
    },
    [
      selectedWorkspace,
      isActiveMember,
      isCreatingBooking,
      bookingForm,
      includePast,
      loadBookings,
      loadScheduleBookings,
    ],
  );

  const handleCancelBooking = useCallback(
    async (bookingId: string) => {
      if (!selectedWorkspace || !isActiveMember || cancellingBookingId) {
        return;
      }

      setCancellingBookingId(bookingId);
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/bookings/${bookingId}/cancel`,
        {
          method: 'POST',
        },
      );
      const payload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(payload, response.status));
        setCancellingBookingId(null);
        return;
      }

      setLocalBanner('Reservation cancelled and removed.');
      await Promise.all([
        loadBookings(selectedWorkspace, { includePast }),
        loadScheduleBookings(selectedWorkspace),
      ]);
      setCancellingBookingId(null);
    },
    [
      selectedWorkspace,
      isActiveMember,
      cancellingBookingId,
      includePast,
      loadBookings,
      loadScheduleBookings,
    ],
  );

  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) => left.name.localeCompare(right.name)),
    [rooms],
  );
  const myBookingIds = useMemo(() => new Set(bookings.map((booking) => booking.id)), [bookings]);
  const isScheduleReady = hasLoadedRoomsOnce && hasLoadedScheduleBookingsOnce;
  const isScheduleLoading =
    isLoadingRooms ||
    isLoadingScheduleBookings ||
    !isScheduleReady;
  const activeScheduleDateKey =
    selectedScheduleDateKey || (selectedWorkspace ? workspaceTodayDateInput(selectedWorkspace.timezone) : '');
  const activeScheduleCalendarMonthKey =
    scheduleCalendarMonthKey || (activeScheduleDateKey ? activeScheduleDateKey.slice(0, 7) : '');
  const minBookingDate = selectedWorkspace
    ? workspaceTodayDateInput(selectedWorkspace.timezone)
    : undefined;
  if (isLoading && !selectedWorkspace) {
    return <p className="text-slate-600">Loading workspace...</p>;
  }

  if (!selectedWorkspace || selectedWorkspace.id !== workspaceId) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        WORKSPACE_NOT_VISIBLE: Workspace not visible.
      </p>
    );
  }

  if (isPendingInvitationOnly && selectedWorkspace.invitation) {
    const isActionInProgress =
      pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id;

    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Pending Invitation</h3>
        <p className="mt-2 text-sm text-slate-700">
          Workspace <span className="font-semibold">{selectedWorkspace.name}</span> is visible as a
          pending invitation.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Expires{' '}
          {formatUtcInTimezone(selectedWorkspace.invitation.expiresAt, selectedWorkspace.timezone)}.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void runInvitationAction(selectedWorkspace.invitation!.id, 'accept')}
            disabled={isActionInProgress}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActionInProgress && pendingInvitationAction?.action === 'accept'
              ? 'Accepting...'
              : 'Accept Invitation'}
          </button>
          <button
            type="button"
            onClick={() => void runInvitationAction(selectedWorkspace.invitation!.id, 'reject')}
            disabled={isActionInProgress}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActionInProgress && pendingInvitationAction?.action === 'reject'
              ? 'Rejecting...'
              : 'Reject Invitation'}
          </button>
        </div>
      </section>
    );
  }

  if (!isActiveMember) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        UNAUTHORIZED: Only active members can manage reservations.
      </p>
    );
  }

  return {
    main: (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{selectedWorkspace.name}</h3>
            <p className="mt-1 text-sm text-slate-600">Timezone: {selectedWorkspace.timezone}</p>
          </div>
          {selectedWorkspace.membership?.role === 'ADMIN' ? (
            <Link
              href={`/workspaces/${selectedWorkspace.id}/admin`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open Admin Panel
            </Link>
          ) : null}
        </div>
      </section>

      {localBanner ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {localBanner}
        </p>
      ) : null}

      {localError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {localError.code}: {localError.message}
        </p>
      ) : null}

      <WorkspaceCurrentDaySchedule
        rooms={sortedRooms}
        bookings={scheduleBookings}
        myBookingIds={myBookingIds}
        timezone={selectedWorkspace.timezone}
        isLoading={isScheduleLoading}
        isReady={isScheduleReady}
        selectedDateKey={activeScheduleDateKey}
        onSelectDateKey={setSelectedScheduleDateKey}
        calendarMonthKey={activeScheduleCalendarMonthKey}
        onSelectCalendarMonthKey={setScheduleCalendarMonthKey}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-semibold text-slate-900">Create Reservation</h3>
        <p className="mt-1 text-sm text-slate-600">
          Input times in workspace local timezone ({selectedWorkspace.timezone}).
        </p>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => void handleCreateBooking(event)}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Meeting Room</span>
            <select
              required
              value={bookingForm.roomId}
              onChange={(event) =>
                setBookingForm((previous) => ({
                  ...previous,
                  roomId: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {sortedRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Criticality</span>
            <select
              required
              value={bookingForm.criticality}
              onChange={(event) =>
                setBookingForm((previous) => ({
                  ...previous,
                  criticality: event.target.value as BookingCriticality,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Subject</span>
            <input
              required
              value={bookingForm.subject}
              onChange={(event) =>
                setBookingForm((previous) => ({
                  ...previous,
                  subject: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
              <input
                required
                type="date"
                min={minBookingDate}
                value={bookingForm.dateLocal}
                onChange={(event) =>
                  setBookingForm((previous) => ({
                    ...previous,
                    dateLocal: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Start Time</span>
              <select
                required
                value={bookingForm.startTimeLocal}
                onChange={(event) => {
                  const nextStartTime =
                    quantizeTimeInputToMinuteStep(event.target.value, BOOKING_TIME_STEP_MINUTES) ??
                    event.target.value;
                  const autoEndTime = addHoursToTimeInput(nextStartTime, 1);

                  setBookingForm((previous) => ({
                    ...previous,
                    startTimeLocal: nextStartTime,
                    endTimeLocal: autoEndTime ?? previous.endTimeLocal,
                  }));
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Select start time</option>
                {BOOKING_TIME_OPTIONS.map((timeValue) => (
                  <option key={timeValue} value={timeValue}>
                    {timeValue}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">End Time</span>
              <select
                required
                value={bookingForm.endTimeLocal}
                onChange={(event) =>
                  setBookingForm((previous) => ({
                    ...previous,
                    endTimeLocal:
                      quantizeTimeInputToMinuteStep(event.target.value, BOOKING_TIME_STEP_MINUTES) ??
                      event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Select end time</option>
                {BOOKING_TIME_OPTIONS.map((timeValue) => (
                  <option key={timeValue} value={timeValue}>
                    {timeValue}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isCreatingBooking || isLoadingRooms || sortedRooms.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingBooking ? 'Creating...' : 'Create Reservation'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">My Reservations</h3>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(event) => setIncludePast(event.target.checked)}
              />
              Include past
            </label>
          </div>
        </div>

        {isLoadingBookings ? <p className="mt-3 text-sm text-slate-600">Loading reservations...</p> : null}

        {!isLoadingBookings && bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No reservations found for the current filters.</p>
        ) : null}

        {!isLoadingBookings && bookings.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {bookings.map((booking) => {
              return (
              <li key={booking.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{booking.subject}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {booking.roomName} â€¢ {booking.criticality} â€¢ {booking.status}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {formatUtcRangeInTimezone(
                        booking.startAt,
                        booking.endAt,
                        selectedWorkspace.timezone,
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCancelBooking(booking.id)}
                    disabled={booking.status !== 'ACTIVE' || cancellingBookingId === booking.id}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancellingBookingId === booking.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
    ),
    rightSidebar: (
      <WorkspaceScheduleCalendar
        timezone={selectedWorkspace.timezone}
        bookings={scheduleBookings}
        selectedDateKey={activeScheduleDateKey}
        onSelectDateKey={setSelectedScheduleDateKey}
        calendarMonthKey={activeScheduleCalendarMonthKey}
        onSelectCalendarMonthKey={setScheduleCalendarMonthKey}
      />
    ),
  };
}


