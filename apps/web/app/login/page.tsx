import { redirect } from 'next/navigation';

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const params = new URLSearchParams({ auth: 'login' });
  if (searchParams?.reason) {
    params.set('reason', searchParams.reason);
  }

  redirect(`/?${params.toString()}`);
}
