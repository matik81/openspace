import { NextRequest, NextResponse } from 'next/server';
import { STRING_LENGTH_LIMITS } from '@openspace/shared';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import { getMaxLengthError } from '@/lib/string-field-validation';
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

    const email = getTrimmedString(body, 'email');
    if (!email) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'email is required' },
        { status: 400 },
      );
    }

    const emailError = getMaxLengthError(email, 'email', STRING_LENGTH_LIMITS.userEmail);
    if (emailError) {
      return NextResponse.json<ErrorPayload>(emailError, { status: 400 });
    }

    const result = await proxyApiRequest({
      path: '/api/auth/request-password-reset',
      method: 'POST',
      body: { email },
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
