import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type WorkspaceRouteContext = {
  params: {
    workspaceId: string;
  };
};

export async function GET(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
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

    const workspaceId = context.params.workspaceId?.trim();
    if (!workspaceId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId is required',
        },
        { status: 400 },
      );
    }

    const query = request.nextUrl.searchParams.toString();
    const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/bookings${
      query.length > 0 ? `?${query}` : ''
    }`;

    const result = await proxyApiRequest({
      path,
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

export async function POST(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
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

    const workspaceId = context.params.workspaceId?.trim();
    if (!workspaceId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId is required',
        },
        { status: 400 },
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

    const roomId = getTrimmedString(body, 'roomId');
    const startAt = getTrimmedString(body, 'startAt');
    const endAt = getTrimmedString(body, 'endAt');
    const subject = getTrimmedString(body, 'subject');
    if (!roomId || !startAt || !endAt || !subject) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'roomId, startAt, endAt, and subject are required',
        },
        { status: 400 },
      );
    }

    let criticality: string | undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'criticality')) {
      criticality = getTrimmedString(body, 'criticality') ?? undefined;
      if (!criticality) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'criticality must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }
    }

    const result = await proxyApiRequest({
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/bookings`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body:
        criticality === undefined
          ? { roomId, startAt, endAt, subject }
          : { roomId, startAt, endAt, subject, criticality },
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
