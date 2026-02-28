export type ErrorPayload = {
  code: string;
  message: string;
};

export type WorkspaceRole = 'ADMIN' | 'MEMBER';

export type MembershipStatus = 'ACTIVE' | 'INACTIVE';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export type BookingStatus = 'ACTIVE' | 'CANCELLED';

export type BookingCriticality = 'HIGH' | 'MEDIUM' | 'LOW';

export type WorkspaceMembershipSummary = {
  role: WorkspaceRole;
  status: MembershipStatus;
};

export type WorkspaceInvitationSummary = {
  id: string;
  status: InvitationStatus;
  email: string;
  expiresAt: string;
  invitedByUserId: string;
  createdAt: string;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
  createdAt: string;
  updatedAt: string;
  membership: WorkspaceMembershipSummary | null;
  invitation: WorkspaceInvitationSummary | null;
};

export type WorkspaceListPayload = {
  items: WorkspaceItem[];
};

export type RoomItem = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomListPayload = {
  items: RoomItem[];
};

export type WorkspaceMemberListItem = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  joinedAt: string;
};

export type WorkspaceMemberListPayload = {
  items: WorkspaceMemberListItem[];
};

export type WorkspaceInvitationListPayload = {
  items: WorkspaceInvitationSummary[];
};

export type BookingListItem = {
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

export type BookingListPayload = {
  items: BookingListItem[];
};
