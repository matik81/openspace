export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_UTF8_BYTES = 72;
export const OPAQUE_TOKEN_MAX_LENGTH = 128;
export const REFRESH_TOKEN_MAX_LENGTH = 4096;

export const STRING_LENGTH_LIMITS = {
  userFirstName: 100,
  userLastName: 100,
  userEmail: 320,
  passwordHash: 255,
  refreshTokenHash: 128,
  workspaceName: 120,
  workspaceSlug: 100,
  workspaceTimezone: 100,
  invitationEmail: 320,
  tokenHash: 128,
  roomName: 120,
  roomDescription: 1000,
  bookingSubject: 200,
  ipAddress: 45,
} as const;

const utf8Encoder = new TextEncoder();

export function getUtf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

export function isWithinMaxLength(value: string, maxLength: number): boolean {
  return value.length <= maxLength;
}

export function isWithinMaxUtf8Bytes(value: string, maxBytes: number): boolean {
  return getUtf8ByteLength(value) <= maxBytes;
}

export function buildMaxLengthMessage(fieldName: string, maxLength: number): string {
  return `${fieldName} must be at most ${maxLength} characters`;
}

export function buildMaxUtf8BytesMessage(fieldName: string, maxBytes: number): string {
  return `${fieldName} must be at most ${maxBytes} UTF-8 bytes`;
}
