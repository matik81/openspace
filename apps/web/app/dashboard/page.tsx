'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isRecord, normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import type {
  ErrorPayload,
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
} from '@/lib/types';

type WorkspaceItem = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  membership: {
    role: WorkspaceRole;
    status: MembershipStatus;
  } | null;
  invitation: {
    id: string;
    status: InvitationStatus;
    email: string;
    expiresAt: string;
    invitedByUserId: string;
    createdAt: string;
  } | null;
};

type WorkspaceListPayload = {
  items: WorkspaceItem[];
};

type InvitationAction = 'accept' | 'reject';

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<{
    invitationId: string;
    action: InvitationAction;
  } | null>(null);

  const pendingInvitationId = pendingInvitationAction?.invitationId ?? null;

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch('/api/workspaces', { method: 'GET', cache: 'no-store' });
    const payload = await safeReadJson(response);

    if (!response.ok) {
      const normalized = normalizeErrorPayload(payload, response.status);
      if (normalized.code === 'UNAUTHORIZED') {
        router.replace('/login?reason=session-expired');
        return;
      }

      if (normalized.code === 'EMAIL_NOT_VERIFIED') {
        router.replace('/verify-email');
        return;
      }

      setError(normalized);
      setIsLoading(false);
      return;
    }

    if (!isWorkspaceListPayload(payload)) {
      setError({
        code: 'BAD_GATEWAY',
        message: 'Unexpected workspace payload',
      });
      setIsLoading(false);
      return;
    }

    setItems(payload.items);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const pendingInvitationsCount = useMemo(
    () => items.filter((item) => item.invitation && item.invitation.status === 'PENDING').length,
    [items],
  );

  const handleInvitationAction = useCallback(
    async (invitationId: string, action: InvitationAction) => {
      setPendingInvitationAction({ invitationId, action });
      setError(null);
      setBanner(null);

      const response = await fetch(`/api/workspaces/invitations/${invitationId}/${action}`, {
        method: 'POST',
      });
      const payload = await safeReadJson(response);

      if (!response.ok) {
        const normalized = normalizeErrorPayload(payload, response.status);
        if (normalized.code === 'UNAUTHORIZED') {
          router.replace('/login?reason=session-expired');
          return;
        }

        setError(normalized);
        setPendingInvitationAction(null);
        return;
      }

      setBanner(action === 'accept' ? 'Invitation accepted.' : 'Invitation rejected.');
      await loadWorkspaces();
      setPendingInvitationAction(null);
    },
    [loadWorkspaces, router],
  );

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-slate-600">
              {pendingInvitationsCount > 0
                ? `You have ${pendingInvitationsCount} pending invitation${pendingInvitationsCount === 1 ? '' : 's'}.`
                : 'Your visible workspaces appear below.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadWorkspaces()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {banner ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {banner}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error.code}: {error.message}
          </p>
        ) : null}

        {isLoading ? <p className="mt-6 text-slate-600">Loading workspaces...</p> : null}

        {!isLoading && items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-slate-600">
            No workspace is visible for this account yet.
          </p>
        ) : null}

        {!isLoading ? (
          <ul className="mt-6 grid gap-4">
            {items.map((item) => {
              const hasPendingInvitation = item.invitation?.status === 'PENDING';
              const isActionInProgress = pendingInvitationId === item.invitation?.id;

              return (
                <li
                  key={item.id}
                  className={`rounded-xl border p-5 ${
                    hasPendingInvitation
                      ? 'border-amber-300 bg-amber-50/60'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">{item.name}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Timezone: <span className="font-medium">{item.timezone}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Created: {formatDateInTimezone(item.createdAt, item.timezone)}
                      </p>
                    </div>
                    {item.membership ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        {item.membership.role} · {item.membership.status}
                      </span>
                    ) : item.invitation ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Invitation {item.invitation.status}
                      </span>
                    ) : null}
                  </div>

                  {item.invitation?.status === 'PENDING' ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-white px-4 py-3">
                      <p className="text-sm text-slate-700">
                        Invitation for <span className="font-medium">{item.invitation.email}</span> expires{' '}
                        {formatDateInTimezone(item.invitation.expiresAt, item.timezone)}.
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleInvitationAction(item.invitation!.id, 'accept')
                          }
                          disabled={isActionInProgress}
                          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActionInProgress && pendingInvitationAction?.action === 'accept'
                            ? 'Accepting...'
                            : 'Accept'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleInvitationAction(item.invitation!.id, 'reject')
                          }
                          disabled={isActionInProgress}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActionInProgress && pendingInvitationAction?.action === 'reject'
                            ? 'Rejecting...'
                            : 'Reject'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

      </section>
    </main>
  );
}

function isWorkspaceListPayload(payload: unknown): payload is WorkspaceListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every(isWorkspaceItem);
}

function isWorkspaceItem(payload: unknown): payload is WorkspaceItem {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.id === 'string' &&
    typeof payload.name === 'string' &&
    typeof payload.timezone === 'string' &&
    typeof payload.createdAt === 'string' &&
    typeof payload.updatedAt === 'string' &&
    (payload.membership === null || isMembership(payload.membership)) &&
    (payload.invitation === null || isInvitation(payload.invitation))
  );
}

function isMembership(payload: unknown): payload is WorkspaceItem['membership'] {
  return (
    isRecord(payload) &&
    typeof payload.role === 'string' &&
    typeof payload.status === 'string'
  );
}

function isInvitation(payload: unknown): payload is WorkspaceItem['invitation'] {
  return (
    isRecord(payload) &&
    typeof payload.id === 'string' &&
    typeof payload.status === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.expiresAt === 'string' &&
    typeof payload.invitedByUserId === 'string' &&
    typeof payload.createdAt === 'string'
  );
}

function formatDateInTimezone(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
