'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { readErrorPayload } from '@/lib/client-http';
import type { ErrorPayload } from '@/lib/types';

export type AuthMode = 'login' | 'register' | 'verify-email';

type LoginFormState = {
  email: string;
  password: string;
};

type RegisterFormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const initialLoginForm: LoginFormState = {
  email: '',
  password: '',
};

const initialRegisterForm: RegisterFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export function PublicAuthModal({
  mode,
  searchParams,
  onClose,
  onSwitchMode,
}: {
  mode: AuthMode | null;
  searchParams: { get: (key: string) => string | null };
  onClose: () => void;
  onSwitchMode: (mode: AuthMode, params?: Record<string, string | null>) => void;
}) {
  const router = useRouter();
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm);
  const [verificationToken, setVerificationToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const reason = searchParams.get('reason');
  const registered = searchParams.get('registered') === '1';
  const registeredEmail = searchParams.get('email') ?? '';
  const verified = searchParams.get('verified') === '1';

  useEffect(() => {
    if (!mode) {
      setError(null);
      setIsSubmitting(false);
      return;
    }

    if (mode === 'verify-email') {
      setVerificationToken(searchParams.get('token') ?? '');
    }
  }, [mode, searchParams]);

  useEffect(() => {
    if (!mode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onClose]);

  if (!mode) {
    return null;
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(loginForm),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (registerForm.password !== registerForm.confirmPassword) {
      setError({
        code: 'PASSWORD_MISMATCH',
        message: 'Password and password confirmation must match',
      });
      return;
    }

    setIsSubmitting(true);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        firstName: registerForm.firstName,
        lastName: registerForm.lastName,
        email: registerForm.email,
        password: registerForm.password,
      }),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSwitchMode('verify-email', {
      email: registerForm.email.trim(),
      registered: '1',
      token: null,
      verified: null,
    });
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: verificationToken }),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSwitchMode('login', {
      reason: null,
      registered: null,
      token: null,
      verified: '1',
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-auth-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              OpenSpace
            </p>
            <h2 id="public-auth-modal-title" className="mt-2 text-2xl font-semibold text-slate-950">
              {mode === 'login'
                ? 'Login'
                : mode === 'register'
                  ? 'Create your account'
                  : 'Verify your email'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          {(['login', 'register', 'verify-email'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onSwitchMode(tab)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === tab
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'verify-email' ? 'Verify email' : tab === 'register' ? 'Register' : 'Login'}
            </button>
          ))}
        </div>

        {reason === 'session-expired' && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Your session is missing or expired. Please log in again.
          </p>
        ) : null}

        {registered && registeredEmail && mode === 'verify-email' ? (
          <p className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            Registration complete for <strong>{registeredEmail}</strong>. Paste your token here to activate login access.
          </p>
        ) : null}

        {verified && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Email verified. You can now log in.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error.code}: {error.message}
          </p>
        ) : null}

        {mode === 'login' ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleLoginSubmit(event)}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                required
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input
                required
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleRegisterSubmit(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">First name</span>
                <input
                  required
                  value={registerForm.firstName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, firstName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Last name</span>
                <input
                  required
                  value={registerForm.lastName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, lastName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                required
                type="email"
                value={registerForm.email}
                onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating account...' : 'Register'}
            </button>
          </form>
        ) : null}

        {mode === 'verify-email' ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleVerifySubmit(event)}>
            <p className="text-sm text-slate-600">Enter the verification token sent to your email address.</p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Verification token</span>
              <input
                required
                value={verificationToken}
                onChange={(event) => setVerificationToken(event.target.value)}
                placeholder="Paste token"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Verifying...' : 'Verify email'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
