import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type WorkspaceMemberRoleRouteContext = {
  params: Promise<{
    workspaceId: string;
    memberUserId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: WorkspaceMemberRoleRouteContext,
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const workspaceId = params.workspaceId?.trim();
    const memberUserId = params.memberUserId?.trim();
    if (!workspaceId || !memberUserId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId and memberUserId are required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberUserId)}/demote`,
      method: 'POST',
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
