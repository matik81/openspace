import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingListItem, RoomItem, WorkspaceItem } from '@/lib/types';
import { writeWorkspaceSidebarState } from '@/lib/workspace-sidebar-state';
import WorkspacePage from './page';

const {
  activeSearchParams,
  bookingModalRenderMock,
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
    activeSearchParams: {
      current: new URLSearchParams(),
    },
    bookingModalRenderMock: vi.fn(),
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
  useSearchParams: () => activeSearchParams.current,
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
  BookingModal: ({
    open,
    mode,
    draft,
    onClose,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    draft: { subject: string };
    onClose: () => void;
  }) => {
    bookingModalRenderMock({ open, mode, subject: draft.subject });
    return open ? (
      <div data-testid="booking-modal">
        <span>{`${mode}:${draft.subject}`}</span>
        <button type="button" onClick={onClose}>
          Close modal
        </button>
      </div>
    ) : null;
  },
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

function buildBooking({
  id,
  roomId,
  roomName,
  startAt,
  endAt,
  subject,
  createdByUserId = currentUser.id,
}: {
  id: string;
  roomId: string;
  roomName: string;
  startAt: string;
  endAt: string;
  subject: string;
  createdByUserId?: string;
}): BookingListItem {
  return {
    id,
    workspaceId: selectedWorkspace.id,
    roomId,
    roomName,
    createdByUserId,
    createdByDisplayName: `${currentUser.firstName} ${currentUser.lastName}`,
    startAt,
    endAt,
    subject,
    criticality: 'MEDIUM',
    status: 'ACTIVE',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  };
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    scheduleRoomOrders.length = 0;
    activeSearchParams.current = emptySearchParams;
    bookingModalRenderMock.mockReset();
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

  it('opens a requested booking only once in strict mode and removes the query param on close', async () => {
    activeSearchParams.current = new URLSearchParams(
      'bookingId=booking-requested&date=2026-04-02',
    );

    const roomPayload = [buildRoom('room-focus', 'Focus Room', '2026-03-10T08:00:00.000Z')];
    const bookingPayload = [
      buildBooking({
        id: 'booking-requested',
        roomId: 'room-focus',
        roomName: 'Focus Room',
        startAt: '2026-04-02T09:00:00.000Z',
        endAt: '2026-04-02T10:00:00.000Z',
        subject: 'Quarterly Review',
      }),
    ];

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
        return new Response(JSON.stringify({ items: bookingPayload }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <StrictMode>
        <WorkspacePage />
      </StrictMode>,
    );

    expect(await screen.findByTestId('booking-modal')).toHaveTextContent(
      'edit:Quarterly Review',
    );

    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(setDateKeyMock).toHaveBeenCalledWith('2026-04-02');
    expect(setMonthKeyMock).toHaveBeenCalledTimes(1);
    expect(setMonthKeyMock).toHaveBeenCalledWith('2026-04');

    screen.getByRole('button', { name: 'Close modal' }).click();

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/focus-lab', { scroll: false });
    });

    expect(routerReplaceMock).toHaveBeenCalledTimes(1);
  });
});
