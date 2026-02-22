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

    const result = await proxyApiRequest({
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms`,
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

    let description: string | undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      const value = getTrimmedString(body, 'description');
      if (!value) {
        return NextResponse.json<ErrorPayload>(
          {
            code: 'BAD_REQUEST',
            message: 'description must be a non-empty string when provided',
          },
          { status: 400 },
        );
      }

      description = value;
    }

    const result = await proxyApiRequest({
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/rooms`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: description === undefined ? { name } : { name, description },
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
