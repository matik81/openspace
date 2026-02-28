'use client';

import { DateTime } from 'luxon';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DaySchedule } from '@/components/calendar/DaySchedule';
import {
  BookingModal,
  type BookingModalAnchorPoint,
  type BookingModalDraft,
} from '@/components/bookings/BookingModal';
import { WorkspaceRightSidebar as SharedWorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { WorkspaceShell, type WorkspaceShellRenderContext } from '@/components/workspace-shell';
import { normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import {
  addDaysToDateKey,
  bookingToLocalRange,
  buildMarkerCountByDateKey,
  buildMiniCalendarCells,
  formatBookingDateAndTimeInTimezone,
  getBookingConflictMessage,
  groupMyBookingsForSidebar,
  minutesToTimeInput,
  parseDateKey,
  SCHEDULE_INTERVAL_MINUTES,
  scheduleEndMinutes,
  scheduleStartMinutes,
  workspaceTodayDateKey,
} from '@/lib/time';
import type { BookingListItem, ErrorPayload, RoomItem, WorkspaceItem } from '@/lib/types';
import { isBookingListPayload, isRoomListPayload } from '@/lib/workspace-payloads';
import { dateAndTimeToUtcIso, formatUtcInTimezone } from '@/lib/workspace-time';

type WorkspacePageParams = {
  workspaceId: string;
};

type BookingDialogState =
  | {
      open: false;
      mode: 'create' | 'edit';
      bookingId: string | null;
      draft: BookingModalDraft;
      error: ErrorPayload | null;
      isSubmitting: boolean;
      anchorPoint: BookingModalAnchorPoint | null;
    }
  | {
      open: true;
      mode: 'create' | 'edit';
      bookingId: string | null;
      draft: BookingModalDraft;
      error: ErrorPayload | null;
      isSubmitting: boolean;
      anchorPoint: BookingModalAnchorPoint | null;
    };

const emptyBookingDraft: BookingModalDraft = {
  roomId: '',
  subject: '',
  criticality: 'MEDIUM',
  startTimeLocal: '',
  endTimeLocal: '',
};

type WorkspaceSidebarState = {
  dateKey: string;
  monthKey: string;
  bookings: BookingListItem[];
};

const workspaceSidebarStateCache = new Map<string, WorkspaceSidebarState>();

export default function WorkspacePage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params.workspaceId;

  return (
    <WorkspaceShell selectedWorkspaceId={workspaceId} pageTitle="" pageDescription="">
      {(context) => WorkspacePageContent({ context, workspaceId })}
    </WorkspaceShell>
  );
}

function WorkspacePageContent({
  context,
  workspaceId,
}: {
  context: WorkspaceShellRenderContext;
  workspaceId: string;
}) {
  const {
    selectedWorkspace,
    currentUser,
    isLoading,
    runInvitationAction,
    pendingInvitationAction,
  } = context;

  if (isLoading && !selectedWorkspace) {
    return <p className="text-sm text-slate-600">Loading workspace...</p>;
  }

  if (!selectedWorkspace || selectedWorkspace.id !== workspaceId) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        WORKSPACE_NOT_VISIBLE: Workspace not visible.
      </p>
    );
  }

  const isPendingInvitationOnly =
    selectedWorkspace.membership === null && selectedWorkspace.invitation?.status === 'PENDING';
  const isActiveMember = selectedWorkspace.membership?.status === 'ACTIVE';

  if (isPendingInvitationOnly && selectedWorkspace.invitation) {
    const isActionInProgress =
      pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id;

    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Pending Invitation</h2>
        <p className="mt-2 text-sm text-slate-700">
          Workspace <span className="font-semibold">{selectedWorkspace.name}</span> is visible via a
          pending invitation.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Expires{' '}
          {formatUtcInTimezone(selectedWorkspace.invitation.expiresAt, selectedWorkspace.timezone)}.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runInvitationAction(selectedWorkspace.invitation!.id, 'accept')}
            disabled={isActionInProgress}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActionInProgress && pendingInvitationAction?.action === 'accept'
              ? 'Accepting...'
              : 'Accept invitation'}
          </button>
          <button
            type="button"
            onClick={() => void runInvitationAction(selectedWorkspace.invitation!.id, 'reject')}
            disabled={isActionInProgress}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActionInProgress && pendingInvitationAction?.action === 'reject'
              ? 'Rejecting...'
              : 'Reject invitation'}
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

  return WorkspaceBookingDashboard({ workspace: selectedWorkspace, currentUser });
}

