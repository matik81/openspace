import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
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
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
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
