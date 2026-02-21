export type ErrorPayload = {
  code: string;
  message: string;
};

export type WorkspaceRole = 'ADMIN' | 'MEMBER';

export type MembershipStatus = 'ACTIVE' | 'INACTIVE';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

