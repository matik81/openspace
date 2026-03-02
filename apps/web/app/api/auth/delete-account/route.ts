import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json<ErrorPayload>(
      {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json<ErrorPayload>(
      {
        code: 'BAD_REQUEST',
        message: 'Request body must be a JSON object',
      },
      { status: 400 },
    );
  }

  const email = getTrimmedString(body, 'email');
  const password = getTrimmedString(body, 'password');
  if (!email || !password) {
    return NextResponse.json<ErrorPayload>(
      {
        code: 'BAD_REQUEST',
        message: 'email and password are required',
      },
      { status: 400 },
    );
  }

  const response = await proxyApiRequest({
    path: '/api/auth/delete-account',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      email,
      password,
    },
  });

  return NextResponse.json(response.payload, { status: response.status });
}
