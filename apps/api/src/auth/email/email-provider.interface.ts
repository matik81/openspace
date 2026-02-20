export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type VerificationEmailPayload = {
  to: string;
  token: string;
};

export interface EmailProvider {
  sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
}

