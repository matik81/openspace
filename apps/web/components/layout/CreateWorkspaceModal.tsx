'use client';

import { FormEvent } from 'react';
import { getErrorDisplayMessage } from '@/lib/error-display';
import { IANA_TIMEZONES } from '@/lib/iana-timezones';
import type { ErrorPayload } from '@/lib/types';
import { normalizeWorkspaceSlugCandidate } from '@/lib/workspace-routing';

const WORKSPACE_SCHEDULE_HOUR_OPTIONS = Array.from({ length: 25 }, (_, index) => index);

export type CreateWorkspaceFormState = {
  name: string;
  slug: string;
  timezone: string;
  scheduleStartHour: number;
  scheduleEndHour: number;
};

export function CreateWorkspaceModal({
  open,
  form,
  error,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: CreateWorkspaceFormState;
  error: ErrorPayload | null;
  isSubmitting: boolean;
  onChange: (next: CreateWorkspaceFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) {
    return null;
  }

  const generatedSlug = normalizeWorkspaceSlugCandidate(form.name);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-dialog-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Close create workspace dialog"
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="create-workspace-dialog-title" className="text-lg font-semibold text-slate-900">
              Create Workspace
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Set a display name, a web address, and a timezone. You will land in the control
              panel after creation.
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

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {getErrorDisplayMessage(error)}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Display Name</span>
            <input
              required
              autoFocus
              value={form.name}
              onChange={(event) => {
                const nextName = event.target.value;
                const nextGeneratedSlug = normalizeWorkspaceSlugCandidate(nextName);

                onChange({
                  ...form,
                  name: nextName,
                  slug:
                    !form.slug || form.slug === generatedSlug ? nextGeneratedSlug : form.slug,
                });
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Web Address</span>
            <input
              required
              value={form.slug}
              onChange={(event) =>
                onChange({
                  ...form,
                  slug: normalizeWorkspaceSlugCandidate(event.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-xs text-slate-500">
              Use lowercase letters, numbers, dots, and hyphens only.
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Timezone</span>
            <select
              required
              value={form.timezone}
              onChange={(event) => onChange({ ...form, timezone: event.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {IANA_TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Schedule Start</span>
              <select
                required
                value={form.scheduleStartHour}
                onChange={(event) => {
                  const nextStartHour = Number(event.target.value);
                  const nextEndHour =
                    form.scheduleEndHour < nextStartHour ? nextStartHour : form.scheduleEndHour;
                  onChange({
                    ...form,
                    scheduleStartHour: nextStartHour,
                    scheduleEndHour: nextEndHour,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter((hour) => hour <= 23).map((hour) => (
                  <option key={`start-${hour}`} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Schedule End</span>
              <select
                required
                value={form.scheduleEndHour}
                onChange={(event) =>
                  onChange({ ...form, scheduleEndHour: Number(event.target.value) })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {WORKSPACE_SCHEDULE_HOUR_OPTIONS.filter(
                  (hour) => hour >= form.scheduleStartHour,
                ).map((hour) => (
                  <option key={`end-${hour}`} value={hour}>
                    {hour.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
