import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type LoginSuccessPayload = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' },
        { status: 400 },
      );
    }

    const email = getTrimmedString(body, 'email');
    const password = getTrimmedString(body, 'password');

    if (!email || !password) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'email and password are required' },
        { status: 400 },
      );
    }

    const result = await proxyApiRequest({
      path: '/api/auth/login',
      method: 'POST',
      body: {
        email,
        password,
      },
    });

    if (!result.ok) {
      const response = NextResponse.json<ErrorPayload>(result.payload, { status: result.status });
      clearAuthCookies(response);
      return response;
    }

    if (!isValidLoginPayload(result.payload)) {
      const response = NextResponse.json<ErrorPayload>(
        { code: 'BAD_GATEWAY', message: 'Unexpected login payload from API' },
        { status: 502 },
      );
      clearAuthCookies(response);
      return response;
    }

    const response = NextResponse.json(
      {
        user: result.payload.user,
      },
      { status: result.status },
    );
    setAuthCookies(response, {
      accessToken: result.payload.accessToken,
      refreshToken: result.payload.refreshToken,
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

function isValidLoginPayload(payload: unknown): payload is LoginSuccessPayload {
  if (!isRecord(payload)) {
    return false;
  }

  if (
    typeof payload.accessToken !== 'string' ||
    typeof payload.refreshToken !== 'string' ||
    !isRecord(payload.user)
  ) {
    return false;
  }

  return (
    typeof payload.user.id === 'string' &&
    typeof payload.user.email === 'string' &&
    typeof payload.user.firstName === 'string' &&
    typeof payload.user.lastName === 'string'
  );
}
