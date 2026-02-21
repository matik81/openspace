import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies';

export default function HomePage() {
  const hasAccessToken = cookies().has(ACCESS_TOKEN_COOKIE);
  redirect(hasAccessToken ? '/dashboard' : '/login');
}
