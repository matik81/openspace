import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams({ auth: 'login' });
  if (resolvedSearchParams?.reason) {
    params.set('reason', resolvedSearchParams.reason);
  }

  redirect(`/?${params.toString()}`);
}
