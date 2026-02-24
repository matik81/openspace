'use client';

import { DateTime } from 'luxon';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

type WorkspaceShellPageLayout = {
  main: ReactNode;
  rightSidebar?: ReactNode;
};

type WorkspaceShellProps = {
  selectedWorkspaceId?: string;
  pageTitle: string;
  pageDescription: string;
  children: (context: WorkspaceShellRenderContext) => ReactNode | WorkspaceShellPageLayout;
};

const SHELL_CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const createWorkspaceInitialState: CreateWorkspaceFormState = {
  name: '',
  timezone: 'UTC',
};

let workspaceItemsCache: WorkspaceItem[] | null = null;

type SortableWorkspaceListItemProps = {
  item: WorkspaceItem;
  selectedWorkspaceId?: string;
  pendingInvitationAction:
    | {
        invitationId: string;
        action: InvitationAction;
      }
    | null;
  runInvitationAction: (invitationId: string, action: InvitationAction) => Promise<void>;
  isSavingWorkspaceOrder: boolean;
};

function SortableWorkspaceListItem({
  item,
  selectedWorkspaceId,
  pendingInvitationAction,
  runInvitationAction,
  isSavingWorkspaceOrder,
}: SortableWorkspaceListItemProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isSavingWorkspaceOrder,
  });

  const isSelected = item.id === selectedWorkspaceId;
  const hasPendingInvitation = item.invitation?.status === 'PENDING';
  const isActionInProgress = pendingInvitationAction?.invitationId === item.invitation?.id;
  const canOpenAdminPanel = item.membership?.role === 'ADMIN';
  const workspaceHref = `/workspaces/${item.id}`;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a,button')) {
          return;
        }

        router.push(workspaceHref);
      }}
      className={`rounded-lg border p-2 ${
        isSelected
          ? 'border-brand bg-cyan-50 hover:bg-cyan-100'
          : hasPendingInvitation
            ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
            : 'border-slate-200 bg-slate-50 hover:bg-white'
      } ${isDragging ? 'z-10 opacity-90 shadow-lg ring-2 ring-brand/20' : ''} relative cursor-pointer transition-colors`}
    >
      <div className="absolute bottom-2 right-2 top-2 flex flex-col items-end justify-between">
        <button
          ref={setActivatorNodeRef}
          type="button"
          disabled={isSavingWorkspaceOrder}
          aria-label={`Drag ${item.name} to reorder`}
          title="Drag to reorder"
          className="cursor-grab touch-none rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold tracking-widest text-slate-700 transition hover:bg-slate-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60"
          {...attributes}
          {...listeners}
        >
          |||
        </button>

        {canOpenAdminPanel ? (
          <Link
            href={`/workspaces/${item.id}/admin`}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Admin
          </Link>
        ) : null}
      </div>

      <div className={`rounded-md px-1 py-1 ${canOpenAdminPanel ? 'pr-20' : 'pr-10'}`}>
        <Link
          href={workspaceHref}
          draggable={false}
          className="block rounded-md"
        >
          <p className="text-sm font-semibold text-slate-900">{item.name}</p>
          <p className="mt-0.5 text-xs text-slate-600">{item.timezone}</p>
        </Link>

        <p className="mt-1 text-xs uppercase tracking-wide text-slate-600">
          {item.membership
            ? `${item.membership.role} / ${item.membership.status}`
            : item.invitation
              ? `Invitation ${item.invitation.status}`
              : 'Unknown'}
        </p>
      </div>

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
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>(() => workspaceItemsCache ?? []);
  const [isLoading, setIsLoading] = useState(workspaceItemsCache === null);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<{
    invitationId: string;
    action: InvitationAction;
  } | null>(null);
  const [isSavingWorkspaceOrder, setIsSavingWorkspaceOrder] = useState(false);
  const [activeSortWorkspaceId, setActiveSortWorkspaceId] = useState<string | null>(null);
  const [isCreateWorkspaceFormVisible, setIsCreateWorkspaceFormVisible] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceForm, setCreateWorkspaceForm] = useState<CreateWorkspaceFormState>(
    createWorkspaceInitialState,
  );

  const selectedWorkspace = useMemo(
    () => items.find((item) => item.id === selectedWorkspaceId) ?? null,
    [items, selectedWorkspaceId],
  );
  const workspaceSortSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
    workspaceItemsCache = payload.items;
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    workspaceItemsCache = items;
  }, [items]);

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

  const handleWorkspaceSortStart = useCallback(
    (event: { active: { id: string | number } }) => {
      setActiveSortWorkspaceId(String(event.active.id));
    },
    [],
  );

  const handleWorkspaceSortCancel = useCallback(() => {
    setActiveSortWorkspaceId(null);
  }, []);

  const handleWorkspaceSortEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveSortWorkspaceId(null);

      if (isSavingWorkspaceOrder) {
        return;
      }

      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const currentItems = items;
      const oldIndex = currentItems.findIndex((item) => item.id === String(active.id));
      const newIndex = currentItems.findIndex((item) => item.id === String(over.id));

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return;
      }

      const nextItems = arrayMove(currentItems, oldIndex, newIndex);
      setItems(nextItems);

      const isSaved = await persistWorkspaceOrder(nextItems);
      if (!isSaved) {
        setItems(currentItems);
      }
    },
    [isSavingWorkspaceOrder, items, persistWorkspaceOrder],
  );

  const handleLogout = useCallback(async () => {
    workspaceItemsCache = null;
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const renderedChildren = children({
    items,
    selectedWorkspace,
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:w-72 lg:self-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
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
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>

          <div className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your Workspaces
            </h2>
            {isLoading && items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Loading...</p>
            ) : null}

            {!isLoading && items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No visible workspaces.</p>
            ) : null}

            {!isLoading || items.length > 0 ? (
              <DndContext
                sensors={workspaceSortSensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                onDragStart={handleWorkspaceSortStart}
                onDragCancel={handleWorkspaceSortCancel}
                onDragEnd={(event) => void handleWorkspaceSortEnd(event)}
              >
                <SortableContext
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul
                    className={`mt-2 space-y-2 ${
                      activeSortWorkspaceId ? 'select-none' : ''
                    }`}
                  >
                    {items.map((item) => (
                      <SortableWorkspaceListItem
                        key={item.id}
                        item={item}
                        selectedWorkspaceId={selectedWorkspaceId}
                        pendingInvitationAction={pendingInvitationAction}
                        runInvitationAction={runInvitationAction}
                        isSavingWorkspaceOrder={isSavingWorkspaceOrder}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : null}
            {!isLoading && items.length > 1 && isSavingWorkspaceOrder ? (
              <p className="mt-2 text-xs text-slate-500">Saving workspace order...</p>
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

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-6 xl:flex-row">
            <section className="min-h-[70vh] min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {hasPageHeader ? (
                <header>
                  {pageTitle ? <h2 className="text-2xl font-bold text-slate-900">{pageTitle}</h2> : null}
                  {pageDescription ? (
                    <p className="mt-2 text-sm text-slate-600">{pageDescription}</p>
                  ) : null}
                </header>
              ) : null}

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

              <div className={hasTopBlockContent ? 'mt-6' : 'mt-0'}>{pageMainContent}</div>
            </section>

            <aside className="w-full xl:sticky xl:top-6 xl:w-72 xl:self-start">
              {effectiveRightSidebar}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
