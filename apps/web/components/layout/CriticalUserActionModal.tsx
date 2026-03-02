'use client';

import { FormEvent } from 'react';
import type { ErrorPayload } from '@/lib/types';

export type CriticalUserActionFormState = {
  email: string;
  password: string;
};

export function CriticalUserActionModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  emailLabel,
  passwordLabel,
  isSubmitting,
  error,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  emailLabel: string;
  passwordLabel: string;
  isSubmitting: boolean;
  error: ErrorPayload | null;
  form: CriticalUserActionFormState;
  onChange: (next: CriticalUserActionFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-rose-900">{title}</h3>
            <p className="mt-1 text-sm text-rose-800">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form className="mt-4 space-y-3" autoComplete="off" onSubmit={onSubmit}>
          <div className="hidden" aria-hidden="true">
            <input type="text" name="username" autoComplete="username" tabIndex={-1} />
            <input type="password" name="password" autoComplete="current-password" tabIndex={-1} />
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-700">
              {error.code}: {error.message}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-rose-900">{emailLabel}</span>
            <input
              required
              type="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
              className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-rose-900">{passwordLabel}</span>
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? `${confirmLabel}...` : confirmLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
