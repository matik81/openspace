import type { ErrorPayload } from './types';

const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  ACCOUNT_DELETE_CONFIRMATION_FAILED: 'The email or password you entered does not match your account.',
  PASSWORD_MISMATCH: 'The password confirmation does not match.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again.',
  UNAUTHORIZED: 'Your session is no longer valid. Please log in again.',
};

function normalizeSentence(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Something went wrong. Please try again.';
  }

  const first = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1);
  const normalized = `${first}${rest}`;

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

export function getErrorDisplayMessage(error: ErrorPayload | null | undefined): string {
  if (!error) {
    return 'Something went wrong. Please try again.';
  }

  const mappedMessage = ERROR_MESSAGE_BY_CODE[error.code] ?? error.message;
  return normalizeSentence(mappedMessage);
}
