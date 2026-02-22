import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

type BookingRouteContext = {
  params: {
    workspaceId: string;
    bookingId: string;
  };
};

export async function POST(request: NextRequest, context: BookingRouteContext): Promise<NextResponse> {
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

    const result = await proxyApiRequest({
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(
        bookingId,
      )}/cancel`,
      method: 'POST',
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
