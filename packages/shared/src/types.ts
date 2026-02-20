import {
  BookingCriticality,
  BookingStatus,
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
} from './enums';

export type ErrorPayload = {
  code: string;
  message: string;
};

export type WorkspaceVisibility = {
  workspaceId: string;
  memberStatus?: MembershipStatus;
  invitationStatus?: InvitationStatus;
};

export type WorkspaceMember = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
};

export type BookingRecord = {
  id: string;
  workspaceId: string;
  roomId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  criticality: BookingCriticality;
};

