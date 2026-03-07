import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type InvitationRouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

export async function POST(request: NextRequest, context: InvitationRouteContext): Promise<NextResponse> {
  try {
    const params = await context.params;
    const invitationId = params.invitationId?.trim();
    if (!invitationId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'invitationId is required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/invitations/${encodeURIComponent(invitationId)}/reject`,
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
