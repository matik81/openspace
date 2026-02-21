import type { ErrorPayload } from './types';

const STATUS_ERROR_CODE_MAP: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  503: 'SERVICE_UNAVAILABLE',
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getTrimmedString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeErrorPayload(payload: unknown, status: number): ErrorPayload {
  const defaultCode = STATUS_ERROR_CODE_MAP[status] ?? `HTTP_${status}`;

  if (isRecord(payload)) {
    const code = getTrimmedString(payload, 'code') ?? defaultCode;
    const message =
      getTrimmedString(payload, 'message') ??
      (typeof payload.error === 'string' ? payload.error : null) ??
      'Request failed';

    return {
      code,
      message,
    };
  }

  return {
    code: defaultCode,
    message: 'Request failed',
  };
}
