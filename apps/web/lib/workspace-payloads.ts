import { isRecord } from './api-contract';
import type {
  WorkspaceAdminSummaryPayload,
  BookingListPayload,
  RoomListPayload,
  WorkspaceInvitationListPayload,
  WorkspaceListPayload,
  WorkspaceMemberListPayload,
} from './types';

export function isWorkspaceListPayload(payload: unknown): payload is WorkspaceListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.slug === 'string' &&
      typeof item.timezone === 'string' &&
      typeof item.scheduleStartHour === 'number' &&
      typeof item.scheduleEndHour === 'number' &&
      typeof item.createdAt === 'string' &&
      typeof item.updatedAt === 'string' &&
      (item.scheduleVersions === undefined ||
        (Array.isArray(item.scheduleVersions) &&
          item.scheduleVersions.every(
            (version) =>
              isRecord(version) &&
              typeof version.timezone === 'string' &&
              typeof version.scheduleStartHour === 'number' &&
              typeof version.scheduleEndHour === 'number' &&
              typeof version.effectiveFrom === 'string',
          ))) &&
      (item.membership === null || isMembership(item.membership)) &&
      (item.invitation === null || isInvitation(item.invitation))
    );
  });
}

export function isRoomListPayload(payload: unknown): payload is RoomListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.id === 'string' &&
      typeof item.workspaceId === 'string' &&
      typeof item.name === 'string' &&
      (item.description === null || typeof item.description === 'string') &&
      typeof item.status === 'string' &&
      (item.cancelledAt === null || typeof item.cancelledAt === 'string') &&
      typeof item.createdAt === 'string' &&
      typeof item.updatedAt === 'string'
    );
  });
}

export function isWorkspaceMemberListPayload(
  payload: unknown,
): payload is WorkspaceMemberListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.userId === 'string' &&
      typeof item.firstName === 'string' &&
      typeof item.lastName === 'string' &&
      typeof item.email === 'string' &&
      typeof item.role === 'string' &&
      typeof item.status === 'string' &&
      typeof item.joinedAt === 'string'
    );
  });
}

export function isWorkspaceInvitationListPayload(
  payload: unknown,
): payload is WorkspaceInvitationListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every(isInvitation);
}

export function isWorkspaceAdminSummaryPayload(
  payload: unknown,
): payload is WorkspaceAdminSummaryPayload {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    isRoomListPayload(payload.rooms) &&
    isWorkspaceMemberListPayload(payload.members) &&
    isWorkspaceInvitationListPayload(payload.invitations)
  );
}

export function isBookingListPayload(payload: unknown): payload is BookingListPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return false;
  }

  return payload.items.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.id === 'string' &&
      typeof item.workspaceId === 'string' &&
      typeof item.roomId === 'string' &&
      typeof item.roomName === 'string' &&
      typeof item.createdByUserId === 'string' &&
      typeof item.createdByDisplayName === 'string' &&
      typeof item.startAt === 'string' &&
      typeof item.endAt === 'string' &&
      typeof item.subject === 'string' &&
      typeof item.criticality === 'string' &&
      typeof item.status === 'string' &&
      typeof item.createdAt === 'string' &&
      typeof item.updatedAt === 'string'
    );
  });
}

function isMembership(payload: unknown): boolean {
  return (
    isRecord(payload) && typeof payload.role === 'string' && typeof payload.status === 'string'
  );
}

function isInvitation(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    typeof payload.id === 'string' &&
    typeof payload.status === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.expiresAt === 'string' &&
    typeof payload.invitedByUserId === 'string' &&
    typeof payload.createdAt === 'string'
  );
}
