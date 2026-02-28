'use client';

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { WorkspaceItem } from '@/lib/types';

type SidebarAction =
  | {
      key: string;
      label: string;
      kind?: 'default' | 'danger' | 'primary';
      disabled?: boolean;
      loading?: boolean;
      onClick: () => void;
    }
  | {
      key: string;
      label: string;
      kind?: 'default' | 'danger' | 'primary';
      disabled?: boolean;
      href: string;
    };

function actionButtonClass(kind: SidebarAction['kind'] = 'default') {
  if (kind === 'primary') {
    return 'border-transparent bg-brand text-white hover:brightness-95';
  }
  if (kind === 'danger') {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100';
  }
  return 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
}

function SortableWorkspaceRow({
  item,
  selectedWorkspaceId,
  onSelectWorkspace,
  isSavingWorkspaceOrder,
  actions = [],
}: {
  item: WorkspaceItem;
  selectedWorkspaceId?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  isSavingWorkspaceOrder: boolean;
  actions?: SidebarAction[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isSavingWorkspaceOrder,
  });

  const isSelected = item.id === selectedWorkspaceId;
  const hasPendingInvitation = item.invitation?.status === 'PENDING';
  const canOpenAdminPanel = item.membership?.role === 'ADMIN';
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a,button')) {
          return;
        }
        onSelectWorkspace(item.id);
      }}
      className={`relative cursor-pointer rounded-lg border p-2 transition-colors ${
        isSelected
          ? 'border-brand bg-cyan-50 hover:bg-cyan-100'
          : hasPendingInvitation
            ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
            : 'border-slate-200 bg-white hover:bg-slate-50'
      } ${isDragging ? 'z-10 opacity-90 shadow-lg ring-2 ring-brand/20' : ''} ${isSavingWorkspaceOrder ? 'cursor-not-allowed' : 'active:cursor-grabbing'}`}
    >
      <div className="flex items-end justify-between gap-2 rounded-md px-1 py-1">
        <button
          type="button"
          onClick={() => onSelectWorkspace(item.id)}
          className="min-w-0 flex-1 rounded-md text-left"
        >
          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canOpenAdminPanel ? (
            <Link
              href={`/workspaces/${item.id}/admin`}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Admin
            </Link>
          ) : null}
          {actions.map((action) =>
            'href' in action ? (
              <Link
                key={action.key}
                href={action.href}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${actionButtonClass(action.kind)}`}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionButtonClass(action.kind)}`}
              >
                {action.loading ? `${action.label}...` : action.label}
              </button>
            ),
          )}
        </div>
      </div>
    </li>
  );
}

export function LeftSidebar({
  isOpenOnMobile,
  onCloseMobile,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onReorderWorkspaces,
  isSavingWorkspaceOrder = false,
  actions,
  workspaceActionsById,
  createWorkspaceContent,
  extraContent,
}: {
  isOpenOnMobile: boolean;
  onCloseMobile: () => void;
  workspaces: WorkspaceItem[];
  selectedWorkspaceId?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
  isSavingWorkspaceOrder?: boolean;
  actions: SidebarAction[];
  workspaceActionsById?: Record<string, SidebarAction[]>;
  createWorkspaceContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  const orderedWorkspaces = useMemo(() => workspaces, [workspaces]);
  const workspaceSortSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleWorkspaceSortEnd = (event: DragEndEvent) => {
    if (!onReorderWorkspaces || isSavingWorkspaceOrder) {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const ids = orderedWorkspaces.map((workspace) => workspace.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }
    onReorderWorkspaces(arrayMove(ids, oldIndex, newIndex));
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 lg:hidden">
        <p className="text-sm font-semibold text-slate-900">Workspace</p>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {orderedWorkspaces.length > 0 ? (
          <section className="space-y-2">
            <DndContext
              sensors={workspaceSortSensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
              onDragEnd={handleWorkspaceSortEnd}
            >
              <SortableContext
                items={orderedWorkspaces.map((workspace) => workspace.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {orderedWorkspaces.map((workspace) => (
                    <SortableWorkspaceRow
                      key={workspace.id}
                      item={workspace}
                      selectedWorkspaceId={selectedWorkspaceId}
                      onSelectWorkspace={onSelectWorkspace}
                      isSavingWorkspaceOrder={isSavingWorkspaceOrder}
                      actions={workspaceActionsById?.[workspace.id] ?? []}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </section>
        ) : null}

        {actions.length > 0 ? (
          <section className="space-y-2">
            <div className="grid gap-2">
              {actions.map((action) =>
                'href' in action ? (
                  <Link
                    key={action.key}
                    href={action.href}
                    className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${actionButtonClass(action.kind)}`}
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${actionButtonClass(action.kind)}`}
                  >
                    {action.loading ? `${action.label}...` : action.label}
                  </button>
                ),
              )}
            </div>
          </section>
        ) : null}

        {createWorkspaceContent ? (
          <section className="space-y-2">
            {createWorkspaceContent}
          </section>
        ) : null}

        {extraContent}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden h-full w-[260px] shrink-0 border-r border-slate-200 bg-slate-50 lg:block">
        {sidebar}
      </aside>

      {isOpenOnMobile ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close workspace sidebar"
          />
          <aside className="absolute inset-y-0 left-0 w-[86vw] max-w-[320px] border-r border-slate-200 bg-slate-50 shadow-xl">
            {sidebar}
          </aside>
        </div>
      ) : null}
    </>
  );
}
