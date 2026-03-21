import { NextRequest, NextResponse } from 'next/server';
import { OPAQUE_TOKEN_MAX_LENGTH } from '@openspace/shared';
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

    const token = getTrimmedString(body, 'token');
    if (!token) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'token is required' },
        { status: 400 },
      );
    }

    const tokenError = getMaxLengthError(token, 'token', OPAQUE_TOKEN_MAX_LENGTH);
    if (tokenError) {
      return NextResponse.json<ErrorPayload>(tokenError, { status: 400 });
    }

    const result = await proxyApiRequest({
      path: '/api/auth/verify-email',
      method: 'POST',
      body: {
        token,
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
