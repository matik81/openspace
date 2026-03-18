import { NextRequest, NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim();
    if (!token) {
      return NextResponse.json<ErrorPayload>(
        { code: 'BAD_REQUEST', message: 'token is required' },
        { status: 400 },
      );
    }

    const result = await proxyApiRequest({
      path: `/api/auth/register-invitation?token=${encodeURIComponent(token)}`,
      method: 'GET',
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
