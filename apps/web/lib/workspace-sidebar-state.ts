import type { BookingListItem, RoomItem } from './types';

export type WorkspaceSidebarState = {
  rooms: RoomItem[];
  bookings: BookingListItem[];
};

const workspaceSidebarStateCache = new Map<string, WorkspaceSidebarState>();
const WORKSPACE_SIDEBAR_STORAGE_PREFIX = 'openspace:workspace-sidebar:';

function getWorkspaceSidebarStorageKey(workspaceId: string): string {
  return `${WORKSPACE_SIDEBAR_STORAGE_PREFIX}${workspaceId}`;
}

export function readWorkspaceSidebarState(workspaceId: string): WorkspaceSidebarState | undefined {
  const cached = workspaceSidebarStateCache.get(workspaceId);
  if (cached) {
    return cached;
  }
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(getWorkspaceSidebarStorageKey(workspaceId));
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<WorkspaceSidebarState> | null;
    if (!parsed || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.bookings)) {
      return undefined;
    }

    const state: WorkspaceSidebarState = {
      rooms: parsed.rooms as RoomItem[],
      bookings: parsed.bookings as BookingListItem[],
    };
    workspaceSidebarStateCache.set(workspaceId, state);
    return state;
  } catch {
    return undefined;
  }
}

export function writeWorkspaceSidebarState(
  workspaceId: string,
  state: WorkspaceSidebarState,
): void {
  workspaceSidebarStateCache.set(workspaceId, state);
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getWorkspaceSidebarStorageKey(workspaceId),
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage write failures and fall back to in-memory cache.
  }
}
