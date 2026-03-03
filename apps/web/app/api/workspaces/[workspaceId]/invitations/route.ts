import { NextRequest, NextResponse } from 'next/server';
import { getTrimmedString, isRecord } from '@/lib/api-contract';
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
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
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

export async function POST(request: NextRequest, context: WorkspaceRouteContext): Promise<NextResponse> {
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
    if (!email) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'email is required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
      method: 'POST',
      body: {
        email,
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
