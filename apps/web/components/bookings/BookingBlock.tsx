'use client';

import { memo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type BookingBlockLayout = {
  topPx: number;
  heightPx: number;
  leftPercent?: number;
  widthPercent?: number;
};

export function getBookingBlockVariantClass(
  variant: 'mine' | 'default' | 'preview' | 'preview-error',
) {
  switch (variant) {
    case 'mine':
      return 'border-amber-300 bg-amber-100 text-amber-950';
    case 'preview':
      return 'border-amber-400 bg-amber-100/90 text-amber-950 border-dashed';
    case 'preview-error':
      return 'border-rose-400 bg-rose-100/90 text-rose-950 border-dashed';
    case 'default':
    default:
      return 'border-cyan-200 bg-cyan-100 text-cyan-950';
  }
}

export const BookingBlock = memo(function BookingBlock({
  bookingId,
  title,
  subtitle,
  meta,
  layout,
  variant,
  isInteractive = false,
  isSelected = false,
  showResizeHandles = false,
  onClick,
  onDragPointerDown,
  onResizePointerDown,
}: {
  bookingId?: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  layout: BookingBlockLayout;
  variant: 'mine' | 'default' | 'preview' | 'preview-error';
  isInteractive?: boolean;
  isSelected?: boolean;
  showResizeHandles?: boolean;
  onClick?: () => void;
  onDragPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizePointerDown?: (
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}) {
  const left = layout.leftPercent ?? 0;
  const width = layout.widthPercent ?? 100;

  return (
    <div
      className={`absolute px-1 ${isSelected ? 'z-20' : 'z-10'}`}
      style={{
        top: layout.topPx,
        height: Math.max(layout.heightPx, 18),
        left: `${left}%`,
        width: `${width}%`,
      }}
    >
      <div className="group relative h-full w-full">
        <button
          type="button"
          data-booking-id={bookingId}
          onClick={onClick}
          onPointerDown={onDragPointerDown}
          className={`relative flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition ${getBookingBlockVariantClass(variant)} ${isInteractive ? 'cursor-grab active:cursor-grabbing hover:shadow' : 'cursor-default'} ${isSelected ? 'ring-2 ring-brand/40' : ''}`}
          title={[title, subtitle, meta].filter(Boolean).join(' · ')}
          aria-label={[title, subtitle, meta].filter(Boolean).join(' · ')}
        >
          <span className="truncate text-xs font-semibold leading-tight">{title}</span>
          {subtitle ? <span className="truncate text-[11px] opacity-90">{subtitle}</span> : null}
          {meta && layout.heightPx >= 38 ? (
            <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide opacity-80">
              {meta}
            </span>
          ) : null}
        </button>

        {showResizeHandles && onResizePointerDown ? (
          <>
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-md bg-current/10" />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 rounded-b-md bg-current/10" />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Resize start time"
              className="absolute inset-x-0 top-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
              onPointerDown={(event) => onResizePointerDown('start', event)}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Resize end time"
              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
              onPointerDown={(event) => onResizePointerDown('end', event)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
});
