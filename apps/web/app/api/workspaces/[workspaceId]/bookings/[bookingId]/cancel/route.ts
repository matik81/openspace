import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type BookingRouteContext = {
  params: {
    workspaceId: string;
    bookingId: string;
  };
};

export async function POST(request: NextRequest, context: BookingRouteContext): Promise<NextResponse> {
  try {
    const workspaceId = context.params.workspaceId?.trim();
    const bookingId = context.params.bookingId?.trim();
    if (!workspaceId || !bookingId) {
      return NextResponse.json<ErrorPayload>(
        {
          code: 'BAD_REQUEST',
          message: 'workspaceId and bookingId are required',
        },
        { status: 400 },
      );
    }

    return proxyAuthenticatedApiRequest(request, {
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(
        bookingId,
      )}/cancel`,
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
