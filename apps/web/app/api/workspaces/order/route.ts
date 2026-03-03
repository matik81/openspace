import { NextRequest, NextResponse } from 'next/server';
import { isRecord } from '@/lib/api-contract';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    const workspaceIds = body.workspaceIds;
    if (!Array.isArray(workspaceIds) || workspaceIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceIds must be an array of strings',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: '/api/workspaces/order',
      method: 'POST',
      body: {
        workspaceIds,
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
