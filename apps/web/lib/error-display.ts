import type { ErrorPayload } from './types';
import {
  ERROR_MESSAGE_BY_CODE,
  ERROR_MESSAGE_BY_TEXT,
  FALLBACK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from './user-messages';

function normalizeSentence(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return FALLBACK_ERROR_MESSAGE;
  }

  const first = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1);
  const normalized = `${first}${rest}`;

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

export function getErrorDisplayMessage(error: ErrorPayload | null | undefined): string {
  if (!error) {
    return FALLBACK_ERROR_MESSAGE;
  }

  if (error.code === 'UNAUTHORIZED') {
    if (error.message.trim().toLowerCase() === 'invalid credentials') {
      return normalizeSentence(error.message);
    }

    return SESSION_EXPIRED_MESSAGE;
  }

  const mappedMessage = ERROR_MESSAGE_BY_CODE[error.code] ?? ERROR_MESSAGE_BY_TEXT[error.message] ?? error.message;
  return normalizeSentence(mappedMessage);
}
