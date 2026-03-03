import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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
        { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' },
        { status: 400 },
      );
    }

    const firstName = getTrimmedString(body, 'firstName');
    const lastName = getTrimmedString(body, 'lastName');
    const currentPassword = getTrimmedString(body, 'currentPassword');
    const newPassword = getTrimmedString(body, 'newPassword');

    if (!firstName || !lastName) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'firstName and lastName are required',
        },
        { status: 400 },
      );
    }

    if (newPassword && !currentPassword) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'CURRENT_PASSWORD_REQUIRED',
          message: 'currentPassword is required when changing password',
        },
        { status: 400 },
      );
    }

    const result = await proxyApiRequest({
      path: '/api/auth/update-account',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        firstName,
        lastName,
        ...(currentPassword ? { currentPassword } : {}),
        ...(newPassword ? { newPassword } : {}),
      },
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch {
    return NextResponse.json<ErrorPayload>(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Unable to reach API service',
      },
      { status: 503 },
    );
  }
}
