'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { WorkspaceShell, WorkspaceShellRenderContext } from '@/components/workspace-shell';
import { safeReadJson } from '@/lib/client-http';
import { IANA_TIMEZONES } from '@/lib/iana-timezones';
import {
  buildMarkerCountByDateKey,
  buildMiniCalendarCells,
  groupMyBookingsForSidebar,
  workspaceTodayDateKey,
} from '@/lib/time';
import type {
  BookingListItem,
  RoomItem,
  WorkspaceInvitationSummary,
  WorkspaceMemberListItem,
} from '@/lib/types';
import {
  isBookingListPayload,
  isRoomListPayload,
  isWorkspaceInvitationListPayload,
  isWorkspaceMemberListPayload,
} from '@/lib/workspace-payloads';
import { formatUtcInTimezone } from '@/lib/workspace-time';

type WorkspacePageParams = {
  workspaceId: string;
};

type RoomEditState = {
  name: string;
  description: string;
};

type WorkspaceSettingsState = {
  name: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
};

type CancelWorkspaceState = {
  workspaceName: string;
  email: string;
  password: string;
};

type DeleteRoomConfirmationState = {
  roomId: string;
  roomName: string;
  confirmRoomName: string;
  email: string;
  password: string;
};

type AdminRightSidebarState = {
  dateKey: string;
  monthKey: string;
  myBookings: BookingListItem[];
};

const adminRightSidebarStateCache = new Map<string, AdminRightSidebarState>();
const WORKSPACE_SCHEDULE_HOUR_OPTIONS = Array.from({ length: 25 }, (_, index) => index);

export default function WorkspaceAdminPage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params.workspaceId;

  return (
    <WorkspaceShell
      selectedWorkspaceId={workspaceId}
      pageTitle="Workspace Admin"
      pageDescription="Manage meeting rooms, members, and invitations."
      pageBackHref={`/workspaces/${workspaceId}`}
      pageBackLabel="Close"
      pageBackAriaLabel="Close admin panel"
    >
      {(context) => WorkspaceAdminContent({ context, workspaceId })}
    </WorkspaceShell>
  );
}

