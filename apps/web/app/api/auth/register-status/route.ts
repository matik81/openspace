import { NextRequest, NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/backend-api';
import type { ErrorPayload } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const result = await proxyApiRequest({
      path: '/api/auth/register-status',
      method: 'GET',
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : undefined,
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
