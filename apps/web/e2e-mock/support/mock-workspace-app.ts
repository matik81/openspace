import type { Page, Route } from '@playwright/test';
import { DateTime } from 'luxon';

type WorkspaceRole = 'ADMIN' | 'MEMBER';
type MembershipStatus = 'ACTIVE' | 'INACTIVE';
type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
type BookingStatus = 'ACTIVE' | 'CANCELLED';
type BookingCriticality = 'HIGH' | 'MEDIUM' | 'LOW';

type ErrorPayload = {
  code: string;
  message: string;
};

type AuthUserSummary = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

type WorkspaceMembershipSummary = {
  role: WorkspaceRole;
  status: MembershipStatus;
};

type WorkspaceInvitationSummary = {
  id: string;
  status: InvitationStatus;
  email: string;
  expiresAt: string;
  invitedByUserId: string;
  createdAt: string;
};

type WorkspaceScheduleVersion = {
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
  effectiveFrom: string;
};

type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
  createdAt: string;
  updatedAt: string;
  scheduleVersions?: WorkspaceScheduleVersion[];
  membership: WorkspaceMembershipSummary | null;
  invitation: WorkspaceInvitationSummary | null;
};

type RoomItem = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMemberListItem = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  joinedAt: string;
};

type BookingListItem = {
  id: string;
  workspaceId: string;
  roomId: string;
  roomName: string;
  createdByUserId: string;
  createdByDisplayName: string;
  startAt: string;
  endAt: string;
  subject: string;
  criticality: BookingCriticality;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
};

type ResponseOverride = {
  status: number;
  body: unknown;
};

export const MOCK_USER: AuthUserSummary = {
  id: 'user-ada',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Admin',
};

export const MOCK_IDS = {
  adminWorkspace: 'workspace-admin',
  memberWorkspace: 'workspace-member',
  pendingWorkspace: 'workspace-pending',
};

export const MOCK_NAMES = {
  adminWorkspace: 'Atlas HQ',
  memberWorkspace: 'Focus Hub',
  pendingWorkspace: 'Invite Only Lab',
};

export const MOCK_SLUGS = {
  adminWorkspace: 'atlas.hq',
  memberWorkspace: 'focus-hub',
  pendingWorkspace: 'invite.only.lab',
};