function WorkspaceAdminContent({
  context,
  workspaceId,
}: {
  context: WorkspaceShellRenderContext;
  workspaceId: string;
}) {
  const router = useRouter();
  const { selectedWorkspace, currentUser, isLoading, loadWorkspaces } = context;
  const cachedRightSidebarState = selectedWorkspace
    ? adminRightSidebarStateCache.get(selectedWorkspace.id)
    : null;
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberListItem[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitationSummary[]>([]);
  const [myBookings, setMyBookings] = useState<BookingListItem[]>(
    () => cachedRightSidebarState?.myBookings ?? [],
  );
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [hasLoadedAdminData, setHasLoadedAdminData] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomEditForm, setRoomEditForm] = useState<RoomEditState>({ name: '', description: '' });
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isSubmittingWorkspaceSettings, setIsSubmittingWorkspaceSettings] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [deleteRoomConfirmation, setDeleteRoomConfirmation] =
    useState<DeleteRoomConfirmationState | null>(null);
  const [isDeleteRoomCredentialsUnlocked, setIsDeleteRoomCredentialsUnlocked] = useState(false);
  const [workspaceSettingsForm, setWorkspaceSettingsForm] = useState<WorkspaceSettingsState>({
    name: '',
    timezone: 'UTC',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
  });
  const [isCancelWorkspaceFormVisible, setIsCancelWorkspaceFormVisible] = useState(false);
  const [isCancellingWorkspace, setIsCancellingWorkspace] = useState(false);
  const [isCancelWorkspaceCredentialsUnlocked, setIsCancelWorkspaceCredentialsUnlocked] =
    useState(false);
  const [cancelWorkspaceForm, setCancelWorkspaceForm] = useState<CancelWorkspaceState>({
    workspaceName: '',
    email: '',
    password: '',
  });
  const [dateKey, setDateKey] = useState(
    () =>
      cachedRightSidebarState?.dateKey ??
      workspaceTodayDateKey(selectedWorkspace?.timezone ?? 'UTC'),
  );
  const [monthKey, setMonthKey] = useState(
    () =>
      cachedRightSidebarState?.monthKey ??
      workspaceTodayDateKey(selectedWorkspace?.timezone ?? 'UTC').slice(0, 7),
  );
  const adminDataRequestIdRef = useRef(0);
  const lastSelectedWorkspaceIdRef = useRef<string | null>(null);

  const isAdmin =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    selectedWorkspace?.membership?.role === 'ADMIN';
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;
  const selectedWorkspaceName = selectedWorkspace?.name ?? null;
  const selectedWorkspaceTimezone = selectedWorkspace?.timezone ?? null;
  const selectedWorkspaceScheduleStartHour = selectedWorkspace?.scheduleStartHour ?? null;
  const selectedWorkspaceScheduleEndHour = selectedWorkspace?.scheduleEndHour ?? null;
  const isResolvingSelectedWorkspace =
    isLoading && (!selectedWorkspace || selectedWorkspace.id !== workspaceId);
  const isInitialAdminDataLoading = isLoadingData && !hasLoadedAdminData;
  const isRefreshingAdminData = isLoadingData && hasLoadedAdminData;
  const currentUserId = currentUser?.id ?? '';

  const loadAdminData = useCallback(async () => {
    if (!selectedWorkspaceId || !isAdmin) {
      setRooms([]);
      setMembers([]);
      setPendingInvitations([]);
      setHasLoadedAdminData(false);
      setIsLoadingData(false);
      return;
    }

    const requestId = ++adminDataRequestIdRef.current;
    setIsLoadingData(true);
    const [roomsResponse, membersResponse, invitationsResponse] = await Promise.all([
      fetch(`/api/workspaces/${selectedWorkspaceId}/rooms`, {
        method: 'GET',
        cache: 'no-store',
      }),
      fetch(`/api/workspaces/${selectedWorkspaceId}/members`, {
        method: 'GET',
        cache: 'no-store',
      }),
      fetch(`/api/workspaces/${selectedWorkspaceId}/invitations`, {
        method: 'GET',
        cache: 'no-store',
      }),
    ]);

    const [roomsPayload, membersPayload, invitationsPayload] = await Promise.all([
      safeReadJson(roomsResponse),
      safeReadJson(membersResponse),
      safeReadJson(invitationsResponse),
    ]);

    if (adminDataRequestIdRef.current !== requestId) {
      return;
    }

    if (!roomsResponse.ok) {
      setIsLoadingData(false);
      return;
    }

    if (!membersResponse.ok) {
      setIsLoadingData(false);
      return;
    }

    if (!invitationsResponse.ok) {
      setIsLoadingData(false);
      return;
    }

    if (!isRoomListPayload(roomsPayload)) {
      setIsLoadingData(false);
      return;
    }

    if (!isWorkspaceMemberListPayload(membersPayload)) {
      setIsLoadingData(false);
      return;
    }

    if (!isWorkspaceInvitationListPayload(invitationsPayload)) {
      setIsLoadingData(false);
      return;
    }

    setRooms(roomsPayload.items);
    setMembers(membersPayload.items);
    setPendingInvitations(invitationsPayload.items);
    setHasLoadedAdminData(true);
    setIsLoadingData(false);
  }, [selectedWorkspaceId, isAdmin]);

  const loadMyBookings = useCallback(async () => {
    if (!selectedWorkspaceId || !isAdmin) {
      setMyBookings([]);
      return;
    }

    const query = new URLSearchParams({
      mine: 'true',
      includePast: 'true',
    });

    const response = await fetch(
      `/api/workspaces/${selectedWorkspaceId}/bookings?${query.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );
    const payload = await safeReadJson(response);

    if (!response.ok || !isBookingListPayload(payload)) {
      setMyBookings([]);
      return;
    }

    setMyBookings(payload.items);
  }, [selectedWorkspaceId, isAdmin]);

  useEffect(() => {
    if (isResolvingSelectedWorkspace) {
      return;
    }

    void loadAdminData();
  }, [isResolvingSelectedWorkspace, loadAdminData]);

  useEffect(() => {
    if (isResolvingSelectedWorkspace) {
      return;
    }

    void loadMyBookings();
  }, [isResolvingSelectedWorkspace, loadMyBookings]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspaceName || !selectedWorkspaceTimezone) {
      lastSelectedWorkspaceIdRef.current = null;
      return;
    }

    const today = workspaceTodayDateKey(selectedWorkspaceTimezone);
    const cachedState = adminRightSidebarStateCache.get(selectedWorkspaceId);
    setDateKey(cachedState?.dateKey ?? today);
    setMonthKey(cachedState?.monthKey ?? today.slice(0, 7));
    setMyBookings(cachedState?.myBookings ?? []);

    setWorkspaceSettingsForm((previous) =>
      previous.name === selectedWorkspaceName &&
      previous.timezone === selectedWorkspaceTimezone &&
      previous.scheduleStartHour === selectedWorkspaceScheduleStartHour &&
      previous.scheduleEndHour === selectedWorkspaceScheduleEndHour
        ? previous
        : {
            name: selectedWorkspaceName,
            timezone: selectedWorkspaceTimezone,
            scheduleStartHour: selectedWorkspaceScheduleStartHour ?? 8,
            scheduleEndHour: selectedWorkspaceScheduleEndHour ?? 18,
          },
    );

    if (lastSelectedWorkspaceIdRef.current !== selectedWorkspaceId) {
      setCancelWorkspaceForm((previous) => ({
        ...previous,
        workspaceName: '',
        password: '',
      }));
      setIsCancelWorkspaceFormVisible(false);
      setIsCancelWorkspaceCredentialsUnlocked(false);
      setDeleteRoomConfirmation(null);
      setIsDeleteRoomCredentialsUnlocked(false);
      lastSelectedWorkspaceIdRef.current = selectedWorkspaceId;
    }
  }, [
    selectedWorkspaceId,
    selectedWorkspaceName,
    selectedWorkspaceTimezone,
    selectedWorkspaceScheduleStartHour,
    selectedWorkspaceScheduleEndHour,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    adminRightSidebarStateCache.set(selectedWorkspaceId, {
      dateKey,
      monthKey,
      myBookings,
    });
  }, [selectedWorkspaceId, dateKey, monthKey, myBookings]);

  const handleSaveWorkspaceSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isSubmittingWorkspaceSettings) {
        return;
      }

      setIsSubmittingWorkspaceSettings(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: workspaceSettingsForm.name,
          timezone: workspaceSettingsForm.timezone,
          scheduleStartHour: workspaceSettingsForm.scheduleStartHour,
          scheduleEndHour: workspaceSettingsForm.scheduleEndHour,
        }),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsSubmittingWorkspaceSettings(false);
        return;
      }

      await loadWorkspaces();
      setIsSubmittingWorkspaceSettings(false);
    },
    [
      selectedWorkspace,
      isAdmin,
      isSubmittingWorkspaceSettings,
      workspaceSettingsForm,
      loadWorkspaces,
    ],
  );

  const handleCreateRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isSubmittingRoom) {
        return;
      }

      setIsSubmittingRoom(true);
      const payload =
        newRoomDescription.trim().length > 0
          ? { name: newRoomName, description: newRoomDescription }
          : { name: newRoomName };

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/rooms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsSubmittingRoom(false);
        return;
      }

      setNewRoomName('');
      setNewRoomDescription('');
      await loadAdminData();
      setIsSubmittingRoom(false);
    },
    [selectedWorkspace, isAdmin, isSubmittingRoom, newRoomName, newRoomDescription, loadAdminData],
  );

  const handleSaveRoom = useCallback(
    async (roomId: string) => {
      if (!selectedWorkspace || !isAdmin || isSubmittingRoom) {
        return;
      }

      setIsSubmittingRoom(true);
      const payload =
        roomEditForm.description.trim().length > 0
          ? { name: roomEditForm.name, description: roomEditForm.description }
          : { name: roomEditForm.name, description: null };

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/rooms/${roomId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsSubmittingRoom(false);
        return;
      }

      setEditingRoomId(null);
      await loadAdminData();
      setIsSubmittingRoom(false);
    },
    [selectedWorkspace, isAdmin, isSubmittingRoom, roomEditForm, loadAdminData],
  );

  const handleOpenDeleteRoomConfirmation = useCallback(
    (roomId: string) => {
      if (!selectedWorkspace || !isAdmin || deletingRoomId) {
        return;
      }

      const room = rooms.find((item) => item.id === roomId);
      if (!room) {
        return;
      }

      setIsDeleteRoomCredentialsUnlocked(false);
      setDeleteRoomConfirmation({
        roomId: room.id,
        roomName: room.name,
        confirmRoomName: '',
        email: '',
        password: '',
      });
    },
    [selectedWorkspace, isAdmin, deletingRoomId, rooms],
  );

  const handleConfirmDeleteRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || deletingRoomId || !deleteRoomConfirmation) {
        return;
      }

      setDeletingRoomId(deleteRoomConfirmation.roomId);
      const response = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/rooms/${deleteRoomConfirmation.roomId}`,
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            roomName: deleteRoomConfirmation.confirmRoomName,
            email: deleteRoomConfirmation.email,
            password: deleteRoomConfirmation.password,
          }),
        },
      );
      await safeReadJson(response);

      if (!response.ok) {
        setDeletingRoomId(null);
        return;
      }

      setIsDeleteRoomCredentialsUnlocked(false);
      setDeleteRoomConfirmation(null);
      await loadAdminData();
      setDeletingRoomId(null);
    },
    [selectedWorkspace, isAdmin, deletingRoomId, deleteRoomConfirmation, loadAdminData],
  );

  const handleInvite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isSubmittingInvite) {
        return;
      }

      setIsSubmittingInvite(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/invitations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
        }),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsSubmittingInvite(false);
        return;
      }

      setInviteEmail('');
      await loadAdminData();
      setIsSubmittingInvite(false);
    },
    [selectedWorkspace, isAdmin, isSubmittingInvite, inviteEmail, loadAdminData],
  );

  const handleCancelWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isCancellingWorkspace) {
        return;
      }

      setIsCancellingWorkspace(true);
      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/cancel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(cancelWorkspaceForm),
      });
      await safeReadJson(response);

      if (!response.ok) {
        setIsCancellingWorkspace(false);
        return;
      }

      await loadWorkspaces();
      router.replace('/dashboard');
      router.refresh();
    },
    [
      selectedWorkspace,
      isAdmin,
      isCancellingWorkspace,
      cancelWorkspaceForm,
      loadWorkspaces,
      router,
    ],
  );

  const rightSidebarTimezone = selectedWorkspace?.timezone ?? 'UTC';
  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone: rightSidebarTimezone,
        monthKey,
        selectedDateKey: dateKey,
        markerCountByDateKey: buildMarkerCountByDateKey(
          myBookings,
          rightSidebarTimezone,
          currentUserId || undefined,
        ),
      }),
    [currentUserId, dateKey, monthKey, myBookings, rightSidebarTimezone],
  );
  const myBookingGroups = useMemo(
    () =>
      currentUserId
        ? groupMyBookingsForSidebar(myBookings, rightSidebarTimezone, currentUserId)
        : [],
    [currentUserId, myBookings, rightSidebarTimezone],
  );

  if (isResolvingSelectedWorkspace) {
    return <p className="text-slate-600">Loading workspace...</p>;
  }

  if (!selectedWorkspace || selectedWorkspace.id !== workspaceId) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        WORKSPACE_NOT_VISIBLE: Workspace not visible.
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        UNAUTHORIZED: Only workspace admins can access this page.
      </p>
    );
  }

  const rightSidebar = (
    <WorkspaceRightSidebar
      timezone={selectedWorkspace.timezone}
      dateKey={dateKey}
      monthKey={monthKey}
      onSelectDateKey={setDateKey}
      onSelectMonthKey={setMonthKey}
      onToday={() => {
        const today = workspaceTodayDateKey(selectedWorkspace.timezone);
        setDateKey(today);
        setMonthKey(today.slice(0, 7));
      }}
      miniCalendarCells={miniCalendarCells}
      bookingGroups={myBookingGroups}
      onOpenBooking={(booking) =>
        router.push(`/workspaces/${selectedWorkspace.id}?bookingId=${booking.id}`)
      }
    />
  );

  return {
    rightSidebar,
    main: (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-slate-900">Workspace Settings</h3>
          <p className="mt-1 text-sm text-slate-600">
            Update the workspace name, timezone, and daily schedule window used for booking
            displays and validations.
          </p>

          <form
            className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_240px_160px_160px_auto_auto] xl:items-end"
            onSubmit={(event) => void handleSaveWorkspaceSettings(event)}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Workspace Name</span>
              <input
                required
                value={workspaceSettingsForm.name}
                onChange={(event) =>
                  setWorkspaceSettingsForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Timezone</span>
              <select
                required
                value={workspaceSettingsForm.timezone}
                onChange={(event) =>
                  setWorkspaceSettingsForm((previous) => ({
                    ...previous,
                    timezone: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {IANA_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Schedule Start</span>
              <select
                required
                value={workspaceSettingsForm.scheduleStartHour}
                onChange={(event) =>
                  setWorkspaceSettingsForm((previous) => {
                    const nextStartHour = Number(event.target.value);
                    const nextEndHour =
                      previous.scheduleEndHour <= nextStartHour
                        ? Math.min(24, nextStartHour + 1)
                        : previous.scheduleEndHour;

                    return {
                      ...previous,
                      scheduleStartHour: nextStartHour,
                      scheduleEndHour: nextEndHour,
                    };
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter(
                  (hour) => hour < workspaceSettingsForm.scheduleEndHour,
                ).map((hour) => (
                  <option key={`start-${hour}`} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Schedule End</span>
              <select
                required
                value={workspaceSettingsForm.scheduleEndHour}
                onChange={(event) =>
                  setWorkspaceSettingsForm((previous) => ({
                    ...previous,
                    scheduleEndHour: Number(event.target.value),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter(
                  (hour) => hour > workspaceSettingsForm.scheduleStartHour,
                ).map((hour) => (
                  <option key={`end-${hour}`} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2 xl:col-span-2 xl:flex-nowrap">
              <button
                type="submit"
                disabled={isSubmittingWorkspaceSettings}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingWorkspaceSettings ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCancelWorkspaceFormVisible(true);
                  setIsCancelWorkspaceCredentialsUnlocked(false);
                  setCancelWorkspaceForm((previous) => ({
                    ...previous,
                    workspaceName: '',
                    email: '',
                    password: '',
                  }));
                }}
                className="rounded-lg border border-rose-500 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Delete Workspace
              </button>
            </div>
          </form>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-2 xl:gap-y-0">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold text-slate-900">Meeting Rooms</h3>
            <form
              className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => void handleCreateRoom(event)}
            >
              <input
                required
                placeholder="Room name"
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <input
                placeholder="Description (optional)"
                value={newRoomDescription}
                onChange={(event) => setNewRoomDescription(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="submit"
                disabled={isSubmittingRoom}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingRoom ? 'Saving...' : 'Create Room'}
              </button>
            </form>

            {isInitialAdminDataLoading ? (
              <p className="mt-3 text-sm text-slate-600">Loading rooms...</p>
            ) : null}

            {isRefreshingAdminData ? (
              <p className="mt-3 text-xs text-slate-500">Refreshing rooms...</p>
            ) : null}

            {!isInitialAdminDataLoading && rooms.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No rooms created yet.</p>
            ) : null}

            {rooms.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {rooms.map((room) => {
                  const isEditing = editingRoomId === room.id;

                  return (
                    <li
                      key={room.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      {!isEditing ? (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{room.name}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {room.description ?? 'No description'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRoomId(room.id);
                                setRoomEditForm({
                                  name: room.name,
                                  description: room.description ?? '',
                                });
                              }}
                              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteRoomConfirmation(room.id)}
                              disabled={deletingRoomId === room.id}
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingRoomId === room.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Room Name
                            </span>
                            <p className="mb-2 text-xs text-slate-500">
                              Unique within this workspace. Used in reservation lists and filters.
                            </p>
                            <input
                              value={roomEditForm.name}
                              onChange={(event) =>
                                setRoomEditForm((previous) => ({
                                  ...previous,
                                  name: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Description
                            </span>
                            <p className="mb-2 text-xs text-slate-500">
                              Optional notes such as capacity, equipment, or room usage.
                            </p>
                            <input
                              value={roomEditForm.description}
                              onChange={(event) =>
                                setRoomEditForm((previous) => ({
                                  ...previous,
                                  description: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveRoom(room.id)}
                              disabled={isSubmittingRoom}
                              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRoomId(null)}
                              disabled={isSubmittingRoom}
                              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold text-slate-900">People</h3>

            <form
              className="mt-3 flex flex-wrap items-center gap-3"
              onSubmit={(event) => void handleInvite(event)}
            >
              <input
                required
                type="email"
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="submit"
                disabled={isSubmittingInvite}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingInvite ? 'Sending...' : 'Invite'}
              </button>
            </form>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-sm font-semibold text-slate-900">Active Members</h4>
                {members.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-600">No active members.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {members.map((member) => (
                      <li
                        key={member.userId}
                        className="rounded-md border border-slate-200 bg-white p-2"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-slate-600">{member.email}</p>
                        <p className="text-xs text-slate-600">
                          {member.role} / {member.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-sm font-semibold text-slate-900">Pending Invitations</h4>
                {pendingInvitations.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-600">No pending invitations.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {pendingInvitations.map((invitation) => (
                      <li
                        key={invitation.id}
                        className="rounded-md border border-slate-200 bg-white p-2"
                      >
                        <p className="text-sm font-medium text-slate-900">{invitation.email}</p>
                        <p className="text-xs text-slate-600">
                          Expires{' '}
                          {formatUtcInTimezone(invitation.expiresAt, selectedWorkspace.timezone)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        {isCancelWorkspaceFormVisible ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-workspace-dialog-title"
          >
            <div className="w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="cancel-workspace-dialog-title"
                    className="text-lg font-semibold text-rose-900"
                  >
                    Delete Workspace Permanently
                  </h3>
                  <p className="mt-1 text-sm text-rose-800">
                    This permanently deletes rooms, reservations, memberships, and invitations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCancelWorkspaceFormVisible(false);
                    setIsCancelWorkspaceCredentialsUnlocked(false);
                  }}
                  disabled={isCancellingWorkspace}
                  className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <form
                className="mt-4 space-y-3"
                autoComplete="off"
                onSubmit={(event) => void handleCancelWorkspace(event)}
              >
                <div className="hidden" aria-hidden="true">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} />
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    tabIndex={-1}
                  />
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">
                    Workspace Name Confirmation
                  </span>
                  <p className="mb-2 text-xs text-rose-800">
                    Type <span className="font-semibold">{selectedWorkspace.name}</span> to confirm.
                  </p>
                  <input
                    required
                    name="cancel-workspace-confirm-name"
                    autoComplete="off"
                    value={cancelWorkspaceForm.workspaceName}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        workspaceName: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Email</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Enter your admin account email address.
                  </p>
                  <input
                    required
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="cancel-workspace-confirm-contact"
                    autoComplete="new-password"
                    readOnly={!isCancelWorkspaceCredentialsUnlocked}
                    onFocus={() => setIsCancelWorkspaceCredentialsUnlocked(true)}
                    value={cancelWorkspaceForm.email}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Password</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Re-enter your password to complete the workspace deletion.
                  </p>
                  <input
                    required
                    type="password"
                    name="cancel-workspace-confirm-secret"
                    autoComplete="new-password"
                    readOnly={!isCancelWorkspaceCredentialsUnlocked}
                    onFocus={() => setIsCancelWorkspaceCredentialsUnlocked(true)}
                    value={cancelWorkspaceForm.password}
                    onChange={(event) =>
                      setCancelWorkspaceForm((previous) => ({
                        ...previous,
                        password: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={isCancellingWorkspace}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCancellingWorkspace ? 'Deleting Workspace...' : 'Confirm Workspace Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCancelWorkspaceFormVisible(false);
                      setIsCancelWorkspaceCredentialsUnlocked(false);
                    }}
                    disabled={isCancellingWorkspace}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Keep Workspace
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {deleteRoomConfirmation ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-room-dialog-title"
          >
            <div className="w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="delete-room-dialog-title" className="text-lg font-semibold text-rose-900">
                    Delete Room Permanently
                  </h3>
                  <p className="mt-1 text-sm text-rose-800">
                    This permanently deletes the room and all associated reservations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteRoomConfirmation(null);
                    setIsDeleteRoomCredentialsUnlocked(false);
                  }}
                  disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                  className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <form
                className="mt-4 space-y-3"
                autoComplete="off"
                onSubmit={(event) => void handleConfirmDeleteRoom(event)}
              >
                {/* Decoy credentials fields reduce Chrome autofill on destructive confirmation dialogs. */}
                <div className="hidden" aria-hidden="true">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} />
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    tabIndex={-1}
                  />
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">
                    Room Name Confirmation
                  </span>
                  <p className="mb-2 text-xs text-rose-800">
                    Type <span className="font-semibold">{deleteRoomConfirmation.roomName}</span> to
                    confirm.
                  </p>
                  <input
                    required
                    name="delete-room-confirm-name"
                    autoComplete="off"
                    value={deleteRoomConfirmation.confirmRoomName}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              confirmRoomName: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Email</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Enter your admin account email address.
                  </p>
                  <input
                    required
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="delete-room-confirm-contact"
                    autoComplete="new-password"
                    readOnly={!isDeleteRoomCredentialsUnlocked}
                    onFocus={() => setIsDeleteRoomCredentialsUnlocked(true)}
                    value={deleteRoomConfirmation.email}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              email: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-rose-900">Password</span>
                  <p className="mb-2 text-xs text-rose-800">
                    Re-enter your password to permanently delete this room and its reservations.
                  </p>
                  <input
                    required
                    type="password"
                    name="delete-room-confirm-secret"
                    autoComplete="new-password"
                    readOnly={!isDeleteRoomCredentialsUnlocked}
                    onFocus={() => setIsDeleteRoomCredentialsUnlocked(true)}
                    value={deleteRoomConfirmation.password}
                    onChange={(event) =>
                      setDeleteRoomConfirmation((previous) =>
                        previous
                          ? {
                              ...previous,
                              password: event.target.value,
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingRoomId === deleteRoomConfirmation.roomId
                      ? 'Deleting Room...'
                      : 'Confirm Room Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteRoomConfirmation(null);
                      setIsDeleteRoomCredentialsUnlocked(false);
                    }}
                    disabled={deletingRoomId === deleteRoomConfirmation.roomId}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Keep Room
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    ),
  };
}
