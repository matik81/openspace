import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from './auth-cookies';
import { getTrimmedString, isRecord, normalizeErrorPayload } from './api-contract';
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

const AUTHENTICATION_REQUIRED_ERROR: ErrorPayload = {
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
};

const SERVICE_UNAVAILABLE_ERROR: ErrorPayload = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'Unable to reach API service',
};

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

function createErrorResponse(payload: ErrorPayload, status: number): NextResponse {
  return NextResponse.json<ErrorPayload>(payload, { status });
}

function createProxyResponse(result: ProxyApiResult): NextResponse {
  return NextResponse.json(result.payload, { status: result.status });
}

function extractTokenPair(payload: unknown): { accessToken: string; refreshToken: string } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const accessToken = getTrimmedString(payload, 'accessToken');
  const refreshToken = getTrimmedString(payload, 'refreshToken');

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function buildAuthenticatedHeaders(headers: HeadersInit | undefined, accessToken: string): Headers {
  const authenticatedHeaders = new Headers(headers);
  authenticatedHeaders.set('Authorization', `Bearer ${accessToken}`);
  return authenticatedHeaders;
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

export async function proxyAuthenticatedApiRequest(
  request: NextRequest,
  options: {
    path: string;
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  },
): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return createErrorResponse(AUTHENTICATION_REQUIRED_ERROR, 401);
  }

  try {
    const executeAuthenticatedRequest = async (token: string) =>
      proxyApiRequest({
        ...options,
        headers: buildAuthenticatedHeaders(options.headers, token),
      });

    if (accessToken) {
      const initialResult = await executeAuthenticatedRequest(accessToken);
      if (initialResult.status !== 401) {
        return createProxyResponse(initialResult);
      }
    }

    if (!refreshToken) {
      const response = createErrorResponse(AUTHENTICATION_REQUIRED_ERROR, 401);
      clearAuthCookies(response);
      return response;
    }

    const refreshResult = await proxyApiRequest({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken },
    });

    if (!refreshResult.ok) {
      const response = createProxyResponse(refreshResult);
      clearAuthCookies(response);
      return response;
    }

    const refreshedTokens = extractTokenPair(refreshResult.payload);
    if (!refreshedTokens) {
      const response = createErrorResponse(SERVICE_UNAVAILABLE_ERROR, 503);
      clearAuthCookies(response);
      return response;
    }

    const retryResult = await executeAuthenticatedRequest(refreshedTokens.accessToken);
    const response = createProxyResponse(retryResult);

    if (retryResult.status === 401) {
      clearAuthCookies(response);
      return response;
    }

    setAuthCookies(response, refreshedTokens);
    return response;
  } catch {
    return createErrorResponse(SERVICE_UNAVAILABLE_ERROR, 503);
  }
}
