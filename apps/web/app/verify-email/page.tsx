import { redirect } from 'next/navigation';

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: { email?: string; registered?: string; token?: string };
}) {
  const params = new URLSearchParams({ auth: 'verify-email' });
  if (searchParams?.email) {
    params.set('email', searchParams.email);
  }
  if (searchParams?.registered) {
    params.set('registered', searchParams.registered);
  }
  if (searchParams?.token) {
    params.set('token', searchParams.token);
  }

  redirect(`/?${params.toString()}`);
}
