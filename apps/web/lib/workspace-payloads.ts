import { isRecord } from './api-contract';
import type {
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
      typeof item.timezone === 'string' &&
      typeof item.createdAt === 'string' &&
      typeof item.updatedAt === 'string' &&
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
    isRecord(payload) &&
    typeof payload.role === 'string' &&
    typeof payload.status === 'string'
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
