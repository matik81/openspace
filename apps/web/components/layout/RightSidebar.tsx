'use client';

import type { ReactNode } from 'react';

export function RightSidebar({
  children,
  isOpenOnMobile,
  onCloseMobile,
}: {
  children: ReactNode;
  isOpenOnMobile: boolean;
  onCloseMobile: () => void;
}) {
  const content = <div className="flex h-full flex-col overflow-y-auto bg-white p-4">{children}</div>;

  return (
    <>
      <aside className="hidden h-full w-[320px] shrink-0 border-l border-slate-200 bg-white xl:block">
        {content}
      </aside>

      {isOpenOnMobile ? (
        <div className="fixed inset-0 z-50 xl:hidden" role="presentation">
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close sidebar"
          />
          <aside className="absolute inset-y-0 right-0 w-[92vw] max-w-[360px] border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Details</p>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}

