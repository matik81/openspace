'use client';

import { FormEvent } from 'react';
import type { ErrorPayload } from '@/lib/types';

export type AccountSettingsFormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  newPassword: string;
  confirmNewPassword: string;
};

export function AccountSettingsModal({
  open,
  form,
  error,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
  onDeleteAccount,
}: {
  open: boolean;
  form: AccountSettingsFormState;
  error: ErrorPayload | null;
  isSubmitting: boolean;
  onChange: (next: AccountSettingsFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: () => void;
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
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Edit Account</h3>
            <p className="mt-1 text-sm text-slate-600">
              Update your name or password. Confirm with your current email and password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form className="mt-4 space-y-4" autoComplete="off" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error.code}: {error.message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">First name</span>
              <input
                required
                value={form.firstName}
                onChange={(event) => onChange({ ...form, firstName: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Last name</span>
              <input
                required
                value={form.lastName}
                onChange={(event) => onChange({ ...form, lastName: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Current email</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => onChange({ ...form, email: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Current password
              </span>
              <input
                required
                type="password"
                value={form.password}
                onChange={(event) => onChange({ ...form, password: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                New password
              </span>
              <input
                minLength={8}
                type="password"
                value={form.newPassword}
                onChange={(event) => onChange({ ...form, newPassword: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Confirm new password
              </span>
              <input
                minLength={8}
                type="password"
                value={form.confirmNewPassword}
                onChange={(event) =>
                  onChange({ ...form, confirmNewPassword: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving...' : 'Save account'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDeleteAccount}
              disabled={isSubmitting}
              className="ml-auto rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
