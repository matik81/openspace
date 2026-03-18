export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type VerificationEmailPayload = {
  to: string;
  token: string;
};

export type PasswordResetEmailPayload = {
  to: string;
  token: string;
};

export type WorkspaceInvitationEmailPayload = {
  to: string;
  invitationToken: string;
  workspaceName: string;
  inviterName: string;
};

export interface EmailProvider {
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>;
  sendWorkspaceInvitationEmail(payload: WorkspaceInvitationEmailPayload): Promise<void>;
}
