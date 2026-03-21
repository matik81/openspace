import { NextRequest, NextResponse } from 'next/server';
import { PASSWORD_MAX_UTF8_BYTES, STRING_LENGTH_LIMITS } from '@openspace/shared';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import { getMaxLengthError, getMaxUtf8BytesError } from '@/lib/string-field-validation';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest) {
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

  const emailError = getMaxLengthError(email, 'email', STRING_LENGTH_LIMITS.userEmail);
  if (emailError) {
    return NextResponse.json<ErrorPayload>(emailError, { status: 400 });
  }

  const passwordError = getMaxUtf8BytesError(password, 'password', PASSWORD_MAX_UTF8_BYTES);
  if (passwordError) {
    return NextResponse.json<ErrorPayload>(passwordError, { status: 400 });
  }

  return proxyAuthenticatedApiRequest(request, {
    path: '/api/auth/delete-account',
    method: 'POST',
    body: {
      email,
      password,
    },
  });
}
