import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        { status: 401 },
      );
    }

    const result = await proxyApiRequest({
      path: '/api/auth/refresh',
      method: 'POST',
      body: { refreshToken },
    });

    if (!result.ok) {
      const response = NextResponse.json(result.payload, { status: result.status });
      clearAuthCookies(response);
      return response;
    }

    if (!isRecord(result.payload)) {
      const response = NextResponse.json<ErrorPayload>(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to reach API service',
        },
        { status: 503 },
      );
      clearAuthCookies(response);
      return response;
    }

    const accessToken = getTrimmedString(result.payload, 'accessToken');
    const nextRefreshToken = getTrimmedString(result.payload, 'refreshToken');
    if (!accessToken || !nextRefreshToken) {
      const response = NextResponse.json<ErrorPayload>(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to reach API service',
        },
        { status: 503 },
      );
      clearAuthCookies(response);
      return response;
    }

    const response = NextResponse.json(
      {
        refreshed: true,
      },
      { status: 200 },
    );
    setAuthCookies(response, {
      accessToken,
      refreshToken: nextRefreshToken,
    });
    return response;
  } catch {
    const response = NextResponse.json<ErrorPayload>(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Unable to reach API service',
      },
      { status: 503 },
    );
    clearAuthCookies(response);
    return response;
  }
}
