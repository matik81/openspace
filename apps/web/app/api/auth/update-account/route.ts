import { NextRequest, NextResponse } from 'next/server';
import { PASSWORD_MAX_UTF8_BYTES, STRING_LENGTH_LIMITS } from '@openspace/shared';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
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

    if (currentPassword) {
      const currentPasswordError = getMaxUtf8BytesError(
        currentPassword,
        'currentPassword',
        PASSWORD_MAX_UTF8_BYTES,
      );
      if (currentPasswordError) {
        return NextResponse.json<ErrorPayload>(currentPasswordError, { status: 400 });
      }
    }

    if (newPassword) {
      const newPasswordError = getMaxUtf8BytesError(
        newPassword,
        'newPassword',
        PASSWORD_MAX_UTF8_BYTES,
      );
      if (newPasswordError) {
        return NextResponse.json<ErrorPayload>(newPasswordError, { status: 400 });
      }
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

    return proxyAuthenticatedApiRequest(request, {
      path: '/api/auth/update-account',
      method: 'POST',
      body: {
        firstName,
        lastName,
        ...(currentPassword ? { currentPassword } : {}),
        ...(newPassword ? { newPassword } : {}),
      },
    });
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
