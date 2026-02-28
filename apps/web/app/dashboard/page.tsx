'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { WorkspaceShell } from '@/components/workspace-shell';
import { WorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { safeReadJson } from '@/lib/client-http';
import { resolveDefaultTimezone } from '@/lib/iana-timezones';
import {
  buildMarkerCountByDateKey,
  buildMiniCalendarCells,
  groupMyBookingsForSidebar,
  workspaceTodayDateKey,
} from '@/lib/time';
import type { BookingListItem, WorkspaceItem } from '@/lib/types';
import { isBookingListPayload } from '@/lib/workspace-payloads';
import { formatUtcInTimezone } from '@/lib/workspace-time';

export default function DashboardPage() {
  return (
    <WorkspaceShell
      pageTitle="Dashboard"
      pageDescription="Workspace visibility, invitation inbox, and quick navigation."
    >
      {(context) => DashboardContent(context)}
    </WorkspaceShell>
  );
}

function DashboardContent({
  items,
  currentUser,
  isLoading,
  runInvitationAction,
  pendingInvitationAction,
}: Parameters<Parameters<typeof WorkspaceShell>[0]['children']>[0]) {
  if (isLoading) {
    return <p className="text-slate-600">Loading workspace visibility...</p>;
  }

  const pendingInvitations = items.filter((item) => item.invitation?.status === 'PENDING');

  return {
    main: (
      <div className="space-y-5">
        {pendingInvitations.length > 0 ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h3 className="text-lg font-semibold text-slate-900">Invitation Inbox</h3>
            <ul className="mt-3 space-y-2">
              {pendingInvitations.map((item) => (
                <li key={item.id} className="rounded-lg border border-amber-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      {item.invitation ? (
                        <p className="mt-1 text-xs text-slate-600">
                          Expires {formatUtcInTimezone(item.invitation.expiresAt, item.timezone)} ({item.timezone})
                        </p>
                      ) : null}
                    </div>
                    {item.invitation ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void runInvitationAction(item.invitation!.id, 'accept')}
                          disabled={pendingInvitationAction?.invitationId === item.invitation.id}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingInvitationAction?.invitationId === item.invitation.id &&
                          pendingInvitationAction.action === 'accept'
                            ? 'Accepting...'
                            : 'Accept'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runInvitationAction(item.invitation!.id, 'reject')}
                          disabled={pendingInvitationAction?.invitationId === item.invitation.id}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingInvitationAction?.invitationId === item.invitation.id &&
                          pendingInvitationAction.action === 'reject'
                            ? 'Rejecting...'
                            : 'Reject'}
                        </button>
                        <Link
                          href={`/workspaces/${item.id}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Open
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-slate-900">Visible Workspaces</h3>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No workspace is visible for this account yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {item.membership
                          ? `${item.membership.role} / ${item.membership.status}`
                          : item.invitation
                            ? `Invitation ${item.invitation.status}`
                            : 'Unknown visibility'}
                      </p>
                    </div>
                    <Link
                      href={`/workspaces/${item.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    ),
    rightSidebar: (
      <DashboardRightSidebar
        items={items}
        currentUserId={currentUser?.id ?? ''}
        timezone={resolveDefaultTimezone()}
      />
    ),
  };
}

function DashboardRightSidebar({
  items,
  currentUserId,
  timezone,
}: {
  items: WorkspaceItem[];
  currentUserId: string;
  timezone: string;
}) {
  const [dateKey, setDateKey] = useState(() => workspaceTodayDateKey(timezone));
  const [monthKey, setMonthKey] = useState(() => workspaceTodayDateKey(timezone).slice(0, 7));
  const [myBookings, setMyBookings] = useState<BookingListItem[]>([]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMyBookings() {
      const visibleMemberWorkspaces = items.filter((item) => item.membership?.status === 'ACTIVE');

      if (visibleMemberWorkspaces.length === 0 || !currentUserId) {
        if (!isCancelled) {
          setMyBookings([]);
        }
        return;
      }

      const results = await Promise.all(
        visibleMemberWorkspaces.map(async (workspace) => {
          const query = new URLSearchParams({
            mine: 'true',
            includePast: 'true',
          });

          const response = await fetch(
            `/api/workspaces/${workspace.id}/bookings?${query.toString()}`,
            {
              method: 'GET',
              cache: 'no-store',
            },
          );
          const payload = await safeReadJson(response);

          if (!response.ok || !isBookingListPayload(payload)) {
            return [];
          }

          return payload.items.map((booking) => ({
            ...booking,
            roomName: `${workspace.name} / ${booking.roomName}`,
          }));
        }),
      );

      if (!isCancelled) {
        setMyBookings(results.flat());
      }
    }

    void loadMyBookings();
    return () => {
      isCancelled = true;
    };
  }, [currentUserId, items]);

  const miniCalendarCells = useMemo(
    () =>
      buildMiniCalendarCells({
        timezone,
        monthKey,
        selectedDateKey: dateKey,
        markerCountByDateKey: buildMarkerCountByDateKey(myBookings, timezone, currentUserId || undefined),
      }),
    [currentUserId, dateKey, monthKey, myBookings, timezone],
  );
  const bookingGroups = useMemo(
    () => (currentUserId ? groupMyBookingsForSidebar(myBookings, timezone, currentUserId) : []),
    [currentUserId, myBookings, timezone],
  );

  return (
    <WorkspaceRightSidebar
      timezone={timezone}
      monthKey={monthKey}
      onSelectDateKey={setDateKey}
      onSelectMonthKey={setMonthKey}
      onToday={() => {
        const today = workspaceTodayDateKey(timezone);
        setDateKey(today);
        setMonthKey(today.slice(0, 7));
      }}
      miniCalendarCells={miniCalendarCells}
      bookingGroups={bookingGroups}
      onOpenBooking={(booking) => {
        window.location.href = `/workspaces/${booking.workspaceId}?bookingId=${booking.id}`;
      }}
    />
  );
}
