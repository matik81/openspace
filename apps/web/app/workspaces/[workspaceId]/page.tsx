'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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

const bookingFormInitialState: BookingFormState = {
  roomId: '',
  subject: '',
  criticality: 'MEDIUM',
  dateLocal: '',
  startTimeLocal: '',
  endTimeLocal: '',
};

export default function WorkspacePage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params.workspaceId;

  return (
    <WorkspaceShell
      selectedWorkspaceId={workspaceId}
      pageTitle="Workspace"
      pageDescription="Reservation flow for active members and invitation management for pending access."
    >
      {(context) => <WorkspaceMemberContent context={context} workspaceId={workspaceId} />}
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
  const [localError, setLocalError] = useState<ErrorPayload | null>(null);
  const [localBanner, setLocalBanner] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(false);
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
      setIsLoadingRooms(false);
      return;
    }

    if (!isRoomListPayload(payload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected rooms payload',
      });
      setRooms([]);
      setIsLoadingRooms(false);
      return;
    }

    setRooms(payload.items);
    setIsLoadingRooms(false);
  }, []);

  const loadBookings = useCallback(
    async (workspace: WorkspaceItem, options: { includePast: boolean; includeCancelled: boolean }) => {
      setIsLoadingBookings(true);
      const query = new URLSearchParams({
        mine: 'true',
        includePast: String(options.includePast),
        includeCancelled: String(options.includeCancelled),
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

  useEffect(() => {
    setLocalBanner(null);
    setLocalError(null);

    if (!selectedWorkspace || !isActiveMember) {
      setRooms([]);
      setBookings([]);
      return;
    }

    void loadRooms(selectedWorkspace);
    void loadBookings(selectedWorkspace, {
      includePast,
      includeCancelled,
    });
  }, [selectedWorkspace, isActiveMember, includePast, includeCancelled, loadBookings, loadRooms]);

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

      const startLocal = `${bookingForm.dateLocal}T${bookingForm.startTimeLocal}`;
      const endLocal = `${bookingForm.dateLocal}T${bookingForm.endTimeLocal}`;
      if (endLocal <= startLocal) {
        setLocalError({
          code: 'BAD_REQUEST',
          message: 'End time must be after start time on the selected date',
        });
        return;
      }

      const startAt = dateAndTimeToUtcIso(
        bookingForm.dateLocal,
        bookingForm.startTimeLocal,
        selectedWorkspace.timezone,
      );
      const endAt = dateAndTimeToUtcIso(
        bookingForm.dateLocal,
        bookingForm.endTimeLocal,
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
        dateLocal: '',
        startTimeLocal: '',
        endTimeLocal: '',
      }));
      await loadBookings(selectedWorkspace, { includePast, includeCancelled });
      setIsCreatingBooking(false);
    },
    [
      selectedWorkspace,
      isActiveMember,
      isCreatingBooking,
      bookingForm,
      includePast,
      includeCancelled,
      loadBookings,
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

      setLocalBanner('Reservation cancelled.');
      await loadBookings(selectedWorkspace, { includePast, includeCancelled });
      setCancellingBookingId(null);
    },
    [selectedWorkspace, isActiveMember, cancellingBookingId, includePast, includeCancelled, loadBookings],
  );

  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) => left.name.localeCompare(right.name)),
    [rooms],
  );
  const minBookingDate = selectedWorkspace
    ? workspaceTodayDateInput(selectedWorkspace.timezone)
    : undefined;

  if (isLoading) {
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

  return (
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
            <input
              required
              type="time"
              value={bookingForm.startTimeLocal}
              onChange={(event) => {
                const nextStartTime = event.target.value;
                const autoEndTime = addHoursToTimeInput(nextStartTime, 1);

                setBookingForm((previous) => ({
                  ...previous,
                  startTimeLocal: nextStartTime,
                  endTimeLocal: autoEndTime ?? previous.endTimeLocal,
                }));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">End Time</span>
            <input
              required
              type="time"
              value={bookingForm.endTimeLocal}
              onChange={(event) =>
                setBookingForm((previous) => ({
                  ...previous,
                  endTimeLocal: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

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
          <h3 className="text-lg font-semibold text-slate-900">My Reservations</h3>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(event) => setIncludePast(event.target.checked)}
              />
              Include past
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(event) => setIncludeCancelled(event.target.checked)}
              />
              Include cancelled
            </label>
          </div>
        </div>

        {isLoadingBookings ? <p className="mt-3 text-sm text-slate-600">Loading reservations...</p> : null}

        {!isLoadingBookings && bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No reservations found for the current filters.</p>
        ) : null}

        {!isLoadingBookings && bookings.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {bookings.map((booking) => (
              <li key={booking.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{booking.subject}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {booking.roomName} • {booking.criticality} • {booking.status}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {formatUtcInTimezone(booking.startAt, selectedWorkspace.timezone)} to{' '}
                      {formatUtcInTimezone(booking.endAt, selectedWorkspace.timezone)}
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
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
