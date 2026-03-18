import { redirect } from 'next/navigation';

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

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();
  const invitationToken =
    readFirstQueryValue(resolvedSearchParams?.invitationToken) ??
    readFirstQueryValue(resolvedSearchParams?.token);
  const authMode = invitationToken ? 'register-invitation' : 'register';

  params.set('auth', authMode);

  for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
    const normalizedValue = readFirstQueryValue(value);
    if (!normalizedValue || key === 'auth') {
      continue;
    }

    params.set(key, normalizedValue);
  }

  if (invitationToken) {
    params.delete('token');
    params.delete('invitationToken');
    params.set('token', invitationToken);
  }

  redirect(`/?${params.toString()}`);
}
