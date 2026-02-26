'use client';

import Link from 'next/link';
import { WorkspaceShell } from '@/components/workspace-shell';
import { formatUtcInTimezone } from '@/lib/workspace-time';

export default function DashboardPage() {
  return (
    <WorkspaceShell
      pageTitle="Dashboard"
      pageDescription="Workspace visibility, invitation inbox, and quick navigation."
    >
      {({ items, isLoading }) => {
        if (isLoading) {
          return <p className="text-slate-600">Loading workspace visibility...</p>;
        }

        const pendingInvitations = items.filter(
          (item) => item.invitation?.status === 'PENDING',
        );

        return (
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
                              Expires{' '}
                              {formatUtcInTimezone(item.invitation.expiresAt, item.timezone)} (
                              {item.timezone})
                            </p>
                          ) : null}
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
        );
      }}
    </WorkspaceShell>
  );
}
