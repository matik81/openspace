import { normalizeErrorPayload } from './api-contract';
import type { ErrorPayload } from './types';

type ProxyApiSuccess = {
  ok: true;
  status: number;
  payload: unknown;
};

type ProxyApiFailure = {
  ok: false;
  status: number;
  payload: ErrorPayload;
};

export type ProxyApiResult = ProxyApiSuccess | ProxyApiFailure;

function getApiBaseUrl(): string {
  const value = process.env.OPENSPACE_API_BASE_URL ?? 'http://localhost:3001';
  return value.replace(/\/+$/, '');
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? { message: text } : null;
  } catch {
    return null;
  }
}

export async function proxyApiRequest(options: {
  path: string;
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
}): Promise<ProxyApiResult> {
  const headers = new Headers(options.headers);
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    cache: 'no-store',
  };

  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(options.path), init);
  const payload = await readResponsePayload(response);

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      payload: payload ?? {},
    };
  }

  return {
    ok: false,
    status: response.status,
    payload: normalizeErrorPayload(payload, response.status),
  };
}
