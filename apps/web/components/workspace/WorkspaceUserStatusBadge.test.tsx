import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  resolveWorkspaceUserStatus,
  WorkspaceUserStatusBadge,
  type WorkspaceUserStatus,
} from '@/components/workspace/WorkspaceUserStatusBadge';
import type { WorkspaceItem } from '@/lib/types';

const ALL_STATUSES: WorkspaceUserStatus[] = ['OWNER', 'ADMIN', 'ACTIVE', 'INVITED', 'INACTIVE'];

describe('WorkspaceUserStatusBadge', () => {
  it('renders a bordered badge for every supported status', () => {
    render(
      <div>
        {ALL_STATUSES.map((status) => (
          <WorkspaceUserStatusBadge key={status} status={status} />
        ))}
      </div>,
    );

    for (const status of ALL_STATUSES) {
      expect(screen.getByText(status)).toHaveClass('border');
    }
  });

  it('resolves selector badge labels from workspace visibility state', () => {
    const workspace = (overrides: Partial<WorkspaceItem>): WorkspaceItem => ({
      id: 'workspace-1',
      name: 'Focus Lab',
      slug: 'focus-lab',
      timezone: 'UTC',
      scheduleStartHour: 8,
      scheduleEndHour: 18,
      createdByUserId: 'user-1',
      createdAt: '2026-03-07T12:00:00.000Z',
      updatedAt: '2026-03-07T12:00:00.000Z',
      membership: null,
      invitation: null,
      ...overrides,
    });

    expect(
      resolveWorkspaceUserStatus({
        workspace: workspace({
          membership: { role: 'ADMIN', status: 'ACTIVE' },
        }),
        currentUserId: 'user-1',
      }),
    ).toBe('OWNER');

    expect(
      resolveWorkspaceUserStatus({
        workspace: workspace({
          createdByUserId: 'user-9',
          membership: { role: 'ADMIN', status: 'ACTIVE' },
        }),
        currentUserId: 'user-1',
      }),
    ).toBe('ADMIN');

    expect(
      resolveWorkspaceUserStatus({
        workspace: workspace({
          createdByUserId: 'user-9',
          membership: { role: 'MEMBER', status: 'ACTIVE' },
        }),
        currentUserId: 'user-1',
      }),
    ).toBe('ACTIVE');

    expect(
      resolveWorkspaceUserStatus({
        workspace: workspace({
          invitation: {
            id: 'invitation-1',
            email: 'ada@example.com',
            status: 'PENDING',
            expiresAt: '2026-03-21T12:00:00.000Z',
            invitedByUserId: 'user-2',
            createdAt: '2026-03-07T12:00:00.000Z',
          },
        }),
        currentUserId: 'user-1',
      }),
    ).toBe('INVITED');
  });
});
