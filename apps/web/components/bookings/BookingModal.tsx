'use client';

import { type CSSProperties, FormEvent, useEffect, useId, useMemo, useRef } from 'react';
import {
  SCHEDULE_INTERVAL_MINUTES,
  minutesToTimeInput,
  scheduleEndMinutes,
  scheduleStartMinutes,
  type ScheduleWindow,
  timeInputToMinutes,
} from '@/lib/time';
import type { BookingCriticality, ErrorPayload, RoomItem } from '@/lib/types';

export type BookingModalDraft = {
  subject: string;
  roomId: string;
  startTimeLocal: string;
  endTimeLocal: string;
  criticality: BookingCriticality;
};

export type BookingModalAnchorPoint = {
  clientX: number;
  clientY: number;
};

export function BookingModal({
  open,
  mode,
  rooms,
  draft,
  error,
  isSubmitting,
  isSubmitDisabled = false,
  canEdit,
  canDelete,
  schedule,
  anchorPoint,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  rooms: RoomItem[];
  draft: BookingModalDraft;
  error: ErrorPayload | null;
  isSubmitting: boolean;
  isSubmitDisabled?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  schedule: ScheduleWindow;
  anchorPoint?: BookingModalAnchorPoint | null;
  onChange: (next: BookingModalDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const startBoundaryMinutes = scheduleStartMinutes(schedule);
  const endBoundaryMinutes = scheduleEndMinutes(schedule);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const focusTarget = canEdit ? titleInputRef.current : closeButtonRef.current;
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const tabbables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);

      if (tabbables.length === 0) {
        return;
      }

      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedElementRef.current?.focus?.();
    };
  }, [open, onClose, canEdit]);

  const submitLabel = useMemo(() => {
    if (!canEdit) {
      return 'Close';
    }
    if (isSubmitting) {
      return mode === 'create' ? 'Creating...' : 'Saving...';
    }
    return mode === 'create' ? 'Create' : 'Save';
  }, [canEdit, isSubmitting, mode]);
  const startMinutes = timeInputToMinutes(draft.startTimeLocal);
  const endMinutes = timeInputToMinutes(draft.endTimeLocal);
  const startTimeOptions = useMemo(() => {
    const items: string[] = [];
    for (
      let minute = startBoundaryMinutes;
      minute <= endBoundaryMinutes - SCHEDULE_INTERVAL_MINUTES;
      minute += SCHEDULE_INTERVAL_MINUTES
    ) {
      items.push(minutesToTimeInput(minute));
    }
    return items;
  }, [endBoundaryMinutes, startBoundaryMinutes]);
  const endTimeOptions = useMemo(() => {
    const minEnd =
      startMinutes !== null
        ? Math.max(
            startBoundaryMinutes + SCHEDULE_INTERVAL_MINUTES,
            startMinutes + SCHEDULE_INTERVAL_MINUTES,
          )
        : startBoundaryMinutes + SCHEDULE_INTERVAL_MINUTES;
    const items: string[] = [];
    for (let minute = minEnd; minute <= endBoundaryMinutes; minute += SCHEDULE_INTERVAL_MINUTES) {
      items.push(minutesToTimeInput(minute));
    }
    return items;
  }, [endBoundaryMinutes, startBoundaryMinutes, startMinutes]);
  const anchoredDialogStyle = useMemo<CSSProperties | null>(() => {
    if (!open || !anchorPoint) {
      return null;
    }
    if (typeof window === 'undefined' || window.innerWidth < 1024) {
      return null;
    }

    const margin = 16;
    const gap = 12;
    const dialogWidth = 448;
    const estimatedDialogHeight = 560;
    const maxLeft = Math.max(margin, window.innerWidth - dialogWidth - margin);

    let left = anchorPoint.clientX + gap;
    if (left > maxLeft) {
      left = Math.max(margin, anchorPoint.clientX - dialogWidth - gap);
    }

    const top = Math.max(
      margin,
      Math.min(anchorPoint.clientY - 24, window.innerHeight - estimatedDialogHeight - margin),
    );

    return {
      position: 'fixed',
      left,
      top,
      width: `min(${dialogWidth}px, calc(100vw - ${margin * 2}px))`,
      maxHeight: `calc(100vh - ${margin * 2}px)`,
    };
  }, [open, anchorPoint]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      onClose();
      return;
    }
    onSubmit();
  };

  const roomOptions = rooms.map((room) => (
    <option key={room.id} value={room.id}>
      {room.name}
    </option>
  ));
  const isAnchored = Boolean(anchoredDialogStyle);

  return (
    <div
      className={`fixed inset-0 z-[60] p-4 ${isAnchored ? 'bg-slate-950/10' : 'bg-slate-950/40'} ${isAnchored ? '' : 'flex items-center justify-center'}`}
      role="presentation"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={anchoredDialogStyle ?? undefined}
        className={`relative z-10 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl ${isAnchored ? '' : 'w-full max-w-md'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {mode === 'create' ? 'Create Booking' : canEdit ? 'Edit Booking' : 'Booking Details'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {canEdit
                ? 'Times use the active workspace timezone.'
                : 'You can view this booking, but only your own bookings can be edited.'}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error.code}: {error.message}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
            <input
              ref={titleInputRef}
              required
              disabled={!canEdit || isSubmitting}
              value={draft.subject}
              onChange={(event) => onChange({ ...draft, subject: event.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Room</span>
            <select
              disabled={!canEdit || isSubmitting}
              value={draft.roomId}
              onChange={(event) => onChange({ ...draft, roomId: event.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
            >
              {roomOptions}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Start</span>
              <select
                required
                disabled={!canEdit || isSubmitting}
                value={draft.startTimeLocal}
                onChange={(event) => {
                  const nextStartTime = event.target.value;
                  const nextStartMinutes = timeInputToMinutes(nextStartTime);
                  let nextEndTime = draft.endTimeLocal;
                  const currentEndMinutes = timeInputToMinutes(draft.endTimeLocal);

                  if (
                    nextStartMinutes !== null &&
                    (currentEndMinutes === null || currentEndMinutes <= nextStartMinutes)
                  ) {
                    nextEndTime = minutesToTimeInput(
                      Math.min(endBoundaryMinutes, nextStartMinutes + SCHEDULE_INTERVAL_MINUTES),
                    );
                  }

                  onChange({
                    ...draft,
                    startTimeLocal: nextStartTime,
                    endTimeLocal: nextEndTime,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
              >
                <option value="">Select</option>
                {startTimeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">End</span>
              <select
                required
                disabled={!canEdit || isSubmitting}
                value={draft.endTimeLocal}
                onChange={(event) => onChange({ ...draft, endTimeLocal: event.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
              >
                <option value="">Select</option>
                {endTimeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
                {endMinutes !== null &&
                !endTimeOptions.includes(draft.endTimeLocal) &&
                draft.endTimeLocal ? (
                  <option value={draft.endTimeLocal}>{draft.endTimeLocal}</option>
                ) : null}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Criticality</span>
            <select
              disabled={!canEdit || isSubmitting}
              value={draft.criticality}
              onChange={(event) =>
                onChange({ ...draft, criticality: event.target.value as BookingCriticality })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
            >
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {mode === 'edit' && canDelete ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onDelete}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel Reservation
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (canEdit && isSubmitDisabled)}
                className="rounded-lg border border-transparent bg-brand px-3 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
