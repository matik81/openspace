import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-cookies';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json(
    {
      loggedOut: true,
    },
    { status: 200 },
  );
  clearAuthCookies(response);
  return response;
}

