import { NextResponse } from 'next/server';

export const ACCESS_TOKEN_COOKIE = 'openspace_access_token';
export const REFRESH_TOKEN_COOKIE = 'openspace_refresh_token';

const sharedCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, sharedCookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, sharedCookieOptions);
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    ...sharedCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    ...sharedCookieOptions,
    maxAge: 0,
  });
}

