import { NextRequest, NextResponse } from 'next/server';
import {
  OPAQUE_TOKEN_MAX_LENGTH,
  PASSWORD_MAX_UTF8_BYTES,
  STRING_LENGTH_LIMITS,
} from '@openspace/shared';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import { getMaxLengthError, getMaxUtf8BytesError } from '@/lib/string-field-validation';
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
    const invitationToken = getTrimmedString(body, 'invitationToken');

    if (!firstName || !lastName || !password || (!email && !invitationToken)) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'firstName, lastName, password, and either email or invitationToken are required',
        },
        { status: 400 },
      );
    }

    const firstNameError = getMaxLengthError(
      firstName,
      'firstName',
      STRING_LENGTH_LIMITS.userFirstName,
    );
    if (firstNameError) {
      return NextResponse.json<ErrorPayload>(firstNameError, { status: 400 });
    }

    const lastNameError = getMaxLengthError(
      lastName,
      'lastName',
      STRING_LENGTH_LIMITS.userLastName,
    );
    if (lastNameError) {
      return NextResponse.json<ErrorPayload>(lastNameError, { status: 400 });
    }

    const passwordError = getMaxUtf8BytesError(password, 'password', PASSWORD_MAX_UTF8_BYTES);
    if (passwordError) {
      return NextResponse.json<ErrorPayload>(passwordError, { status: 400 });
    }

    if (email) {
      const emailError = getMaxLengthError(email, 'email', STRING_LENGTH_LIMITS.userEmail);
      if (emailError) {
        return NextResponse.json<ErrorPayload>(emailError, { status: 400 });
      }
    }

    if (invitationToken) {
      const invitationTokenError = getMaxLengthError(
        invitationToken,
        'invitationToken',
        OPAQUE_TOKEN_MAX_LENGTH,
      );
      if (invitationTokenError) {
        return NextResponse.json<ErrorPayload>(invitationTokenError, { status: 400 });
      }
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    const result = await proxyApiRequest({
      path: '/api/auth/register',
      method: 'POST',
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : undefined,
      body: {
        firstName,
        lastName,
        password,
        ...(email ? { email } : {}),
        ...(invitationToken ? { invitationToken } : {}),
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
