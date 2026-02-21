import { NextRequest, NextResponse } from 'next/server';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' },
        { status: 400 },
      );
    }

    const firstName = getTrimmedString(body, 'firstName');
    const lastName = getTrimmedString(body, 'lastName');
    const email = getTrimmedString(body, 'email');
    const password = getTrimmedString(body, 'password');

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'firstName, lastName, email and password are required' },
        { status: 400 },
      );
    }

    const result = await proxyApiRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        firstName,
        lastName,
        email,
        password,
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
