'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { readErrorPayload } from '@/lib/client-http';
import type { ErrorPayload } from '@/lib/types';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailPageSkeleton />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const email = searchParams.get('email');
  const registered = searchParams.get('registered') === '1';

  const [token, setToken] = useState(initialToken);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setIsVerified(false);

    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    setIsVerified(true);
    setIsSubmitting(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-2 text-slate-600">
          Enter the verification token sent to your email address.
        </p>
        {registered && email ? (
          <p className="mt-4 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-slate-700">
            Registration complete for <strong>{email}</strong>. Paste your token here to activate login access.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error.code}: {error.message}
          </p>
        ) : null}

        {isVerified ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Email verified. You can now log in.
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Verification token</span>
            <input
              required
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Paste token"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Ready to continue?{' '}
          <Link className="font-medium text-brand underline-offset-2 hover:underline" href="/login">
            Go to login
          </Link>
        </p>
      </section>
    </main>
  );
}

function VerifyEmailPageSkeleton() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">OpenSpace</p>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-2 text-slate-600">Loading...</p>
      </section>
    </main>
  );
}
