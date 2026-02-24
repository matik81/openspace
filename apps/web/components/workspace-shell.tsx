'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import { IANA_TIMEZONES, resolveDefaultTimezone } from '@/lib/iana-timezones';
import type { ErrorPayload, WorkspaceItem } from '@/lib/types';
import { isWorkspaceListPayload } from '@/lib/workspace-payloads';

type InvitationAction = 'accept' | 'reject';

type CreateWorkspaceFormState = {
  name: string;
  timezone: string;
};

export type WorkspaceShellRenderContext = {
  items: WorkspaceItem[];
  selectedWorkspace: WorkspaceItem | null;
  isLoading: boolean;
  error: ErrorPayload | null;
  banner: string | null;
  pendingInvitationAction:
    | {
        invitationId: string;
        action: InvitationAction;
      }
    | null;
  loadWorkspaces: () => Promise<void>;
  runInvitationAction: (invitationId: string, action: InvitationAction) => Promise<void>;
};

type WorkspaceShellProps = {
  selectedWorkspaceId?: string;
  pageTitle: string;
  pageDescription: string;
  children: (context: WorkspaceShellRenderContext) => ReactNode;
};

const createWorkspaceInitialState: CreateWorkspaceFormState = {
  name: '',
  timezone: 'UTC',
};

export function WorkspaceShell({
  selectedWorkspaceId,
  pageTitle,
  pageDescription,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<{
    invitationId: string;
    action: InvitationAction;
  } | null>(null);
  const [isCreateWorkspaceFormVisible, setIsCreateWorkspaceFormVisible] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceForm, setCreateWorkspaceForm] = useState<CreateWorkspaceFormState>(
    createWorkspaceInitialState,
  );

  const selectedWorkspace = useMemo(
    () => items.find((item) => item.id === selectedWorkspaceId) ?? null,
    [items, selectedWorkspaceId],
  );

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

  const resetCreateWorkspaceForm = useCallback(() => {
    setCreateWorkspaceForm({
      name: '',
      timezone: resolveDefaultTimezone(),
    });
  }, []);

  const runInvitationAction = useCallback(
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

  const handleCreateWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isCreatingWorkspace) {
        return;
      }

      setIsCreatingWorkspace(true);
      setError(null);
      setBanner(null);

      try {
        const response = await fetch('/api/workspaces', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            name: createWorkspaceForm.name,
            timezone: createWorkspaceForm.timezone,
          }),
        });
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
          return;
        }

        setBanner('Workspace created.');
        setIsCreateWorkspaceFormVisible(false);
        resetCreateWorkspaceForm();
        await loadWorkspaces();
      } catch {
        setError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to reach API service',
        });
      } finally {
        setIsCreatingWorkspace(false);
      }
    },
    [createWorkspaceForm, isCreatingWorkspace, loadWorkspaces, resetCreateWorkspaceForm, router],
  );

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:w-80 lg:self-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Workspaces</h1>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => void loadWorkspaces()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>

          <div className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your Workspaces</h2>
            {isLoading ? <p className="mt-2 text-sm text-slate-600">Loading...</p> : null}

            {!isLoading && items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No visible workspaces.</p>
            ) : null}

            {!isLoading ? (
              <ul className="mt-2 space-y-2">
                {items.map((item) => {
                  const isSelected = item.id === selectedWorkspaceId;
                  const hasPendingInvitation = item.invitation?.status === 'PENDING';
                  const isActionInProgress = pendingInvitationAction?.invitationId === item.invitation?.id;

                  return (
                    <li
                      key={item.id}
                      className={`rounded-lg border p-2 ${
                        isSelected
                          ? 'border-brand bg-cyan-50'
                          : hasPendingInvitation
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <Link
                        href={`/workspaces/${item.id}`}
                        className="block rounded-md px-1 py-1 transition hover:bg-white/70"
                      >
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{item.timezone}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-600">
                          {item.membership
                            ? `${item.membership.role} / ${item.membership.status}`
                            : item.invitation
                              ? `Invitation ${item.invitation.status}`
                              : 'Unknown'}
                        </p>
                      </Link>

                      {item.invitation?.status === 'PENDING' ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void runInvitationAction(item.invitation!.id, 'accept')}
                            disabled={isActionInProgress}
                            className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActionInProgress && pendingInvitationAction?.action === 'accept'
                              ? 'Accepting...'
                              : 'Accept'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runInvitationAction(item.invitation!.id, 'reject')}
                            disabled={isActionInProgress}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActionInProgress && pendingInvitationAction?.action === 'reject'
                              ? 'Rejecting...'
                              : 'Reject'}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() =>
                setIsCreateWorkspaceFormVisible((current) => {
                  const next = !current;
                  if (next) {
                    resetCreateWorkspaceForm();
                  }
                  return next;
                })
              }
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95"
            >
              {isCreateWorkspaceFormVisible ? 'Close Create Workspace' : 'Create Workspace'}
            </button>
          </div>

          {isCreateWorkspaceFormVisible ? (
            <form
              className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              onSubmit={(event) => void handleCreateWorkspace(event)}
            >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Name
                </span>
                <input
                  required
                  value={createWorkspaceForm.name}
                  onChange={(event) =>
                    setCreateWorkspaceForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Timezone
                </span>
                <select
                  required
                  value={createWorkspaceForm.timezone}
                  onChange={(event) =>
                    setCreateWorkspaceForm((previous) => ({
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

              <button
                type="submit"
                disabled={isCreatingWorkspace}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingWorkspace ? 'Creating...' : 'Create'}
              </button>
            </form>
          ) : null}
        </aside>

        <section className="min-h-[70vh] flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header>
            <h2 className="text-2xl font-bold text-slate-900">{pageTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{pageDescription}</p>
          </header>

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

          <div className="mt-6">
            {children({
              items,
              selectedWorkspace,
              isLoading,
              error,
              banner,
              pendingInvitationAction,
              loadWorkspaces,
              runInvitationAction,
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
