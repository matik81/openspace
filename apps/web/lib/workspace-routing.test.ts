import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceAdminPathFromName,
  buildWorkspacePathFromName,
  resolveWorkspaceByRouteName,
} from '@/lib/workspace-routing';

describe('workspace-routing', () => {
  it('builds workspace and admin paths from workspace names', () => {
    expect(buildWorkspacePathFromName('Atlas HQ')).toBe('/Atlas%20HQ');
    expect(buildWorkspaceAdminPathFromName('Atlas HQ')).toBe('/Atlas%20HQ/admin');
  });

  it('resolves workspace by encoded route name', () => {
    const workspace = resolveWorkspaceByRouteName(
      [
        {
          id: 'workspace-1',
          name: 'Atlas HQ',
          timezone: 'UTC',
          scheduleStartHour: 8,
          scheduleEndHour: 18,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          membership: {
            role: 'ADMIN',
            status: 'ACTIVE',
          },
          invitation: null,
        },
      ],
      'Atlas%20HQ',
    );

    expect(workspace?.id).toBe('workspace-1');
  });
});

