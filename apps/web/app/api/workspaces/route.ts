import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const result = await proxyApiRequest({
      path: '/api/workspaces',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
        {
          code: 'BAD_REQUEST',
          message: 'Request body must be a JSON object',
        },
        { status: 400 },
      );
    }

    const name = getTrimmedString(body, 'name');
    if (!name) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'name is required',
        },
        { status: 400 },
      );
    }

    let timezone: string | undefined;
    let scheduleStartHour: number | undefined;
    let scheduleEndHour: number | undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'timezone')) {
      const candidate = getTrimmedString(body, 'timezone');
      if (!candidate) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'timezone must be a non-empty string',
          },
          { status: 400 },
        );
      }

      timezone = candidate;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'scheduleStartHour')) {
      if (
        typeof body.scheduleStartHour !== 'number' ||
        !Number.isInteger(body.scheduleStartHour)
      ) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'scheduleStartHour must be an integer when provided',
          },
          { status: 400 },
        );
      }

      scheduleStartHour = body.scheduleStartHour;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'scheduleEndHour')) {
      if (typeof body.scheduleEndHour !== 'number' || !Number.isInteger(body.scheduleEndHour)) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'scheduleEndHour must be an integer when provided',
          },
          { status: 400 },
        );
      }

      scheduleEndHour = body.scheduleEndHour;
    }

    const requestBody: {
      name: string;
      timezone?: string;
      scheduleStartHour?: number;
      scheduleEndHour?: number;
    } = { name };
    if (timezone) {
      requestBody.timezone = timezone;
    }
    if (scheduleStartHour !== undefined) {
      requestBody.scheduleStartHour = scheduleStartHour;
    }
    if (scheduleEndHour !== undefined) {
      requestBody.scheduleEndHour = scheduleEndHour;
    }

    const result = await proxyApiRequest({
      path: '/api/workspaces',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: requestBody,
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
