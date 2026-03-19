import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PublicHomePage } from '@/components/public/PublicHomePage';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth-cookies';

function readFirstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const authMode = readFirstQueryValue(resolvedSearchParams?.auth);

  if (!authMode) {
    const cookieStore = await cookies();
    const hasSessionCookie =
      cookieStore.has(ACCESS_TOKEN_COOKIE) || cookieStore.has(REFRESH_TOKEN_COOKIE);

    if (hasSessionCookie) {
      redirect('/dashboard');
    }
  }

  return <PublicHomePage />;
}