function WorkspaceBookingDashboard({
  workspace,
  currentUser,
}: {
  workspace: WorkspaceItem;
  currentUser: WorkspaceShellRenderContext['currentUser'];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timezone = workspace.timezone;
  const schedule = useMemo(
    () => ({
      startHour: workspace.scheduleStartHour,
      endHour: workspace.scheduleEndHour,
    }),
    [workspace.scheduleEndHour, workspace.scheduleStartHour],
  );
  const scheduleStart = scheduleStartMinutes(schedule);
  const scheduleEnd = scheduleEndMinutes(schedule);
  const cachedSidebarState = workspaceSidebarStateCache.get(workspace.id);
  const [dateKey, setDateKey] = useState(
    () => cachedSidebarState?.dateKey ?? workspaceTodayDateKey(timezone),
  );
  const [monthKey, setMonthKey] = useState(
    () => cachedSidebarState?.monthKey ?? workspaceTodayDateKey(timezone).slice(0, 7),
  );
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [bookings, setBookings] = useState<BookingListItem[]>(
    () => cachedSidebarState?.bookings ?? [],
  );
  const [roomsWorkspaceId, setRoomsWorkspaceId] = useState<string | null>(null);
  const [bookingsWorkspaceId, setBookingsWorkspaceId] = useState<string | null>(null);
  const [hasLoadedRooms, setHasLoadedRooms] = useState(false);
  const [hasLoadedBookings, setHasLoadedBookings] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [pageBanner, setPageBanner] = useState<string | null>(null);
  const [pageError, setPageError] = useState<ErrorPayload | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<BookingDialogState>({
    open: false,
    mode: 'create',
    bookingId: null,
    draft: emptyBookingDraft,
    error: null,
    isSubmitting: false,
    anchorPoint: null,
  });
  const workspaceIdRef = useRef<string | null>(workspace.id);
  const requestedBookingId = searchParams.get('bookingId');

  const getBookingAnchorPoint = useCallback((bookingId: string): BookingModalAnchorPoint | null => {
    if (typeof document === 'undefined') {
      return null;
    }

    const escapedBookingId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(bookingId)
        : bookingId.replace(/"/g, '\\"');
    const bookingElement = document.querySelector<HTMLElement>(
      `[data-booking-id="${escapedBookingId}"]`,
    );

    if (!bookingElement) {
      return null;
    }

    const rect = bookingElement.getBoundingClientRect();
    return {
      clientX: rect.right,
      clientY: rect.top + rect.height / 2,
    };
  }, []);

  workspaceIdRef.current = workspace.id;

  useEffect(() => {
    const today = workspaceTodayDateKey(timezone);
    const cachedState = workspaceSidebarStateCache.get(workspace.id);
    setDateKey(cachedState?.dateKey ?? today);
    setMonthKey(cachedState?.monthKey ?? today.slice(0, 7));
    setBookings(cachedState?.bookings ?? []);
    setSelectedBookingId(null);
    setDialog({
      open: false,
      mode: 'create',
      bookingId: null,
      draft: emptyBookingDraft,
      error: null,
      isSubmitting: false,
      anchorPoint: null,
    });
  }, [workspace.id, timezone]);

  useEffect(() => {
    workspaceSidebarStateCache.set(workspace.id, {
      dateKey,
      monthKey,
      bookings,
    });
  }, [workspace.id, dateKey, monthKey, bookings]);

  const loadRooms = useCallback(async (selected: WorkspaceItem) => {
    setIsLoadingRooms(true);
    const response = await fetch(`/api/workspaces/${selected.id}/rooms`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await safeReadJson(response);

    if (workspaceIdRef.current !== selected.id) {
      return;
    }

    if (!response.ok) {
      setPageError(normalizeErrorPayload(payload, response.status));
      setRooms([]);
      setRoomsWorkspaceId(selected.id);
      setHasLoadedRooms(true);
      setIsLoadingRooms(false);
      return;
    }

    if (!isRoomListPayload(payload)) {
      setPageError({ code: 'BAD_GATEWAY', message: 'Unexpected rooms payload' });
      setRooms([]);
      setRoomsWorkspaceId(selected.id);
      setHasLoadedRooms(true);
      setIsLoadingRooms(false);
      return;
    }

    setRooms(payload.items.slice().sort((a, b) => a.name.localeCompare(b.name)));
    setRoomsWorkspaceId(selected.id);
    setHasLoadedRooms(true);
    setIsLoadingRooms(false);
  }, []);

  const loadBookings = useCallback(async (selected: WorkspaceItem) => {
    setIsLoadingBookings(true);
    const query = new URLSearchParams({
      mine: 'false',
      includePast: 'true',
    });

    const response = await fetch(`/api/workspaces/${selected.id}/bookings?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await safeReadJson(response);

    if (workspaceIdRef.current !== selected.id) {
      return;
    }

    if (!response.ok) {
      setPageError(normalizeErrorPayload(payload, response.status));
      setBookings([]);
      setBookingsWorkspaceId(selected.id);
      setHasLoadedBookings(true);
      setIsLoadingBookings(false);
      return;
    }

    if (!isBookingListPayload(payload)) {
      setPageError({ code: 'BAD_GATEWAY', message: 'Unexpected bookings payload' });
      setBookings([]);
      setBookingsWorkspaceId(selected.id);
      setHasLoadedBookings(true);
      setIsLoadingBookings(false);
      return;
    }

    setBookings(payload.items);
    setBookingsWorkspaceId(selected.id);
    setHasLoadedBookings(true);
    setIsLoadingBookings(false);
  }, []);

  const refreshData = useCallback(async () => {
    setPageError(null);
    await Promise.all([loadRooms(workspace), loadBookings(workspace)]);
  }, [loadBookings, loadRooms, workspace]);

  useEffect(() => {
    setPageBanner(null);
    setPageError(null);
    setHasLoadedRooms(false);
    setHasLoadedBookings(false);
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (rooms.length === 0) {
      setDialog((previous) =>
        previous.open && previous.draft.roomId
          ? { ...previous, draft: { ...previous.draft, roomId: '' } }
          : previous,
      );
      return;
    }

    setDialog((previous) => {
      if (!previous.open) {
        return previous;
      }
      if (previous.draft.roomId && rooms.some((room) => room.id === previous.draft.roomId)) {
        return previous;
      }
      return {
        ...previous,
        draft: {
          ...previous.draft,
          roomId: rooms[0].id,
        },
      };
    });
  }, [rooms]);

  const hasCurrentRooms = roomsWorkspaceId === workspace.id;
  const hasCurrentBookings = bookingsWorkspaceId === workspace.id;
  const isReady = hasLoadedRooms && hasLoadedBookings && hasCurrentRooms && hasCurrentBookings;
  const isLoading = isLoadingRooms || isLoadingBookings || !isReady;

  const currentUserId = currentUser?.id ?? '';
  const editableBookingIds = useMemo(
    () =>
      new Set(
        bookings
          .filter(
            (booking) => booking.createdByUserId === currentUserId && booking.status === 'ACTIVE',
          )
          .map((booking) => booking.id),
      ),
    [bookings, currentUserId],
  );

  const markerCountsByDate = useMemo(
    () => buildMarkerCountByDateKey(bookings, timezone, currentUserId || undefined),
    [bookings, timezone, currentUserId],
  );
  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone,
        monthKey,
        selectedDateKey: dateKey,
        markerCountByDateKey: markerCountsByDate,
      }),
    [timezone, monthKey, dateKey, markerCountsByDate],
  );

  const myBookingGroups = useMemo(
    () => (currentUserId ? groupMyBookingsForSidebar(bookings, timezone, currentUserId) : []),
    [bookings, timezone, currentUserId],
  );

  const selectedBookingForDialog = useMemo(
    () =>
      dialog.bookingId
        ? (bookings.find((booking) => booking.id === dialog.bookingId) ?? null)
        : null,
    [dialog.bookingId, bookings],
  );

  const setDialogError = (error: ErrorPayload | null) => {
    setDialog((previous) => (previous.open ? { ...previous, error } : previous));
  };

  const closeDialog = () => {
    setDialog({
      open: false,
      mode: 'create',
      bookingId: null,
      draft: emptyBookingDraft,
      error: null,
      isSubmitting: false,
      anchorPoint: null,
    });
    setSelectedBookingId(null);
  };

  const goToToday = useCallback(() => {
    const today = workspaceTodayDateKey(timezone);
    setDateKey(today);
    setMonthKey(today.slice(0, 7));
  }, [timezone]);

  const goToPreviousDay = useCallback(() => {
    setDateKey((previous) => {
      const next = addDaysToDateKey(previous, -1, timezone);
      setMonthKey(next.slice(0, 7));
      return next;
    });
  }, [timezone]);

  const goToNextDay = useCallback(() => {
    setDateKey((previous) => {
      const next = addDaysToDateKey(previous, 1, timezone);
      setMonthKey(next.slice(0, 7));
      return next;
    });
  }, [timezone]);

  const openCreateDialog = useCallback(
    ({
      roomId,
      startMinutes,
      endMinutes,
      anchorPoint,
    }: {
      roomId: string;
      startMinutes: number;
      endMinutes: number;
      anchorPoint: BookingModalAnchorPoint;
    }) => {
      if (!rooms.some((room) => room.id === roomId)) {
        return;
      }

      setPageError(null);
      setPageBanner(null);
      setSelectedBookingId(null);
      setDialog({
        open: true,
        mode: 'create',
        bookingId: null,
        error: null,
        isSubmitting: false,
        anchorPoint,
        draft: {
          roomId,
          subject: '',
          criticality: 'MEDIUM',
          startTimeLocal: minutesToTimeInput(startMinutes),
          endTimeLocal: minutesToTimeInput(endMinutes),
        },
      });
    },
    [rooms],
  );

  const openEditDialog = useCallback(
    (booking: BookingListItem) => {
      const local = bookingToLocalRange(booking, timezone);
      if (!local) {
        return;
      }

      setPageError(null);
      setPageBanner(null);
      setSelectedBookingId(booking.id);
      setDialog({
        open: true,
        mode: 'edit',
        bookingId: booking.id,
        error: null,
        isSubmitting: false,
        anchorPoint: getBookingAnchorPoint(booking.id),
        draft: {
          roomId: booking.roomId,
          subject: booking.subject,
          criticality: booking.criticality,
          startTimeLocal: minutesToTimeInput(local.startMinutes),
          endTimeLocal: minutesToTimeInput(local.endMinutes),
        },
      });
      setDateKey(local.dateKey);
      setMonthKey(local.dateKey.slice(0, 7));
    },
    [getBookingAnchorPoint, timezone],
  );

  useEffect(() => {
    if (!requestedBookingId || !hasCurrentBookings || dialog.open) {
      return;
    }

    const requestedBooking = bookings.find((booking) => booking.id === requestedBookingId);
    if (!requestedBooking) {
      return;
    }

    openEditDialog(requestedBooking);
    router.replace(`/workspaces/${workspace.id}`, { scroll: false });
  }, [
    requestedBookingId,
    hasCurrentBookings,
    dialog.open,
    bookings,
    openEditDialog,
    router,
    workspace.id,
  ]);

  useEffect(() => {
    if (!dialog.open || dialog.mode !== 'edit' || !dialog.bookingId || dialog.anchorPoint) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const anchorPoint = getBookingAnchorPoint(dialog.bookingId!);
      if (!anchorPoint) {
        return;
      }

      setDialog((previous) =>
        previous.open &&
        previous.mode === 'edit' &&
        previous.bookingId === dialog.bookingId &&
        !previous.anchorPoint
          ? { ...previous, anchorPoint }
          : previous,
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [dateKey, dialog, getBookingAnchorPoint, rooms, bookings]);

  const dialogDraftPreview = useMemo(() => {
    if (!dialog.open) {
      return null;
    }
    if (!dialog.draft.roomId) {
      return null;
    }
    if (!rooms.some((item) => item.id === dialog.draft.roomId)) {
      return null;
    }
    const startMinutes = parseTimeInputStrict(dialog.draft.startTimeLocal);
    const endMinutes = parseTimeInputStrict(dialog.draft.endTimeLocal);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return null;
    }
    if (startMinutes < scheduleStart || endMinutes > scheduleEnd) {
      return null;
    }
    const hasConflict =
      endMinutes <= startMinutes ||
      Boolean(
        getBookingConflictMessage({
          bookings,
          timezone,
          dateKey,
          roomId: dialog.draft.roomId,
          startMinutes,
          endMinutes,
          userId: currentUserId || undefined,
          ignoreBookingId: dialog.mode === 'edit' ? (dialog.bookingId ?? undefined) : undefined,
        }),
      );

    return {
      bookingId: dialog.mode === 'edit' ? dialog.bookingId : null,
      roomId: dialog.draft.roomId,
      startMinutes,
      endMinutes,
      title: dialog.draft.subject.trim() || (dialog.mode === 'create' ? 'New booking' : 'Booking'),
      subtitle:
        [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim() || null,
      hasConflict,
    };
  }, [dialog, rooms, currentUser, currentUserId, bookings, timezone, dateKey, scheduleEnd, scheduleStart]);

  const validateDraft = useCallback(
    (draft: BookingModalDraft, opts: { mode: 'create' | 'edit'; bookingId: string | null }) => {
      if (!draft.subject.trim()) {
        return { code: 'BAD_REQUEST', message: 'Title is required' } satisfies ErrorPayload;
      }
      const parsedStart = parseTimeInputStrict(draft.startTimeLocal);
      const parsedEnd = parseTimeInputStrict(draft.endTimeLocal);
      if (parsedStart === null || parsedEnd === null) {
        return {
          code: 'BAD_REQUEST',
          message: 'Start and end time are required',
        } satisfies ErrorPayload;
      }
      if (!draft.roomId) {
        return { code: 'BAD_REQUEST', message: 'Room is required' } satisfies ErrorPayload;
      }
      if (parsedEnd <= parsedStart) {
        return {
          code: 'BAD_REQUEST',
          message: 'End time must be after start time',
        } satisfies ErrorPayload;
      }
      if (parsedStart < scheduleStart || parsedEnd > scheduleEnd) {
        return {
          code: 'BOOKING_OUTSIDE_ALLOWED_HOURS',
          message: `Bookings must be within ${workspace.scheduleStartHour.toString().padStart(2, '0')}:00-${workspace.scheduleEndHour.toString().padStart(2, '0')}:00 in the workspace timezone`,
        } satisfies ErrorPayload;
      }

      const today = workspaceTodayDateKey(timezone);
      if (dateKey < today) {
        return {
          code: 'BAD_REQUEST',
          message:
            'Reservations can only be created or moved on the current workspace day or later',
        } satisfies ErrorPayload;
      }

      const conflictMessage = getBookingConflictMessage({
        bookings,
        timezone,
        dateKey,
        roomId: draft.roomId,
        startMinutes: parsedStart,
        endMinutes: parsedEnd,
        userId: currentUserId || undefined,
        ignoreBookingId: opts.bookingId ?? undefined,
      });
      if (conflictMessage) {
        return { code: 'BOOKING_OVERLAP', message: conflictMessage } satisfies ErrorPayload;
      }

      return null;
    },
    [bookings, currentUserId, timezone, dateKey, scheduleEnd, scheduleStart, workspace.scheduleEndHour, workspace.scheduleStartHour],
  );

  const dialogValidationError = useMemo(
    () =>
      dialog.open
        ? validateDraft(dialog.draft, {
            mode: dialog.mode,
            bookingId: dialog.bookingId,
          })
        : null,
    [dialog, validateDraft],
  );

  const submitDialog = async () => {
    if (!dialog.open) {
      return;
    }
    const validationError = dialogValidationError;
    if (validationError) {
      setDialogError(validationError);
      return;
    }

    const startAt = dateAndTimeToUtcIso(dateKey, dialog.draft.startTimeLocal, timezone);
    const endAt = dateAndTimeToUtcIso(dateKey, dialog.draft.endTimeLocal, timezone);
    if (!startAt || !endAt) {
      setDialogError({
        code: 'BAD_REQUEST',
        message: 'Date and time values must be valid in the workspace timezone',
      });
      return;
    }

    setDialog((previous) =>
      previous.open ? { ...previous, isSubmitting: true, error: null } : previous,
    );
    setPageError(null);
    setPageBanner(null);

    const isEdit = dialog.mode === 'edit' && dialog.bookingId;
    const url = isEdit
      ? `/api/workspaces/${workspace.id}/bookings/${dialog.bookingId}`
      : `/api/workspaces/${workspace.id}/bookings`;
    const method = isEdit ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId: dialog.draft.roomId,
        subject: dialog.draft.subject.trim(),
        criticality: dialog.draft.criticality,
        startAt,
        endAt,
      }),
    });
    const payload = await safeReadJson(response);

    if (!response.ok) {
      setDialog((previous) =>
        previous.open
          ? {
              ...previous,
              isSubmitting: false,
              error: normalizeErrorPayload(payload, response.status),
            }
          : previous,
      );
      return;
    }

    await loadBookings(workspace);
    setPageBanner(isEdit ? 'Booking updated.' : 'Booking created.');
    closeDialog();
  };

  const deleteDialogBooking = async () => {
    if (!dialog.open || dialog.mode !== 'edit' || !dialog.bookingId) {
      return;
    }

    setDialog((previous) =>
      previous.open ? { ...previous, isSubmitting: true, error: null } : previous,
    );
    setPageError(null);
    setPageBanner(null);

    const response = await fetch(
      `/api/workspaces/${workspace.id}/bookings/${dialog.bookingId}/cancel`,
      {
        method: 'POST',
      },
    );
    const payload = await safeReadJson(response);

    if (!response.ok) {
      setDialog((previous) =>
        previous.open
          ? {
              ...previous,
              isSubmitting: false,
              error: normalizeErrorPayload(payload, response.status),
            }
          : previous,
      );
      return;
    }

    await loadBookings(workspace);
    setPageBanner('Reservation cancelled and removed.');
    closeDialog();
  };

  const handleInteractiveUpdate = useCallback(
    async (update: {
      bookingId: string;
      roomId: string;
      startMinutes: number;
      endMinutes: number;
    }) => {
      const booking = bookings.find((item) => item.id === update.bookingId);
      if (!booking) {
        setPageError({ code: 'NOT_FOUND', message: 'Booking not found' });
        return;
      }

      const startAt = dateAndTimeToUtcIso(
        dateKey,
        minutesToTimeInput(update.startMinutes),
        timezone,
      );
      const endAt = dateAndTimeToUtcIso(dateKey, minutesToTimeInput(update.endMinutes), timezone);
      if (!startAt || !endAt) {
        setPageError({
          code: 'BAD_REQUEST',
          message: 'Unable to compute booking time in workspace timezone',
        });
        return;
      }

      setPageError(null);
      setPageBanner(null);

      const response = await fetch(`/api/workspaces/${workspace.id}/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId: update.roomId,
          subject: booking.subject,
          criticality: booking.criticality,
          startAt,
          endAt,
        }),
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        setPageError(normalizeErrorPayload(payload, response.status));
        return;
      }

      await loadBookings(workspace);
      setPageBanner('Booking updated.');
    },
    [bookings, dateKey, timezone, workspace, loadBookings],
  );

  const rightSidebar = (
    <SharedWorkspaceRightSidebar
      timezone={timezone}
      dateKey={dateKey}
      monthKey={monthKey}
      onSelectDateKey={setDateKey}
      onSelectMonthKey={setMonthKey}
      onToday={goToToday}
      miniCalendarCells={miniCalendarCells}
      bookingGroups={myBookingGroups}
      onOpenBooking={(booking) => openEditDialog(booking)}
    />
  );
  const leftSidebar =
    pageBanner || pageError ? (
      <div className="space-y-2">
        {pageBanner ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {pageBanner}
          </p>
        ) : null}
        {pageError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {pageError.code}: {pageError.message}
          </p>
        ) : null}
      </div>
    ) : null;

  const canEditDialogBooking =
    dialog.open && dialog.mode === 'create'
      ? true
      : Boolean(selectedBookingForDialog && editableBookingIds.has(selectedBookingForDialog.id));

  return {
    leftSidebar,
    main: (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1">
          {isLoading && !isReady ? (
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-4">
              <div className="h-5 w-48 rounded bg-slate-100" />
              <div className="mt-4 h-[480px] rounded-xl bg-slate-100" />
            </div>
          ) : (
            <DaySchedule
              rooms={hasCurrentRooms ? rooms : []}
              bookings={hasCurrentBookings ? bookings : []}
              timezone={timezone}
              schedule={schedule}
              selectedDateKey={dateKey}
              editableBookingIds={editableBookingIds}
              selectedBookingId={selectedBookingId}
              isMutating={dialog.open && dialog.isSubmitting}
              onPrevDay={goToPreviousDay}
              onNextDay={goToNextDay}
              onToday={goToToday}
              draftPreview={dialogDraftPreview}
              onCreateSlot={openCreateDialog}
              onOpenBooking={openEditDialog}
              onUpdateBooking={handleInteractiveUpdate}
              onInlineError={(message) => setPageError({ code: 'BOOKING_OVERLAP', message })}
            />
          )}
        </div>

        <BookingModal
          open={dialog.open}
          mode={dialog.mode}
          rooms={rooms}
          draft={dialog.draft}
          error={dialog.error}
          isSubmitting={dialog.isSubmitting}
          isSubmitDisabled={Boolean(dialogValidationError)}
          canEdit={Boolean(canEditDialogBooking)}
          canDelete={Boolean(dialog.mode === 'edit' && canEditDialogBooking)}
          schedule={schedule}
          anchorPoint={dialog.open ? dialog.anchorPoint : null}
          onChange={(next) =>
            setDialog((previous) =>
              previous.open ? { ...previous, draft: next, error: null } : previous,
            )
          }
          onClose={closeDialog}
          onSubmit={() => void submitDialog()}
          onDelete={() => void deleteDialogBooking()}
        />
      </div>
    ),
    rightSidebar,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkspaceRightSidebar({
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
  miniCalendarCells: ReturnType<typeof buildMiniCalendarCells>;
  bookingGroups: ReturnType<typeof groupMyBookingsForSidebar>;
  onOpenBooking: (booking: BookingListItem) => void;
}) {
  const monthLabel = useMemo(
    () => parseDateKey(`${monthKey}-01`.slice(0, 10), timezone).toFormat('LLLL yyyy'),
    [monthKey, timezone],
  );

  return (
    <div className="space-y-4">
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
              ←
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
              →
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

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">My bookings</h3>
          <p className="mt-1 text-xs text-slate-500">
            {parseDateKey(dateKey, timezone).toFormat('cccc, dd LLL yyyy')}
          </p>
        </div>

        <div className="max-h-[calc(100vh-280px)] space-y-4 overflow-y-auto p-4">
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

function parseTimeInputStrict(value: string): number | null {
  if (!value) {
    return null;
  }
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  const total = hour * 60 + minute;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  if (minute % SCHEDULE_INTERVAL_MINUTES !== 0) {
    return null;
  }
  return total;
}
