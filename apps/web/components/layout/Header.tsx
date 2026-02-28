'use client';

import Link from 'next/link';

type HeaderUser = {
  firstName: string;
  lastName: string;
  email: string;
} | null;

type HeaderGuestAction = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function Header({
  user,
  onLogout,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  guestActions,
  brandHref = '/dashboard',
}: {
  user: HeaderUser;
  onLogout: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  guestActions?: HeaderGuestAction[];
  brandHref?: string;
}) {
  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim() || user.email
    : null;
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : null;

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-[1920px] items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
            aria-label="Open workspace sidebar"
          >
            ≡
          </button>
          <Link
            href={brandHref}
            className="rounded-md px-2 py-1 text-base font-semibold tracking-tight text-slate-900 hover:bg-slate-50"
          >
            openspace
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 xl:hidden"
            aria-label="Open right sidebar"
          >
            ⋯
          </button>

          {!user ? (
            <>
              {(guestActions ?? [
                {
                  key: 'login',
                  label: 'Login',
                  href: '/login',
                  className: 'rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100',
                },
                {
                  key: 'register',
                  label: 'Sign up',
                  href: '/register',
                  className:
                    'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
                },
              ]).map((action) =>
                action.href ? (
                  <Link
                    key={action.key}
                    href={action.href}
                    className={
                      action.className ??
                      'rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100'
                    }
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    className={
                      action.className ??
                      'rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100'
                    }
                  >
                    {action.label}
                  </button>
                ),
              )}
            </>
          ) : (
            <>
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 sm:flex">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {initials}
                </span>
                <span className="max-w-[180px] truncate text-sm text-slate-700">{displayName}</span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

