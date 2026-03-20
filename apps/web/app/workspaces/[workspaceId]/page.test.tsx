import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomItem, WorkspaceItem } from '@/lib/types';
import { writeWorkspaceSidebarState } from '@/lib/workspace-sidebar-state';
import WorkspacePage from './page';

const {
  currentUser,
  emptySearchParams,
  goToNextDayMock,
  goToPreviousDayMock,
  goToTodayMock,
  routerMock,
  routerReplaceMock,
  runInvitationActionMock,
  scheduleRoomOrders,
  selectedWorkspace,
  setDateKeyMock,
  setMonthKeyMock,
} = vi.hoisted(() => {
  const selectedWorkspace: WorkspaceItem = {
    id: 'workspace-1',
    name: 'Focus Lab',
    slug: 'focus-lab',
    timezone: 'UTC',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
    createdByUserId: 'user-1',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    scheduleVersions: [],
    membership: {
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    invitation: null,
  };

  return {
    selectedWorkspace,
    currentUser: {
      id: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    emptySearchParams: new URLSearchParams(),
    routerMock: {
      replace: vi.fn(),
    },
    routerReplaceMock: vi.fn(),
    runInvitationActionMock: vi.fn(),
    setDateKeyMock: vi.fn(),
    setMonthKeyMock: vi.fn(),
    goToTodayMock: vi.fn(),
    goToPreviousDayMock: vi.fn(),
    goToNextDayMock: vi.fn(),
    scheduleRoomOrders: [] as string[][],
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({
    workspaceId: selectedWorkspace.id,
    workspaceName: selectedWorkspace.slug,
  }),
  useRouter: () => routerMock,
  useSearchParams: () => emptySearchParams,
}));

vi.mock('@/hooks/useSharedSelectedDate', () => ({
  useSharedSelectedDate: () => ({
    dateKey: '2026-03-18',
    monthKey: '2026-03',
    setDateKey: setDateKeyMock,
    setMonthKey: setMonthKeyMock,
    goToToday: goToTodayMock,
    goToPreviousDay: goToPreviousDayMock,
    goToNextDay: goToNextDayMock,
  }),
}));

vi.mock('@/components/workspace-shell', () => ({
  WorkspaceShell: ({ children }: { children: (context: object) => unknown }) => {
    const rendered = children({
      selectedWorkspace,
      currentUser,
      isLoading: false,
      runInvitationAction: runInvitationActionMock,
      pendingInvitationAction: null,
    });

    if (rendered && typeof rendered === 'object' && 'main' in rendered) {
      return rendered.main;
    }

    return rendered;
  },
}));

vi.mock('@/components/calendar/DaySchedule', () => ({
  DaySchedule: ({ rooms }: { rooms: RoomItem[] }) => {
    const roomNames = rooms.map((room) => room.name);
    scheduleRoomOrders.push(roomNames);

    return <div data-testid="room-order">{roomNames.join(' | ')}</div>;
  },
}));

vi.mock('@/components/bookings/BookingModal', () => ({
  BookingModal: () => null,
}));

function buildRoom(id: string, name: string, createdAt: string): RoomItem {
  return {
    id,
    workspaceId: selectedWorkspace.id,
    name,
    description: null,
    status: 'ACTIVE',
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    scheduleRoomOrders.length = 0;
    routerReplaceMock.mockReset();
    routerMock.replace = routerReplaceMock;
    runInvitationActionMock.mockReset();
    setDateKeyMock.mockReset();
    setMonthKeyMock.mockReset();
    goToTodayMock.mockReset();
    goToPreviousDayMock.mockReset();
    goToNextDayMock.mockReset();
  });

  it('keeps room order stable after replacing cached sidebar data with fetched rooms', async () => {
    const roomPayload = [
      buildRoom('room-zulu', 'Zulu Room', '2026-03-10T08:00:00.000Z'),
      buildRoom('room-alpha', 'Alpha Room', '2026-03-09T08:00:00.000Z'),
    ];

    writeWorkspaceSidebarState(selectedWorkspace.id, {
      rooms: roomPayload,
      bookings: [],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith(`/api/workspaces/${selectedWorkspace.id}/rooms?`)) {
        return new Response(JSON.stringify({ items: roomPayload }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      if (url.startsWith(`/api/workspaces/${selectedWorkspace.id}/bookings?`)) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<WorkspacePage />);

    expect(await screen.findByTestId('room-order')).toHaveTextContent('Zulu Room | Alpha Room');

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          new RegExp(`/api/workspaces/${selectedWorkspace.id}/rooms\\?`).test(String(url)),
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          new RegExp(`/api/workspaces/${selectedWorkspace.id}/bookings\\?`).test(String(url)),
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId('room-order')).toHaveTextContent('Zulu Room | Alpha Room');
    });

    expect(scheduleRoomOrders).not.toContainEqual(['Alpha Room', 'Zulu Room']);
  });
});
