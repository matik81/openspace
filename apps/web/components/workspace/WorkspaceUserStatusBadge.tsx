import type { WorkspaceItem } from '@/lib/types';

export type WorkspaceUserStatus = 'OWNER' | 'ADMIN' | 'ACTIVE' | 'INVITED' | 'INACTIVE';

const BASE_BADGE_CLASS_NAME =
  'inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.12em]';

const BADGE_CLASS_NAME_BY_STATUS: Record<WorkspaceUserStatus, string> = {
  OWNER: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  ADMIN: 'border-sky-200 bg-sky-100 text-sky-800',
  ACTIVE: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  INVITED: 'border-amber-200 bg-amber-100 text-amber-800',
  INACTIVE: 'border-slate-300 bg-slate-200 text-slate-700',
};

export function getWorkspaceUserStatusBadgeClassName(status: WorkspaceUserStatus): string {
  return `${BASE_BADGE_CLASS_NAME} ${BADGE_CLASS_NAME_BY_STATUS[status]}`;
}

export function resolveWorkspaceUserStatus({
  workspace,
  currentUserId,
}: {
  workspace: WorkspaceItem;
  currentUserId?: string;
}): WorkspaceUserStatus | null {
  if (workspace.membership?.status === 'ACTIVE') {
    if (currentUserId && workspace.createdByUserId === currentUserId) {
      return 'OWNER';
    }

    if (workspace.membership.role === 'ADMIN') {
      return 'ADMIN';
    }

    return 'ACTIVE';
  }

  if (workspace.invitation?.status === 'PENDING') {
    return 'INVITED';
  }

  return null;
}

export function WorkspaceUserStatusBadge({
  status,
  className,
}: {
  status: WorkspaceUserStatus;
  className?: string;
}) {
  return (
    <span className={`${getWorkspaceUserStatusBadgeClassName(status)}${className ? ` ${className}` : ''}`}>
      {status}
    </span>
  );
}
