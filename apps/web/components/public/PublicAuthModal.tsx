'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { readErrorPayload } from '@/lib/client-http';
import { getErrorDisplayMessage } from '@/lib/error-display';
import type { ErrorPayload } from '@/lib/types';

export type AuthMode = 'login' | 'register' | 'verify-email' | 'reset-password';

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

type ResetPasswordFormState = {
  email: string;
  token: string;
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

const initialResetPasswordForm: ResetPasswordFormState = {
  email: '',
  token: '',
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
  const didPointerDownOnOverlayRef = useRef(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm);
  const [verificationToken, setVerificationToken] = useState('');
  const [resetPasswordForm, setResetPasswordForm] =
    useState<ResetPasswordFormState>(initialResetPasswordForm);
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(null);
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
    if (mode === 'reset-password') {
      setResetPasswordForm((current) => ({
        ...current,
        email: searchParams.get('email') ?? current.email,
        token: searchParams.get('token') ?? '',
      }));
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
    setResetPasswordMessage(null);

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
    setResetPasswordMessage(null);

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
    setResetPasswordMessage(null);

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

  async function handleResetPasswordRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResetPasswordMessage(null);

    const response = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: resetPasswordForm.email,
      }),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    setResetPasswordMessage('If the account exists and is active, a reset token has been sent by email.');
    setIsSubmitting(false);
  }

  async function handleResetPasswordConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResetPasswordMessage(null);

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setError({
        code: 'PASSWORD_MISMATCH',
        message: 'Password and password confirmation must match',
      });
      return;
    }

    setIsSubmitting(true);

    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: resetPasswordForm.token,
        password: resetPasswordForm.password,
      }),
    });

    if (!response.ok) {
      setError(await readErrorPayload(response));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setResetPasswordForm((current) => ({
      ...current,
      token: '',
      password: '',
      confirmPassword: '',
    }));
    onSwitchMode('login', {
      reason: null,
      verified: null,
      token: null,
      reset: '1',
    });
  }

  function handleOverlayPointerDown(event: PointerEvent<HTMLDivElement>) {
    didPointerDownOnOverlayRef.current = event.target === event.currentTarget;
  }

  function handleOverlayPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !didPointerDownOnOverlayRef.current) {
      return;
    }

    didPointerDownOnOverlayRef.current = false;
    onClose();
  }

  function handleOverlayPointerCancel() {
    didPointerDownOnOverlayRef.current = false;
  }

  function handleDialogPointerDown() {
    didPointerDownOnOverlayRef.current = false;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-auth-modal-title"
      onPointerDown={handleOverlayPointerDown}
      onPointerUp={handleOverlayPointerUp}
      onPointerCancel={handleOverlayPointerCancel}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onPointerDown={handleDialogPointerDown}
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
                  : mode === 'verify-email'
                    ? 'Verify your email'
                    : 'Reset password'}
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
          {(['login', 'register', 'verify-email', 'reset-password'] as const).map((tab) => (
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
              {tab === 'verify-email'
                ? 'Verify email'
                : tab === 'register'
                  ? 'Register'
                  : tab === 'reset-password'
                    ? 'Reset password'
                    : 'Login'}
            </button>
          ))}
        </div>

        {reason === 'session-expired' && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Your session is missing or expired. Please log in again.
          </p>
        ) : null}

        {reason === 'account-deleted' && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Account deleted. Login is no longer available for that user.
          </p>
        ) : null}

        {reason === 'user-suspended' && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Account suspended due to rate limits. Login is temporarily unavailable.
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

        {searchParams.get('reset') === '1' && mode === 'login' ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Password reset complete. You can now log in with the new password.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {getErrorDisplayMessage(error)}
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
          <form
            className="mt-6 space-y-4"
            autoComplete="off"
            onSubmit={(event) => void handleRegisterSubmit(event)}
          >
            <div className="hidden" aria-hidden="true">
              <input type="text" name="username" autoComplete="username" tabIndex={-1} />
              <input type="password" name="password" autoComplete="current-password" tabIndex={-1} />
            </div>

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
                name="register-email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
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
                  name="register-password"
                  autoComplete="new-password"
                  data-1p-ignore="true"
                  data-lpignore="true"
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
                  name="register-confirm-password"
                  autoComplete="new-password"
                  data-1p-ignore="true"
                  data-lpignore="true"
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

        {mode === 'reset-password' ? (
          <div className="mt-6 space-y-6">
            {resetPasswordMessage ? (
              <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                {resetPasswordMessage}
              </p>
            ) : null}

            <form className="space-y-4" onSubmit={(event) => void handleResetPasswordRequest(event)}>
              <p className="text-sm text-slate-600">
                Request a reset token by email.
              </p>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={resetPasswordForm.email}
                  onChange={(event) =>
                    setResetPasswordForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Sending token...' : 'Send reset token'}
              </button>
            </form>

            <form
              className="space-y-4 border-t border-slate-200 pt-6"
              autoComplete="off"
              onSubmit={(event) => void handleResetPasswordConfirm(event)}
            >
              <p className="text-sm text-slate-600">
                Paste the token and choose a new password.
              </p>
              <div className="hidden" aria-hidden="true">
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={resetPasswordForm.email}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Reset token</span>
                <input
                  required
                  name="reset-token"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={resetPasswordForm.token}
                  onChange={(event) =>
                    setResetPasswordForm((current) => ({ ...current, token: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    New password
                  </span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    name="new-password"
                    autoComplete="new-password"
                    value={resetPasswordForm.password}
                    onChange={(event) =>
                      setResetPasswordForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Confirm new password
                  </span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    name="confirm-new-password"
                    autoComplete="new-password"
                    value={resetPasswordForm.confirmPassword}
                    onChange={(event) =>
                      setResetPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
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
                {isSubmitting ? 'Resetting password...' : 'Reset password'}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
