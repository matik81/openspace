import { normalizeErrorPayload } from './api-contract';
import type { ErrorPayload } from './types';

export async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function readErrorPayload(response: Response): Promise<ErrorPayload> {
  const payload = await safeReadJson(response);
  return normalizeErrorPayload(payload, response.status);
}
