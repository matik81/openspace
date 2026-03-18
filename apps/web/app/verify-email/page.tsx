import { redirect } from 'next/navigation';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ registered?: string; token?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams({ auth: 'verify-email' });
  if (resolvedSearchParams?.registered) {
    params.set('registered', resolvedSearchParams.registered);
  }
  if (resolvedSearchParams?.token) {
    params.set('token', resolvedSearchParams.token);
  }

  redirect(`/?${params.toString()}`);
}
