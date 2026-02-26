'use client';

import { DateTime } from 'luxon';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { isRecord, normalizeErrorPayload } from '@/lib/api-contract';
import { safeReadJson } from '@/lib/client-http';
import { IANA_TIMEZONES, resolveDefaultTimezone } from '@/lib/iana-timezones';
import type { ErrorPayload, WorkspaceItem } from '@/lib/types';
import { isWorkspaceListPayload } from '@/lib/workspace-payloads';

type InvitationAction = 'accept' | 'reject';

type CreateWorkspaceFormState = {
  name: string;
  timezone: string;
};

type AuthUserSummary = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type WorkspaceShellRenderContext = {
  items: WorkspaceItem[];
  selectedWorkspace: WorkspaceItem | null;
  currentUser: AuthUserSummary | null;
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

type WorkspaceShellPageLayout = {
  main: ReactNode;
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
};

type WorkspaceShellProps = {
  selectedWorkspaceId?: string;
  pageTitle: string;
  pageDescription: string;
  pageBackHref?: string;
  pageBackLabel?: string;
  pageBackAriaLabel?: string;
  children: (context: WorkspaceShellRenderContext) => ReactNode | WorkspaceShellPageLayout;
};

const SHELL_CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const createWorkspaceInitialState: CreateWorkspaceFormState = {
  name: '',
  timezone: 'UTC',
};

let workspaceItemsCache: WorkspaceItem[] | null = null;

function isAuthUserSummary(value: unknown): value is AuthUserSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string'
  );
}

