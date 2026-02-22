'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { WorkspaceShell, WorkspaceShellRenderContext } from '@/components/workspace-shell';
import { normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import { IANA_TIMEZONES } from '@/lib/iana-timezones';
import type {
  ErrorPayload,
  RoomItem,
  WorkspaceInvitationSummary,
  WorkspaceMemberListItem,
} from '@/lib/types';
import {
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
};

type CancelWorkspaceState = {
  workspaceName: string;
  email: string;
  password: string;
};

export default function WorkspaceAdminPage() {
  const params = useParams<WorkspacePageParams>();
  const workspaceId = params.workspaceId;

  return (
    <WorkspaceShell
      selectedWorkspaceId={workspaceId}
      pageTitle="Workspace Admin"
      pageDescription="Manage meeting rooms, members, and invitations."
    >
      {(context) => <WorkspaceAdminContent context={context} workspaceId={workspaceId} />}
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
  const { selectedWorkspace, isLoading, loadWorkspaces } = context;
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberListItem[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitationSummary[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [localError, setLocalError] = useState<ErrorPayload | null>(null);
  const [localBanner, setLocalBanner] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomEditForm, setRoomEditForm] = useState<RoomEditState>({ name: '', description: '' });
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isSubmittingWorkspaceSettings, setIsSubmittingWorkspaceSettings] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [workspaceSettingsForm, setWorkspaceSettingsForm] = useState<WorkspaceSettingsState>({
    name: '',
    timezone: 'UTC',
  });
  const [isCancelWorkspaceFormVisible, setIsCancelWorkspaceFormVisible] = useState(false);
  const [isCancellingWorkspace, setIsCancellingWorkspace] = useState(false);
  const [cancelWorkspaceForm, setCancelWorkspaceForm] = useState<CancelWorkspaceState>({
    workspaceName: '',
    email: '',
    password: '',
  });

  const isAdmin =
    selectedWorkspace?.membership?.status === 'ACTIVE' &&
    selectedWorkspace?.membership?.role === 'ADMIN';

  const loadAdminData = useCallback(async () => {
    if (!selectedWorkspace || !isAdmin) {
      setRooms([]);
      setMembers([]);
      setPendingInvitations([]);
      return;
    }

    setIsLoadingData(true);
    setLocalError(null);

    const [roomsResponse, membersResponse, invitationsResponse] = await Promise.all([
      fetch(`/api/workspaces/${selectedWorkspace.id}/rooms`, {
        method: 'GET',
        cache: 'no-store',
      }),
      fetch(`/api/workspaces/${selectedWorkspace.id}/members`, {
        method: 'GET',
        cache: 'no-store',
      }),
      fetch(`/api/workspaces/${selectedWorkspace.id}/invitations`, {
        method: 'GET',
        cache: 'no-store',
      }),
    ]);

    const [roomsPayload, membersPayload, invitationsPayload] = await Promise.all([
      safeReadJson(roomsResponse),
      safeReadJson(membersResponse),
      safeReadJson(invitationsResponse),
    ]);

    if (!roomsResponse.ok) {
      setLocalError(normalizeErrorPayload(roomsPayload, roomsResponse.status));
      setIsLoadingData(false);
      return;
    }

    if (!membersResponse.ok) {
      setLocalError(normalizeErrorPayload(membersPayload, membersResponse.status));
      setIsLoadingData(false);
      return;
    }

    if (!invitationsResponse.ok) {
      setLocalError(normalizeErrorPayload(invitationsPayload, invitationsResponse.status));
      setIsLoadingData(false);
      return;
    }

    if (!isRoomListPayload(roomsPayload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected rooms payload',
      });
      setIsLoadingData(false);
      return;
    }

    if (!isWorkspaceMemberListPayload(membersPayload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected members payload',
      });
      setIsLoadingData(false);
      return;
    }

    if (!isWorkspaceInvitationListPayload(invitationsPayload)) {
      setLocalError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected invitations payload',
      });
      setIsLoadingData(false);
      return;
    }

    setRooms(roomsPayload.items);
    setMembers(membersPayload.items);
    setPendingInvitations(invitationsPayload.items);
    setIsLoadingData(false);
  }, [selectedWorkspace, isAdmin]);

  useEffect(() => {
    setLocalBanner(null);
    setLocalError(null);
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    setWorkspaceSettingsForm({
      name: selectedWorkspace.name,
      timezone: selectedWorkspace.timezone,
    });
    setCancelWorkspaceForm((previous) => ({
      ...previous,
      workspaceName: '',
      password: '',
    }));
  }, [selectedWorkspace]);

  const handleSaveWorkspaceSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isSubmittingWorkspaceSettings) {
        return;
      }

      setIsSubmittingWorkspaceSettings(true);
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: workspaceSettingsForm.name,
          timezone: workspaceSettingsForm.timezone,
        }),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
        setIsSubmittingWorkspaceSettings(false);
        return;
      }

      await loadWorkspaces();
      setLocalBanner('Workspace settings updated.');
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
      setLocalError(null);
      setLocalBanner(null);

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
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
        setIsSubmittingRoom(false);
        return;
      }

      setLocalBanner('Room created.');
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
      setLocalError(null);
      setLocalBanner(null);

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
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
        setIsSubmittingRoom(false);
        return;
      }

      setLocalBanner('Room updated.');
      setEditingRoomId(null);
      await loadAdminData();
      setIsSubmittingRoom(false);
    },
    [selectedWorkspace, isAdmin, isSubmittingRoom, roomEditForm, loadAdminData],
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      if (!selectedWorkspace || !isAdmin || deletingRoomId) {
        return;
      }

      const room = rooms.find((item) => item.id === roomId);
      const confirmed = window.confirm(
        `Delete room${room ? ` "${room.name}"` : ''}? This action cannot be undone.`,
      );
      if (!confirmed) {
        return;
      }

      setDeletingRoomId(roomId);
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/rooms/${roomId}`, {
        method: 'DELETE',
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
        setDeletingRoomId(null);
        return;
      }

      setLocalBanner('Room deleted.');
      await loadAdminData();
      setDeletingRoomId(null);
    },
    [selectedWorkspace, isAdmin, deletingRoomId, rooms, loadAdminData],
  );

  const handleInvite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedWorkspace || !isAdmin || isSubmittingInvite) {
        return;
      }

      setIsSubmittingInvite(true);
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/invitations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
        }),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
        setIsSubmittingInvite(false);
        return;
      }

      setLocalBanner('Invitation sent.');
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
      setLocalError(null);
      setLocalBanner(null);

      const response = await fetch(`/api/workspaces/${selectedWorkspace.id}/cancel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(cancelWorkspaceForm),
      });
      const responsePayload = await safeReadJson(response);

      if (!response.ok) {
        setLocalError(normalizeErrorPayload(responsePayload, response.status));
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

  if (!isAdmin) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        UNAUTHORIZED: Only workspace admins can access this page.
      </p>
    );
  }

  return (
    <div className="space-y-6">
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
        <h3 className="text-lg font-semibold text-slate-900">Workspace Settings</h3>
        <p className="mt-1 text-sm text-slate-600">
          Update the workspace name and timezone used for booking displays and validations.
        </p>

        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
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

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmittingWorkspaceSettings}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmittingWorkspaceSettings ? 'Saving...' : 'Save Workspace Settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-semibold text-slate-900">Meeting Rooms</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void handleCreateRoom(event)}>
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

        {isLoadingData ? <p className="mt-3 text-sm text-slate-600">Loading rooms...</p> : null}

        {!isLoadingData && rooms.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No rooms created yet.</p>
        ) : null}

        {!isLoadingData && rooms.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {rooms.map((room) => {
              const isEditing = editingRoomId === room.id;

              return (
                <li key={room.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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
                          onClick={() => void handleDeleteRoom(room.id)}
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

        <form className="mt-3 flex flex-wrap items-center gap-3" onSubmit={(event) => void handleInvite(event)}>
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
                  <li key={member.userId} className="rounded-md border border-slate-200 bg-white p-2">
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
                  <li key={invitation.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="text-sm font-medium text-slate-900">{invitation.email}</p>
                    <p className="text-xs text-slate-600">
                      Expires {formatUtcInTimezone(invitation.expiresAt, selectedWorkspace.timezone)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-rose-300 bg-rose-50 p-4">
        <h3 className="text-lg font-semibold text-rose-900">Danger Zone</h3>
        <p className="mt-1 text-sm text-rose-800">
          Canceling a workspace permanently deletes rooms, reservations, members, and invitations.
        </p>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setIsCancelWorkspaceFormVisible((current) => !current);
              setCancelWorkspaceForm((previous) => ({
                ...previous,
                workspaceName: '',
                password: '',
              }));
            }}
            className="rounded-lg border border-rose-500 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            {isCancelWorkspaceFormVisible ? 'Close Workspace Cancel' : 'Cancel Workspace'}
          </button>
        </div>

        {isCancelWorkspaceFormVisible ? (
          <form className="mt-4 space-y-3" onSubmit={(event) => void handleCancelWorkspace(event)}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-rose-900">
                Workspace Name Confirmation
              </span>
              <p className="mb-2 text-xs text-rose-800">
                Type <span className="font-semibold">{selectedWorkspace.name}</span> to confirm.
              </p>
              <input
                required
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
              <span className="mb-1 block text-sm font-medium text-rose-900">Email (username)</span>
              <p className="mb-2 text-xs text-rose-800">
                Enter your admin account email address.
              </p>
              <input
                required
                type="email"
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
                Re-enter your password to complete the workspace cancellation.
              </p>
              <input
                required
                type="password"
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
                {isCancellingWorkspace ? 'Cancelling Workspace...' : 'Confirm Workspace Cancel'}
              </button>
              <button
                type="button"
                onClick={() => setIsCancelWorkspaceFormVisible(false)}
                disabled={isCancellingWorkspace}
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep Workspace
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
