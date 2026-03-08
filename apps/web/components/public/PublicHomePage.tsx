'use client';

import { DateTime } from 'luxon';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { PublicAuthModal, type AuthMode } from '@/components/public/PublicAuthModal';
import {
  PUBLIC_TIMEZONE,
  PUBLIC_USER_ID,
  buildPublicPreviewBookingGroups,
  buildPublicPreviewBookings,
} from '@/components/public/public-preview-data';
import { PublicRightSidebar } from '@/components/public/PublicRightSidebar';
import { PublicSchedulePreview } from '@/components/public/PublicSchedulePreview';
import { readErrorPayload, safeReadJson } from '@/lib/client-http';
import { getErrorDisplayMessage } from '@/lib/error-display';
import { addDaysToDateKey, buildMarkerCountByDateKey, buildMiniCalendarCells } from '@/lib/time';
import type { ErrorPayload } from '@/lib/types';

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
  const safePathname = pathname ?? '/';
  const safeSearchParams = useMemo(
    () => searchParams ?? new URLSearchParams(),
    [searchParams],
  );
  const authMode = normalizeAuthMode(safeSearchParams.get('auth'));
  const [previewAnchorDateKey] = useState(() =>
    DateTime.now().setZone(PUBLIC_TIMEZONE).toFormat('yyyy-LL-dd'),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    DateTime.now().setZone(PUBLIC_TIMEZONE).toFormat('yyyy-LL-dd'),
  );
  const [monthKey, setMonthKey] = useState(() =>
    DateTime.now().setZone(PUBLIC_TIMEZONE).toFormat('yyyy-LL'),
  );
  const [isLeftSidebarOpenMobile, setIsLeftSidebarOpenMobile] = useState(false);
  const [isRightSidebarOpenMobile, setIsRightSidebarOpenMobile] = useState(false);
  const [ipRegistrationError, setIpRegistrationError] = useState<ErrorPayload | null>(null);

  useEffect(() => {
    const now = DateTime.now().setZone(PUBLIC_TIMEZONE);
    setSelectedDateKey(now.toFormat('yyyy-LL-dd'));
    setMonthKey(now.toFormat('yyyy-LL'));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistrationStatus() {
      const response = await fetch('/api/auth/register-status', {
        method: 'GET',
        cache: 'no-store',
      });
      if (cancelled) {
        return;
      }
      if (response.ok) {
        setIpRegistrationError(null);
        return;
      }
      if (response.status === 429) {
        setIpRegistrationError(await readErrorPayload(response));
        return;
      }
      await safeReadJson(response);
      setIpRegistrationError(null);
    }

    void loadRegistrationStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewBookings = useMemo(
    () => buildPublicPreviewBookings(previewAnchorDateKey),
    [previewAnchorDateKey],
  );
  const bookingGroups = useMemo(
    () => buildPublicPreviewBookingGroups(previewBookings),
    [previewBookings],
  );
  const markerCountsByDate = useMemo(
    () => buildMarkerCountByDateKey(previewBookings, PUBLIC_TIMEZONE, PUBLIC_USER_ID),
    [previewBookings],
  );
  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone: PUBLIC_TIMEZONE,
        monthKey,
        selectedDateKey,
        markerCountByDateKey: markerCountsByDate,
      }),
    [monthKey, selectedDateKey, markerCountsByDate],
  );

  function goToToday() {
    const now = DateTime.now().setZone(PUBLIC_TIMEZONE);
    setSelectedDateKey(now.toFormat('yyyy-LL-dd'));
    setMonthKey(now.toFormat('yyyy-LL'));
  }

  function goToPreviousDay() {
    setSelectedDateKey((previous) => {
      const next = addDaysToDateKey(previous, -1, PUBLIC_TIMEZONE);
      setMonthKey(next.slice(0, 7));
      return next;
    });
  }

  function goToNextDay() {
    setSelectedDateKey((previous) => {
      const next = addDaysToDateKey(previous, 1, PUBLIC_TIMEZONE);
      setMonthKey(next.slice(0, 7));
      return next;
    });
  }

  function setAuthMode(mode: AuthMode | null, extraParams?: Record<string, string | null>) {
    const params = new URLSearchParams(safeSearchParams.toString());

    if (mode) {
      params.set('auth', mode);
    } else {
      params.delete('auth');
      params.delete('reason');
      params.delete('registered');
      params.delete('email');
      params.delete('token');
      params.delete('verified');
      params.delete('reset');
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
    router.replace(query ? `${safePathname}?${query}` : safePathname, { scroll: false });
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
        ]}
      />

      <div className="flex h-full pt-16">
        <LeftSidebar
          isOpenOnMobile={isLeftSidebarOpenMobile}
          onCloseMobile={() => setIsLeftSidebarOpenMobile(false)}
          workspaces={[]}
          onSelectWorkspace={() => undefined}
          actions={[]}
          extraContent={
            <section>
              <div className="relative rounded-lg border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center rounded-md text-left"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">
                      Guest preview
                    </p>
                  </button>
                </div>
              </div>
            </section>
          }
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="h-full p-3 sm:p-4">
              <div className="flex h-full min-h-0 flex-col gap-3">
                {ipRegistrationError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {getErrorDisplayMessage(ipRegistrationError)}
                  </p>
                ) : null}

                <div className="min-h-0 flex-1">
                  <PublicSchedulePreview
                    selectedDateKey={selectedDateKey}
                    onPrevDay={goToPreviousDay}
                    onNextDay={goToNextDay}
                    onToday={goToToday}
                    bookings={previewBookings}
                  />
                </div>
              </div>
            </div>
          </div>

          <RightSidebar
            isOpenOnMobile={isRightSidebarOpenMobile}
            onCloseMobile={() => setIsRightSidebarOpenMobile(false)}
          >
            <PublicRightSidebar
              monthKey={monthKey}
              miniCalendarCells={miniCalendarCells}
              bookingGroups={bookingGroups}
              onSelectDateKey={setSelectedDateKey}
              onSelectMonthKey={setMonthKey}
              onToday={goToToday}
            />
          </RightSidebar>
        </div>
      </div>

      <PublicAuthModal
        mode={authMode}
        searchParams={safeSearchParams}
        onClose={() => setAuthMode(null)}
        onSwitchMode={(nextMode, params) => setAuthMode(nextMode, params)}
      />
    </div>
  );
}

function normalizeAuthMode(value: string | null): AuthMode | null {
  if (
    value === 'login' ||
    value === 'register' ||
    value === 'verify-email' ||
    value === 'reset-password'
  ) {
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
