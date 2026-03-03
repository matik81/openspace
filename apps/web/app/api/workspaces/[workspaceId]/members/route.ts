import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type WorkspaceRouteContext = {
  params: {
    workspaceId: string;
  };
};

export async function GET(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
  try {
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

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      method: 'GET',
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