export function workspacePathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}`;
}

export function workspaceAdminPathBySlug(workspaceSlug: string): string {
  return `${workspacePathBySlug(workspaceSlug)}/admin`;
}

type MockWorkspaceAppState = {
  user: AuthUserSummary;
  workspaces: WorkspaceItem[];
  roomsByWorkspaceId: Record<string, RoomItem[]>;
  bookingsByWorkspaceId: Record<string, BookingListItem[]>;
  membersByWorkspaceId: Record<string, WorkspaceMemberListItem[]>;
  invitationsByWorkspaceId: Record<string, WorkspaceInvitationSummary[]>;
  counters: {
    workspace: number;
    room: number;
    booking: number;
    invitation: number;
  };
};

type MockWorkspaceAppOptions = {
  overrides?: {
    workspaces?: ResponseOverride;
    me?: ResponseOverride;
  };
  delays?: {
    bookingsMs?: number;
  };
};

const DEFAULT_TIMEZONE = 'Europe/Rome';
const DEFAULT_SCHEDULE = {
  startHour: 8,
  endHour: 18,
};

function nowInTimezone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

function buildUtcIso(dateKey: string, time: string, timezone: string): string {
  return (
    DateTime.fromFormat(`${dateKey} ${time}`, 'yyyy-LL-dd HH:mm', { zone: timezone })
      .toUTC()
      .toISO() ?? '2026-01-01T00:00:00.000Z'
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function responseJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function parseBody(route: Route): Record<string, unknown> | null {
  const raw = route.request().postData();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fullName(user: AuthUserSummary): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function createDefaultState(): MockWorkspaceAppState {
  const timezone = DEFAULT_TIMEZONE;
  const today = nowInTimezone(timezone).startOf('day');
  const todayDateKey = today.toFormat('yyyy-LL-dd');
  const tomorrowDateKey = today.plus({ days: 1 }).toFormat('yyyy-LL-dd');
  const createdAt = today.minus({ days: 14 }).toUTC().toISO() ?? '2026-01-01T00:00:00.000Z';
  const invitationCreatedAt =
    today.minus({ days: 1 }).toUTC().toISO() ?? '2026-01-01T00:00:00.000Z';
  const invitationExpiresAt = today.plus({ days: 3 }).toUTC().toISO() ?? '2026-01-05T00:00:00.000Z';

  const adminWorkspace: WorkspaceItem = {
    id: MOCK_IDS.adminWorkspace,
    name: MOCK_NAMES.adminWorkspace,
    slug: MOCK_SLUGS.adminWorkspace,
    timezone,
    scheduleStartHour: DEFAULT_SCHEDULE.startHour,
    scheduleEndHour: DEFAULT_SCHEDULE.endHour,
    createdAt,
    updatedAt: createdAt,
    scheduleVersions: [],
    membership: {
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    invitation: null,
  };

  const memberWorkspace: WorkspaceItem = {
    id: MOCK_IDS.memberWorkspace,
    name: MOCK_NAMES.memberWorkspace,
    slug: MOCK_SLUGS.memberWorkspace,
    timezone,
    scheduleStartHour: DEFAULT_SCHEDULE.startHour,
    scheduleEndHour: DEFAULT_SCHEDULE.endHour,
    createdAt,
    updatedAt: createdAt,
    scheduleVersions: [],
    membership: {
      role: 'MEMBER',
      status: 'ACTIVE',
    },
    invitation: null,
  };

  const pendingInvitation: WorkspaceInvitationSummary = {
    id: 'invitation-pending',
    status: 'PENDING',
    email: MOCK_USER.email,
    expiresAt: invitationExpiresAt,
    invitedByUserId: MOCK_USER.id,
    createdAt: invitationCreatedAt,
  };

  const pendingWorkspace: WorkspaceItem = {
    id: MOCK_IDS.pendingWorkspace,
    name: MOCK_NAMES.pendingWorkspace,
    slug: MOCK_SLUGS.pendingWorkspace,
    timezone,
    scheduleStartHour: DEFAULT_SCHEDULE.startHour,
    scheduleEndHour: DEFAULT_SCHEDULE.endHour,
    createdAt,
    updatedAt: createdAt,
    scheduleVersions: [],
    membership: null,
    invitation: pendingInvitation,
  };

  const roomsByWorkspaceId: Record<string, RoomItem[]> = {
    [MOCK_IDS.adminWorkspace]: [
      {
        id: 'room-focus',
        workspaceId: MOCK_IDS.adminWorkspace,
        name: 'Focus Room',
        description: 'Quiet room for heads-down work',
        status: 'ACTIVE',
        cancelledAt: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'room-collab',
        workspaceId: MOCK_IDS.adminWorkspace,
        name: 'Collab Hub',
        description: 'Shared collaboration room',
        status: 'ACTIVE',
        cancelledAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    [MOCK_IDS.memberWorkspace]: [
      {
        id: 'room-member-1',
        workspaceId: MOCK_IDS.memberWorkspace,
        name: 'Member Room',
        description: 'Team room',
        status: 'ACTIVE',
        cancelledAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    [MOCK_IDS.pendingWorkspace]: [
      {
        id: 'room-pending-1',
        workspaceId: MOCK_IDS.pendingWorkspace,
        name: 'Pending Preview',
        description: null,
        status: 'ACTIVE',
        cancelledAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };

  const displayName = fullName(MOCK_USER);
  const bookingsByWorkspaceId: Record<string, BookingListItem[]> = {
    [MOCK_IDS.adminWorkspace]: [
      {
        id: 'booking-admin-mine',
        workspaceId: MOCK_IDS.adminWorkspace,
        roomId: 'room-focus',
        roomName: 'Focus Room',
        createdByUserId: MOCK_USER.id,
        createdByDisplayName: displayName,
        startAt: buildUtcIso(todayDateKey, '09:00', timezone),
        endAt: buildUtcIso(todayDateKey, '10:00', timezone),
        subject: 'Deep Work',
        criticality: 'MEDIUM',
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'booking-admin-other',
        workspaceId: MOCK_IDS.adminWorkspace,
        roomId: 'room-collab',
        roomName: 'Collab Hub',
        createdByUserId: 'user-grace',
        createdByDisplayName: 'Grace Hopper',
        startAt: buildUtcIso(todayDateKey, '11:00', timezone),
        endAt: buildUtcIso(todayDateKey, '12:00', timezone),
        subject: 'Team Sync',
        criticality: 'HIGH',
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    [MOCK_IDS.memberWorkspace]: [
      {
        id: 'booking-member-mine',
        workspaceId: MOCK_IDS.memberWorkspace,
        roomId: 'room-member-1',
        roomName: 'Member Room',
        createdByUserId: MOCK_USER.id,
        createdByDisplayName: displayName,
        startAt: buildUtcIso(tomorrowDateKey, '14:00', timezone),
        endAt: buildUtcIso(tomorrowDateKey, '15:00', timezone),
        subject: 'Focus Session',
        criticality: 'LOW',
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    [MOCK_IDS.pendingWorkspace]: [],
  };

  const membersByWorkspaceId: Record<string, WorkspaceMemberListItem[]> = {
    [MOCK_IDS.adminWorkspace]: [
      {
        userId: MOCK_USER.id,
        firstName: MOCK_USER.firstName,
        lastName: MOCK_USER.lastName,
        email: MOCK_USER.email,
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
      {
        userId: 'user-grace',
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
      {
        userId: 'user-katherine',
        firstName: 'Katherine',
        lastName: 'Johnson',
        email: 'katherine@example.com',
        role: 'MEMBER',
        status: 'INACTIVE',
        joinedAt: createdAt,
      },
    ],
    [MOCK_IDS.memberWorkspace]: [
      {
        userId: MOCK_USER.id,
        firstName: MOCK_USER.firstName,
        lastName: MOCK_USER.lastName,
        email: MOCK_USER.email,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
    ],
    [MOCK_IDS.pendingWorkspace]: [],
  };

  const invitationsByWorkspaceId: Record<string, WorkspaceInvitationSummary[]> = {
    [MOCK_IDS.adminWorkspace]: [
      {
        id: 'invitation-existing',
        status: 'PENDING',
        email: 'new.member@example.com',
        expiresAt: invitationExpiresAt,
        invitedByUserId: MOCK_USER.id,
        createdAt: invitationCreatedAt,
      },
    ],
    [MOCK_IDS.memberWorkspace]: [],
    [MOCK_IDS.pendingWorkspace]: [],
  };

  return {
    user: cloneJson(MOCK_USER),
    workspaces: [adminWorkspace, memberWorkspace, pendingWorkspace].map((item) => cloneJson(item)),
    roomsByWorkspaceId: cloneJson(roomsByWorkspaceId),
    bookingsByWorkspaceId: cloneJson(bookingsByWorkspaceId),
    membersByWorkspaceId: cloneJson(membersByWorkspaceId),
    invitationsByWorkspaceId: cloneJson(invitationsByWorkspaceId),
    counters: {
      workspace: 1,
      room: 1,
      booking: 1,
      invitation: 2,
    },
  };
}

function findWorkspace(state: MockWorkspaceAppState, workspaceId: string) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

function activeRoomName(
  state: MockWorkspaceAppState,
  workspaceId: string,
  roomId: string,
): string | null {
  return (
    state.roomsByWorkspaceId[workspaceId]?.find(
      (room) => room.id === roomId && room.status === 'ACTIVE',
    )?.name ?? null
  );
}

function activeRooms(state: MockWorkspaceAppState, workspaceId: string): RoomItem[] {
  return (state.roomsByWorkspaceId[workspaceId] ?? []).filter((room) => room.status === 'ACTIVE');
}

function visibleWorkspaces(state: MockWorkspaceAppState): WorkspaceItem[] {
  return state.workspaces.filter(
    (workspace) =>
      workspace.membership?.status === 'ACTIVE' || workspace.invitation?.status === 'PENDING',
  );
}

export async function installMockWorkspaceApp(page: Page, options: MockWorkspaceAppOptions = {}) {
  const state = createDefaultState();

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === '/api/auth/register-status' && method === 'GET') {
      return responseJson(route, 200, { allowed: true });
    }

    if (pathname === '/api/workspaces' && method === 'GET' && options.overrides?.workspaces) {
      return responseJson(
        route,
        options.overrides.workspaces.status,
        options.overrides.workspaces.body,
      );
    }

    if (pathname === '/api/auth/me' && method === 'GET' && options.overrides?.me) {
      return responseJson(route, options.overrides.me.status, options.overrides.me.body);
    }

    if (pathname === '/api/workspaces' && method === 'GET') {
      return responseJson(route, 200, {
        items: cloneJson(visibleWorkspaces(state)),
      });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      return responseJson(route, 200, cloneJson(state.user));
    }

    if (pathname === '/api/auth/update-account' && method === 'POST') {
      const body = parseBody(route);
      state.user = {
        ...state.user,
        firstName: String(body?.firstName ?? state.user.firstName),
        lastName: String(body?.lastName ?? state.user.lastName),
      };
      const member = state.membersByWorkspaceId[MOCK_IDS.adminWorkspace]?.find(
        (item) => item.userId === state.user.id,
      );
      if (member) {
        member.firstName = state.user.firstName;
        member.lastName = state.user.lastName;
      }
      const memberWorkspaceMember = state.membersByWorkspaceId[MOCK_IDS.memberWorkspace]?.find(
        (item) => item.userId === state.user.id,
      );
      if (memberWorkspaceMember) {
        memberWorkspaceMember.firstName = state.user.firstName;
        memberWorkspaceMember.lastName = state.user.lastName;
      }
      return responseJson(route, 200, cloneJson(state.user));
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return responseJson(route, 200, { ok: true });
    }

    if (pathname === '/api/auth/delete-account' && method === 'POST') {
      state.workspaces = [];
      return responseJson(route, 200, { ok: true });
    }

    if (pathname === '/api/workspaces' && method === 'POST') {
      const body = parseBody(route);
      state.counters.workspace += 1;
      const workspaceId = `workspace-created-${state.counters.workspace}`;
      const createdAt = DateTime.now().toUTC().toISO() ?? '2026-01-01T00:00:00.000Z';
      const workspace: WorkspaceItem = {
        id: workspaceId,
        name: String(body?.name ?? 'New Workspace'),
        slug: String(body?.slug ?? `workspace-${state.counters.workspace}`),
        timezone: String(body?.timezone ?? DEFAULT_TIMEZONE),
        scheduleStartHour: Number(body?.scheduleStartHour ?? 8),
        scheduleEndHour: Number(body?.scheduleEndHour ?? 18),
        createdAt,
        updatedAt: createdAt,
        scheduleVersions: [],
        membership: {
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        invitation: null,
      };
      state.workspaces.push(workspace);
      state.roomsByWorkspaceId[workspaceId] = [];
      state.bookingsByWorkspaceId[workspaceId] = [];
      state.membersByWorkspaceId[workspaceId] = [
        {
          userId: state.user.id,
          firstName: state.user.firstName,
          lastName: state.user.lastName,
          email: state.user.email,
          role: 'ADMIN',
          status: 'ACTIVE',
          joinedAt: createdAt,
        },
      ];
      state.invitationsByWorkspaceId[workspaceId] = [];
      return responseJson(route, 201, { id: workspaceId });
    }

    const invitationActionMatch = pathname.match(
      /^\/api\/workspaces\/invitations\/([^/]+)\/(accept|reject|revoke)$/,
    );
    if (invitationActionMatch && method === 'POST') {
      const invitationId = invitationActionMatch[1];
      const action = invitationActionMatch[2];

      if (action === 'revoke') {
        const workspaceId = Object.keys(state.invitationsByWorkspaceId).find(
          (candidateWorkspaceId) =>
            (state.invitationsByWorkspaceId[candidateWorkspaceId] ?? []).some(
              (invitation) => invitation.id === invitationId,
            ),
        );

        if (!workspaceId) {
          return responseJson(route, 404, {
            code: 'NOT_FOUND',
            message: 'Invitation not found',
          } satisfies ErrorPayload);
        }

        state.invitationsByWorkspaceId[workspaceId] = (
          state.invitationsByWorkspaceId[workspaceId] ?? []
        ).filter((invitation) => invitation.id !== invitationId);

        return responseJson(route, 200, { revoked: true });
      }

      const workspace = state.workspaces.find(
        (item) => item.invitation?.id === invitationId || item.id === MOCK_IDS.pendingWorkspace,
      );

      if (!workspace || !workspace.invitation || workspace.invitation.id !== invitationId) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        } satisfies ErrorPayload);
      }

      if (action === 'accept') {
        workspace.membership = {
          role: 'MEMBER',
          status: 'ACTIVE',
        };
        workspace.invitation = null;
        state.membersByWorkspaceId[workspace.id] = [
          ...(state.membersByWorkspaceId[workspace.id] ?? []),
          {
            userId: state.user.id,
            firstName: state.user.firstName,
            lastName: state.user.lastName,
            email: state.user.email,
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: DateTime.now().toUTC().toISO() ?? workspace.createdAt,
          },
        ];
      } else {
        state.workspaces = state.workspaces.filter((item) => item.id !== workspace.id);
      }

      return responseJson(route, 200, { ok: true });
    }

    const leaveWorkspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/leave$/);
    if (leaveWorkspaceMatch && method === 'POST') {
      const workspaceId = leaveWorkspaceMatch[1];
      state.workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
      delete state.roomsByWorkspaceId[workspaceId];
      delete state.bookingsByWorkspaceId[workspaceId];
      delete state.membersByWorkspaceId[workspaceId];
      delete state.invitationsByWorkspaceId[workspaceId];
      return responseJson(route, 200, { ok: true });
    }

    const workspaceCancelMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/cancel$/);
    if (workspaceCancelMatch && method === 'POST') {
      const workspaceId = workspaceCancelMatch[1];
      state.workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
      delete state.roomsByWorkspaceId[workspaceId];
      delete state.bookingsByWorkspaceId[workspaceId];
      delete state.membersByWorkspaceId[workspaceId];
      delete state.invitationsByWorkspaceId[workspaceId];
      return responseJson(route, 200, { ok: true });
    }

    const workspacePatchMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (workspacePatchMatch && method === 'PATCH') {
      const workspaceId = workspacePatchMatch[1];
      const workspace = findWorkspace(state, workspaceId);
      const body = parseBody(route);

      if (!workspace) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        } satisfies ErrorPayload);
      }

      workspace.name = String(body?.name ?? workspace.name);
      workspace.slug = String(body?.slug ?? workspace.slug);
      workspace.timezone = String(body?.timezone ?? workspace.timezone);
      workspace.scheduleStartHour = Number(body?.scheduleStartHour ?? workspace.scheduleStartHour);
      workspace.scheduleEndHour = Number(body?.scheduleEndHour ?? workspace.scheduleEndHour);
      workspace.updatedAt = DateTime.now().toUTC().toISO() ?? workspace.updatedAt;
      return responseJson(route, 200, cloneJson(workspace));
    }

    const adminSummaryMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/admin-summary$/);
    if (adminSummaryMatch && method === 'GET') {
      const workspaceId = adminSummaryMatch[1];
      return responseJson(route, 200, {
        rooms: {
          items: cloneJson(activeRooms(state, workspaceId)),
        },
        members: {
          items: cloneJson(state.membersByWorkspaceId[workspaceId] ?? []),
        },
        invitations: {
          items: cloneJson(state.invitationsByWorkspaceId[workspaceId] ?? []),
        },
      });
    }

    const roomsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/rooms$/);
    if (roomsMatch && method === 'GET') {
      const workspaceId = roomsMatch[1];
      return responseJson(route, 200, {
        items: cloneJson(activeRooms(state, workspaceId)),
      });
    }

    if (roomsMatch && method === 'POST') {
      const workspaceId = roomsMatch[1];
      const body = parseBody(route);
      const createdAt = DateTime.now().toUTC().toISO() ?? '2026-01-01T00:00:00.000Z';
      state.counters.room += 1;
      const room: RoomItem = {
        id: `room-created-${state.counters.room}`,
        workspaceId,
        name: String(body?.name ?? 'New Room'),
        description:
          body?.description === undefined || body?.description === null
            ? null
            : String(body.description),
        status: 'ACTIVE',
        cancelledAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      state.roomsByWorkspaceId[workspaceId] = [
        ...(state.roomsByWorkspaceId[workspaceId] ?? []),
        room,
      ];
      return responseJson(route, 201, cloneJson(room));
    }

    const roomDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/rooms\/([^/]+)$/);
    if (roomDetailMatch && method === 'PATCH') {
      const [, workspaceId, roomId] = roomDetailMatch;
      const room = state.roomsByWorkspaceId[workspaceId]?.find((item) => item.id === roomId);
      const body = parseBody(route);

      if (!room) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Room not found',
        } satisfies ErrorPayload);
      }

      room.name = String(body?.name ?? room.name);
      room.description =
        body?.description === undefined
          ? room.description
          : body?.description === null
            ? null
            : String(body.description);
      room.updatedAt = DateTime.now().toUTC().toISO() ?? room.updatedAt;
      for (const booking of state.bookingsByWorkspaceId[workspaceId] ?? []) {
        if (booking.roomId === roomId) {
          booking.roomName = room.name;
        }
      }
      return responseJson(route, 200, cloneJson(room));
    }

    if (roomDetailMatch && method === 'DELETE') {
      const [, workspaceId, roomId] = roomDetailMatch;
      const room = state.roomsByWorkspaceId[workspaceId]?.find((item) => item.id === roomId);
      if (!room) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Room not found',
        } satisfies ErrorPayload);
      }

      room.status = 'CANCELLED';
      room.cancelledAt = DateTime.now().toUTC().toISO() ?? room.cancelledAt;
      for (const booking of state.bookingsByWorkspaceId[workspaceId] ?? []) {
        if (booking.roomId === roomId && booking.status === 'ACTIVE') {
          booking.status = 'CANCELLED';
        }
      }
      return responseJson(route, 200, { ok: true });
    }

    const membersMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/members$/);
    if (membersMatch && method === 'GET') {
      const workspaceId = membersMatch[1];
      return responseJson(route, 200, {
        items: cloneJson(
          (state.membersByWorkspaceId[workspaceId] ?? []).filter(
            (member) => member.status === 'ACTIVE',
          ),
        ),
      });
    }

    const memberDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/members\/([^/]+)$/);
    if (memberDetailMatch && method === 'DELETE') {
      const [, workspaceId, memberUserId] = memberDetailMatch;
      const member = state.membersByWorkspaceId[workspaceId]?.find(
        (item) => item.userId === memberUserId && item.status === 'ACTIVE',
      );

      if (!member) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Active workspace member not found',
        } satisfies ErrorPayload);
      }

      if (member.role === 'ADMIN') {
        return responseJson(route, 403, {
          code: 'ADMIN_CANNOT_BE_REMOVED',
          message: 'Workspace admins cannot be removed',
        } satisfies ErrorPayload);
      }

      member.status = 'INACTIVE';
      let cancelledBookingsCount = 0;
      for (const booking of state.bookingsByWorkspaceId[workspaceId] ?? []) {
        if (
          booking.createdByUserId === memberUserId &&
          booking.status === 'ACTIVE' &&
          DateTime.fromISO(booking.startAt, { zone: 'utc' }) >= DateTime.utc()
        ) {
          booking.status = 'CANCELLED';
          cancelledBookingsCount += 1;
        }
      }

      return responseJson(route, 200, {
        removed: true,
        cancelledBookingsCount,
      });
    }

    const invitationsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/invitations$/);
    if (invitationsMatch && method === 'GET') {
      const workspaceId = invitationsMatch[1];
      return responseJson(route, 200, {
        items: cloneJson(state.invitationsByWorkspaceId[workspaceId] ?? []),
      });
    }

    if (invitationsMatch && method === 'POST') {
      const workspaceId = invitationsMatch[1];
      const body = parseBody(route);
      state.counters.invitation += 1;
      const invitation: WorkspaceInvitationSummary = {
        id: `invitation-created-${state.counters.invitation}`,
        status: 'PENDING',
        email: String(body?.email ?? 'new.user@example.com'),
        expiresAt: DateTime.now().plus({ days: 5 }).toUTC().toISO() ?? '2026-01-05T00:00:00.000Z',
        invitedByUserId: state.user.id,
        createdAt: DateTime.now().toUTC().toISO() ?? '2026-01-01T00:00:00.000Z',
      };
      state.invitationsByWorkspaceId[workspaceId] = [
        invitation,
        ...(state.invitationsByWorkspaceId[workspaceId] ?? []),
      ];
      return responseJson(route, 201, cloneJson(invitation));
    }

    const bookingsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/bookings$/);
    if (bookingsMatch && method === 'GET') {
      const workspaceId = bookingsMatch[1];
      const mine = url.searchParams.get('mine') === 'true';
      const fromDate = url.searchParams.get('fromDate');
      const toDate = url.searchParams.get('toDate');
      const workspaceTimezone =
        state.workspaces.find((workspace) => workspace.id === workspaceId)?.timezone ?? 'UTC';
      const items = (state.bookingsByWorkspaceId[workspaceId] ?? []).filter((booking) => {
        if (mine && booking.createdByUserId !== state.user.id) {
          return false;
        }

        const localDateKey = DateTime.fromISO(booking.startAt, { zone: 'utc' })
          .setZone(workspaceTimezone)
          .toFormat('yyyy-LL-dd');
        if (fromDate && localDateKey < fromDate) {
          return false;
        }
        if (toDate && localDateKey > toDate) {
          return false;
        }

        return true;
      });
      if ((options.delays?.bookingsMs ?? 0) > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delays?.bookingsMs));
      }
      return responseJson(route, 200, {
        items: cloneJson(items),
      });
    }

    if (bookingsMatch && method === 'POST') {
      const workspaceId = bookingsMatch[1];
      const body = parseBody(route);
      state.counters.booking += 1;
      const createdAt = DateTime.now().toUTC().toISO() ?? '2026-01-01T00:00:00.000Z';
      const roomId = String(body?.roomId ?? '');
      const booking: BookingListItem = {
        id: `booking-created-${state.counters.booking}`,
        workspaceId,
        roomId,
        roomName: activeRoomName(state, workspaceId, roomId) ?? 'Unknown room',
        createdByUserId: state.user.id,
        createdByDisplayName: fullName(state.user),
        startAt: String(body?.startAt ?? createdAt),
        endAt: String(body?.endAt ?? createdAt),
        subject: String(body?.subject ?? 'New booking'),
        criticality: String(body?.criticality ?? 'MEDIUM') as BookingCriticality,
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      };
      state.bookingsByWorkspaceId[workspaceId] = [
        ...(state.bookingsByWorkspaceId[workspaceId] ?? []),
        booking,
      ];
      return responseJson(route, 201, cloneJson(booking));
    }

    const bookingDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/bookings\/([^/]+)$/);
    if (bookingDetailMatch && method === 'PATCH') {
      const [, workspaceId, bookingId] = bookingDetailMatch;
      const booking = state.bookingsByWorkspaceId[workspaceId]?.find(
        (item) => item.id === bookingId,
      );
      const body = parseBody(route);

      if (!booking) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Booking not found',
        } satisfies ErrorPayload);
      }

      const roomId = String(body?.roomId ?? booking.roomId);
      booking.roomId = roomId;
      booking.roomName = activeRoomName(state, workspaceId, roomId) ?? booking.roomName;
      booking.subject = String(body?.subject ?? booking.subject);
      booking.criticality = String(body?.criticality ?? booking.criticality) as BookingCriticality;
      booking.startAt = String(body?.startAt ?? booking.startAt);
      booking.endAt = String(body?.endAt ?? booking.endAt);
      booking.updatedAt = DateTime.now().toUTC().toISO() ?? booking.updatedAt;
      return responseJson(route, 200, cloneJson(booking));
    }

    const bookingCancelMatch = pathname.match(
      /^\/api\/workspaces\/([^/]+)\/bookings\/([^/]+)\/cancel$/,
    );
    if (bookingCancelMatch && method === 'POST') {
      const [, workspaceId, bookingId] = bookingCancelMatch;
      const booking = state.bookingsByWorkspaceId[workspaceId]?.find(
        (item) => item.id === bookingId,
      );
      if (!booking) {
        return responseJson(route, 404, {
          code: 'NOT_FOUND',
          message: 'Booking not found',
        } satisfies ErrorPayload);
      }

      booking.status = 'CANCELLED';
      booking.updatedAt = DateTime.now().toUTC().toISO() ?? booking.updatedAt;
      return responseJson(route, 200, { ok: true });
    }

    return responseJson(route, 500, {
      code: 'UNHANDLED_MOCK',
      message: `Unhandled mocked route: ${method} ${pathname}`,
    } satisfies ErrorPayload);
  });

  return {
    state,
  };
}
