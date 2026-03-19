'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';

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

type HeaderUserAction = {
  key: string;
  label: string;
  onClick: () => void;
  kind?: 'default' | 'danger';
  disabled?: boolean;
};

export function Header({
  user,
  onLogout,
  onToggleRightSidebar,
  leftContent,
  guestActions,
  userActions,
  brandHref = '/dashboard',
  showGuestActions = true,
}: {
  user: HeaderUser;
  onLogout: () => void;
  onToggleRightSidebar: () => void;
  leftContent?: ReactNode;
  guestActions?: HeaderGuestAction[];
  userActions?: HeaderUserAction[];
  brandHref?: string;
  showGuestActions?: boolean;
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : null;
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : null;

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-[1920px] items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={brandHref}
            className="rounded-md px-2 py-1 text-base font-semibold tracking-tight text-slate-900 hover:bg-slate-50"
          >
            openspace
          </Link>
          {leftContent ? <div className="min-w-0">{leftContent}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 xl:hidden"
            aria-label="Open right sidebar"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <circle cx="10" cy="4" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="10" cy="16" r="1.5" />
            </svg>
          </button>

          {!user ? (
            <>
              {showGuestActions
                ? (guestActions ?? [
                    {
                      key: 'login',
                      label: 'Login',
                      href: '/login',
                      className:
                        'rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100',
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
                  )
                : null}
            </>
          ) : (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((current) => !current)}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-left hover:bg-slate-50"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden max-w-[180px] truncate text-sm text-slate-700 sm:block">
                  {displayName}
                </span>
              </button>

              {isUserMenuOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                  role="menu"
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {(userActions ?? [
                      {
                        key: 'logout',
                        label: 'Logout',
                        onClick: onLogout,
                      },
                    ]).map((action) => (
                      <button
                        key={action.key}
                        type="button"
                        disabled={action.disabled}
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          action.onClick();
                        }}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          action.kind === 'danger'
                            ? 'text-rose-700 hover:bg-rose-50'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        role="menuitem"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
