import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_TOKEN_COOKIE, clearAuthCookies } from '@/lib/auth-cookies';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    try {
      const result = await proxyApiRequest({
        path: '/api/auth/logout',
        method: 'POST',
        body: { refreshToken },
      });

      if (!result.ok) {
        const response = NextResponse.json(result.payload, { status: result.status });
        clearAuthCookies(response);
        return response;
      }
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

  const response = NextResponse.json(
    {
      loggedOut: true,
    },
    { status: 200 },
  );
  clearAuthCookies(response);
  return response;
}
