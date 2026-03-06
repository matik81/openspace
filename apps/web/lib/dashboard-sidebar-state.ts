import type { BookingListItem } from './types';

export type DashboardSidebarState = {
  bookings: BookingListItem[];
};

const dashboardSidebarStateCache = new Map<string, DashboardSidebarState>();
const DASHBOARD_SIDEBAR_STORAGE_PREFIX = 'openspace:dashboard-sidebar:';

function getDashboardSidebarStorageKey(userId: string): string {
  return `${DASHBOARD_SIDEBAR_STORAGE_PREFIX}${userId}`;
}

export function readDashboardSidebarState(
  userId: string,
  visibleWorkspaceIds: readonly string[],
): DashboardSidebarState | undefined {
  if (!userId) {
    return undefined;
  }

  const cached = dashboardSidebarStateCache.get(userId);
  if (cached) {
    return {
      bookings: cached.bookings.filter((booking) => visibleWorkspaceIds.includes(booking.workspaceId)),
    };
  }
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(getDashboardSidebarStorageKey(userId));
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<DashboardSidebarState> | null;
    if (!parsed || !Array.isArray(parsed.bookings)) {
      return undefined;
    }

    const state: DashboardSidebarState = {
      bookings: parsed.bookings as BookingListItem[],
    };
    dashboardSidebarStateCache.set(userId, state);

    return {
      bookings: state.bookings.filter((booking) => visibleWorkspaceIds.includes(booking.workspaceId)),
    };
  } catch {
    return undefined;
  }
}

export function writeDashboardSidebarState(userId: string, state: DashboardSidebarState): void {
  if (!userId) {
    return;
  }

  dashboardSidebarStateCache.set(userId, state);
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(getDashboardSidebarStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage write failures and fall back to in-memory cache.
  }
}
