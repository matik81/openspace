'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceItem } from '@/lib/types';

function getWorkspaceMetaLabel(workspace: WorkspaceItem): string {
  if (workspace.membership?.status === 'ACTIVE') {
    return workspace.membership.role === 'MEMBER' ? 'Member access' : '';
  }

  if (workspace.invitation?.status === 'PENDING') {
    return 'Pending invitation';
  }

  return workspace.timezone;
}

export function WorkspaceSwitcher({
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  workspaces: WorkspaceItem[];
  selectedWorkspace: WorkspaceItem | null;
  onSelectWorkspace: (workspace: WorkspaceItem) => void;
  onCreateWorkspace: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerLabel = selectedWorkspace?.name ?? 'Workspaces';
  const orderedWorkspaces = useMemo(() => workspaces, [workspaces]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-w-[152px] max-w-[210px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50 sm:min-w-[200px] sm:max-w-[280px]"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {triggerLabel}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
          role="menu"
        >
          <div className="px-2 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Workspaces
            </p>
          </div>

          {orderedWorkspaces.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-600">No visible workspaces yet.</p>
          ) : (
            <div className="space-y-1">
              {orderedWorkspaces.map((workspace) => {
                const isSelected = workspace.id === selectedWorkspace?.id;
                const hasPendingInvitation = workspace.invitation?.status === 'PENDING';

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onSelectWorkspace(workspace);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${
                      isSelected
                        ? 'bg-slate-100'
                        : hasPendingInvitation
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-slate-50'
                    }`}
                    role="menuitemradio"
                    aria-checked={isSelected}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                          : 'border-slate-200 bg-white text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                        <path
                          d="m3.5 8 2.5 2.5 6-6"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {workspace.name}
                      </span>
                      {getWorkspaceMetaLabel(workspace) ? (
                        <span
                          className={`block truncate text-xs ${
                            hasPendingInvitation ? 'text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          {getWorkspaceMetaLabel(workspace)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onCreateWorkspace();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              role="menuitem"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-cyan-800">
                +
              </span>
              <span>New workspace</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
