'use client';

import { DateTime } from 'luxon';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { PublicAuthModal, type AuthMode } from '@/components/public/PublicAuthModal';
import { PublicRightSidebar } from '@/components/public/PublicRightSidebar';
import { PublicSchedulePreview } from '@/components/public/PublicSchedulePreview';
import { buildMiniCalendarCells, formatSelectedDateLabel, formatSelectedDateSubLabel } from '@/lib/time';

const PUBLIC_TIMEZONE = 'Europe/Rome';

export function PublicHomePage() {
  return (
    <Suspense fallback={<PublicHomePageSkeleton />}>
      <PublicHomePageContent />
    </Suspense>
  );
}

function PublicHomePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authMode = normalizeAuthMode(searchParams.get('auth'));
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    DateTime.now().setZone(PUBLIC_TIMEZONE).toFormat('yyyy-LL-dd'),
  );
  const [monthKey, setMonthKey] = useState(() =>
    DateTime.now().setZone(PUBLIC_TIMEZONE).toFormat('yyyy-LL'),
  );
  const [isLeftSidebarOpenMobile, setIsLeftSidebarOpenMobile] = useState(false);
  const [isRightSidebarOpenMobile, setIsRightSidebarOpenMobile] = useState(false);

  useEffect(() => {
    const now = DateTime.now().setZone(PUBLIC_TIMEZONE);
    setSelectedDateKey(now.toFormat('yyyy-LL-dd'));
    setMonthKey(now.toFormat('yyyy-LL'));
  }, []);

  const selectedDateLabel = useMemo(
    () => formatSelectedDateLabel(selectedDateKey, PUBLIC_TIMEZONE),
    [selectedDateKey],
  );
  const selectedDateSubLabel = useMemo(
    () => formatSelectedDateSubLabel(selectedDateKey, PUBLIC_TIMEZONE),
    [selectedDateKey],
  );
  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone: PUBLIC_TIMEZONE,
        monthKey,
        selectedDateKey,
      }),
    [monthKey, selectedDateKey],
  );

  function setAuthMode(mode: AuthMode | null, extraParams?: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    if (mode) {
      params.set('auth', mode);
    } else {
      params.delete('auth');
      params.delete('reason');
      params.delete('registered');
      params.delete('email');
      params.delete('token');
      params.delete('verified');
    }

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <Header
        user={null}
        onLogout={() => undefined}
        onToggleLeftSidebar={() => setIsLeftSidebarOpenMobile(true)}
        onToggleRightSidebar={() => setIsRightSidebarOpenMobile(true)}
        brandHref="/"
        guestActions={[
          {
            key: 'login',
            label: 'Login',
            onClick: () => setAuthMode('login'),
            className: 'rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700',
          },
          {
            key: 'register',
            label: 'Register',
            onClick: () => setAuthMode('register'),
            className: 'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
          },
          {
            key: 'verify-email',
            label: 'Verify email',
            onClick: () => setAuthMode('verify-email'),
            className: 'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
          },
        ]}
      />

      <div className="flex h-full pt-16">
        <LeftSidebar
          isOpenOnMobile={isLeftSidebarOpenMobile}
          onCloseMobile={() => setIsLeftSidebarOpenMobile(false)}
          workspaces={[]}
          onSelectWorkspace={() => undefined}
          actions={[]}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="h-full p-3 sm:p-4">
              <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
                <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h2>
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Guest preview
                    </div>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                  <PublicSchedulePreview
                    selectedDateLabel={selectedDateLabel}
                    selectedDateSubLabel={selectedDateSubLabel}
                  />
                </div>
              </section>
            </div>
          </div>

          <RightSidebar
            isOpenOnMobile={isRightSidebarOpenMobile}
            onCloseMobile={() => setIsRightSidebarOpenMobile(false)}
          >
            <PublicRightSidebar
              monthKey={monthKey}
              miniCalendarCells={miniCalendarCells}
              onSelectDateKey={setSelectedDateKey}
              onSelectMonthKey={setMonthKey}
            />
          </RightSidebar>
        </div>
      </div>

      <PublicAuthModal
        mode={authMode}
        searchParams={searchParams}
        onClose={() => setAuthMode(null)}
        onSwitchMode={(nextMode, params) => setAuthMode(nextMode, params)}
      />
    </div>
  );
}

function normalizeAuthMode(value: string | null): AuthMode | null {
  if (value === 'login' || value === 'register' || value === 'verify-email') {
    return value;
  }

  return null;
}

function PublicHomePageSkeleton() {
  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      <div className="fixed inset-x-0 top-0 h-16 border-b border-slate-200 bg-white" />
      <div className="flex h-full pt-16">
        <div className="hidden w-[260px] border-r border-slate-200 bg-slate-50 lg:block" />
        <div className="flex-1 p-3 sm:p-4">
          <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </div>
        <div className="hidden w-[320px] border-l border-slate-200 bg-white xl:block" />
      </div>
    </div>
  );
}