function WorkspaceShellMiniCalendar({ timezone }: { timezone: string }) {
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd'),
  );
  const [calendarMonthKey, setCalendarMonthKey] = useState(() =>
    DateTime.now().setZone(timezone).toFormat('yyyy-LL'),
  );

  useEffect(() => {
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      return;
    }

    setSelectedDateKey(now.toFormat('yyyy-LL-dd'));
    setCalendarMonthKey(now.toFormat('yyyy-LL'));
  }, [timezone]);

  const todayDateKey = useMemo(() => DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd'), [timezone]);
  const calendarMonth = useMemo(() => {
    const parsed = DateTime.fromISO(`${calendarMonthKey}-01`, { zone: timezone });
    if (parsed.isValid) {
      return parsed.startOf('month');
    }

    return DateTime.now().setZone(timezone).startOf('month');
  }, [calendarMonthKey, timezone]);

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
      };
    });
  }, [calendarMonth, selectedDateKey, todayDateKey]);

  const jumpToToday = () => {
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      return;
    }

    setSelectedDateKey(now.toFormat('yyyy-LL-dd'));
    setCalendarMonthKey(now.toFormat('yyyy-LL'));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</p>
      <p className="mt-1 text-sm text-slate-900">{timezone}</p>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{calendarMonth.toFormat('LLLL yyyy')}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={jumpToToday}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonthKey(calendarMonth.minus({ months: 1 }).toFormat('yyyy-LL'))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              aria-label="Previous month"
            >
              {'<'}
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonthKey(calendarMonth.plus({ months: 1 }).toFormat('yyyy-LL'))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              aria-label="Next month"
            >
              {'>'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {SHELL_CALENDAR_WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}

          {calendarDayCells.map((cell) => (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => {
                setSelectedDateKey(cell.dateKey);
                setCalendarMonthKey(cell.dateKey.slice(0, 7));
              }}
              className={`relative h-8 rounded-md border text-xs font-medium transition ${
                cell.isSelected
                  ? 'border-brand bg-cyan-100 text-cyan-900'
                  : cell.isToday
                    ? 'border-slate-400 bg-white text-slate-900'
                    : cell.isCurrentMonth
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      : 'border-transparent bg-transparent text-slate-400 hover:bg-white/60'
              }`}
              aria-label={`Select ${cell.dateKey}`}
            >
              {cell.dayNumber}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceShell({
  selectedWorkspaceId,
  pageTitle,
  pageDescription,
  pageBackHref,
  pageBackLabel,
  pageBackAriaLabel,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>(() => workspaceItemsCache ?? []);
  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(workspaceItemsCache === null);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<{
    invitationId: string;
    action: InvitationAction;
  } | null>(null);
  const [isSavingWorkspaceOrder, setIsSavingWorkspaceOrder] = useState(false);
  const [isCreateWorkspaceFormVisible, setIsCreateWorkspaceFormVisible] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceForm, setCreateWorkspaceForm] = useState<CreateWorkspaceFormState>(
    createWorkspaceInitialState,
  );
  const [isLeftSidebarOpenMobile, setIsLeftSidebarOpenMobile] = useState(false);
  const [isRightSidebarOpenMobile, setIsRightSidebarOpenMobile] = useState(false);

  const selectedWorkspace = useMemo(
    () => items.find((item) => item.id === selectedWorkspaceId) ?? null,
    [items, selectedWorkspaceId],
  );
  const loadWorkspaces = useCallback(async () => {
    setIsLoading((current) => current || workspaceItemsCache === null);
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
    workspaceItemsCache = payload.items;

    const meResponse = await fetch('/api/auth/me', { method: 'GET', cache: 'no-store' });
    const mePayload = await safeReadJson(meResponse);
    if (meResponse.ok && isAuthUserSummary(mePayload)) {
      setCurrentUser(mePayload);
    } else if (!meResponse.ok) {
      const normalized = normalizeErrorPayload(mePayload, meResponse.status);
      if (normalized.code === 'UNAUTHORIZED') {
        router.replace('/login?reason=session-expired');
        return;
      }

      if (normalized.code === 'EMAIL_NOT_VERIFIED') {
        router.replace('/verify-email');
        return;
      }

      setCurrentUser(null);
    } else {
      setCurrentUser(null);
    }

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    workspaceItemsCache = items;
  }, [items]);

  useEffect(() => {
    setIsLeftSidebarOpenMobile(false);
    setIsRightSidebarOpenMobile(false);
  }, [selectedWorkspaceId]);

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

        const createdWorkspaceId =
          isRecord(payload) && typeof payload.id === 'string' ? payload.id : null;

        setBanner('Workspace created.');
        setIsCreateWorkspaceFormVisible(false);
        resetCreateWorkspaceForm();
        await loadWorkspaces();
        if (createdWorkspaceId) {
          router.push(`/workspaces/${createdWorkspaceId}/admin`);
          return;
        }
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
    workspaceItemsCache = null;
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const persistWorkspaceOrder = useCallback(
    async (nextItems: WorkspaceItem[]) => {
      setIsSavingWorkspaceOrder(true);
      setError(null);

      try {
        const response = await fetch('/api/workspaces/order', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspaceIds: nextItems.map((item) => item.id),
          }),
        });
        const payload = await safeReadJson(response);

        if (!response.ok) {
          const normalized = normalizeErrorPayload(payload, response.status);
          if (normalized.code === 'UNAUTHORIZED') {
            router.replace('/login?reason=session-expired');
            return false;
          }
          if (normalized.code === 'EMAIL_NOT_VERIFIED') {
            router.replace('/verify-email');
            return false;
          }
          setError(normalized);
          return false;
        }

        return true;
      } catch {
        setError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to reach API service',
        });
        return false;
      } finally {
        setIsSavingWorkspaceOrder(false);
      }
    },
    [router],
  );

  const handleReorderWorkspaces = useCallback(
    async (workspaceIds: string[]) => {
      if (isSavingWorkspaceOrder) {
        return;
      }

      const currentItems = items;
      const byId = new Map(currentItems.map((item) => [item.id, item]));
      const nextItems = workspaceIds
        .map((id) => byId.get(id) ?? null)
        .filter((item): item is WorkspaceItem => item !== null);

      if (nextItems.length !== currentItems.length) {
        return;
      }

      const unchanged = nextItems.every((item, index) => item.id === currentItems[index]?.id);
      if (unchanged) {
        return;
      }

      setItems(nextItems);
      workspaceItemsCache = nextItems;

      const saved = await persistWorkspaceOrder(nextItems);
      if (!saved) {
        setItems(currentItems);
        workspaceItemsCache = currentItems;
      }
    },
    [isSavingWorkspaceOrder, items, persistWorkspaceOrder],
  );

  const renderedChildren = children({
    items,
    selectedWorkspace,
    currentUser,
    isLoading,
    error,
    banner,
    pendingInvitationAction,
    loadWorkspaces,
    runInvitationAction,
  });
  const hasCustomLayout =
    renderedChildren !== null &&
    typeof renderedChildren === 'object' &&
    !Array.isArray(renderedChildren) &&
    'main' in renderedChildren;
  const pageMainContent = hasCustomLayout
    ? (renderedChildren as WorkspaceShellPageLayout).main
    : renderedChildren;
  const pageLeftSidebar = hasCustomLayout
    ? (renderedChildren as WorkspaceShellPageLayout).leftSidebar ?? null
    : null;
  const pageRightSidebar = hasCustomLayout
    ? (renderedChildren as WorkspaceShellPageLayout).rightSidebar ?? null
    : null;
  const effectiveRightSidebar =
    pageRightSidebar ??
    (
      <WorkspaceShellMiniCalendar
        timezone={selectedWorkspace?.timezone ?? resolveDefaultTimezone()}
      />
    );
  const hasPageHeader = Boolean(pageTitle || pageDescription);
  const hasTopBlockContent = hasPageHeader || Boolean(banner) || Boolean(error);
  const leftSidebarActions = selectedWorkspace
    ? [
        ...(selectedWorkspace.invitation?.status === 'PENDING' && !selectedWorkspace.membership
          ? ([
              {
                key: 'accept-invitation',
                label: 'Accept invitation',
                kind: 'primary' as const,
                loading:
                  pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id &&
                  pendingInvitationAction.action === 'accept',
                disabled: pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id,
                onClick: () => void runInvitationAction(selectedWorkspace.invitation!.id, 'accept'),
              },
              {
                key: 'reject-invitation',
                label: 'Reject invitation',
                kind: 'default' as const,
                loading:
                  pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id &&
                  pendingInvitationAction.action === 'reject',
                disabled: pendingInvitationAction?.invitationId === selectedWorkspace.invitation.id,
                onClick: () => void runInvitationAction(selectedWorkspace.invitation!.id, 'reject'),
              },
            ] as const)
          : []),
        ...(selectedWorkspace.membership?.status === 'ACTIVE' &&
        selectedWorkspace.membership.role === 'MEMBER'
          ? ([
              {
                key: 'leave-workspace',
                label: 'Leave workspace',
                kind: 'danger' as const,
                disabled: true,
                onClick: () => undefined,
              },
            ] as const)
          : []),
      ]
    : [];

  const createWorkspaceContent = (
    <div className="space-y-2">
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
        className="w-full rounded-lg border border-transparent bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95"
      >
        {isCreateWorkspaceFormVisible ? 'Close create form' : 'Create new workspace'}
      </button>

      {isCreateWorkspaceFormVisible ? (
        <form
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
          onSubmit={(event) => void handleCreateWorkspace(event)}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
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
            {isCreatingWorkspace ? 'Creating...' : 'Create workspace'}
          </button>
        </form>
      ) : null}
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <Header
        user={currentUser}
        onLogout={() => void handleLogout()}
        onToggleLeftSidebar={() => setIsLeftSidebarOpenMobile(true)}
        onToggleRightSidebar={() => setIsRightSidebarOpenMobile(true)}
      />

      <div className="flex h-full pt-16">
        <LeftSidebar
          isOpenOnMobile={isLeftSidebarOpenMobile}
          onCloseMobile={() => setIsLeftSidebarOpenMobile(false)}
          workspaces={items}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={(workspaceId) => router.push(`/workspaces/${workspaceId}`)}
          onReorderWorkspaces={(workspaceIds) => void handleReorderWorkspaces(workspaceIds)}
          isSavingWorkspaceOrder={isSavingWorkspaceOrder}
          actions={leftSidebarActions}
          createWorkspaceContent={createWorkspaceContent}
          extraContent={pageLeftSidebar}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="h-full p-3 sm:p-4">
              <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
                {hasPageHeader ? (
                  <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
                    {pageTitle ? (
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                          {pageTitle}
                        </h2>
                        {pageBackHref ? (
                          <Link
                            href={pageBackHref}
                            aria-label={pageBackAriaLabel ?? 'Close'}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            {pageBackLabel ?? 'Close'}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                    {pageDescription ? (
                      <p className="mt-1 text-sm text-slate-600">{pageDescription}</p>
                    ) : null}
                  </header>
                ) : null}

                {(banner || error) ? (
                  <div className="space-y-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                    {banner ? (
                      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        {banner}
                      </p>
                    ) : null}
                    {error ? (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {error.code}: {error.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div
                  className={`min-h-0 flex-1 overflow-y-auto ${
                    hasTopBlockContent ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
                  }`}
                >
                  {pageMainContent}
                </div>
              </section>
            </div>
          </div>

          <RightSidebar
            isOpenOnMobile={isRightSidebarOpenMobile}
            onCloseMobile={() => setIsRightSidebarOpenMobile(false)}
          >
            {effectiveRightSidebar}
          </RightSidebar>
        </div>
      </div>
    </div>
  );
}
