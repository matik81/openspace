import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceControlPathFromSlug,
  buildWorkspacePathFromSlug,
  normalizeWorkspaceSlugCandidate,
  resolveWorkspaceByRouteSlug,
} from '@/lib/workspace-routing';

describe('workspace-routing', () => {
  it('normalizes user-facing values into workspace slug candidates', () => {
    expect(normalizeWorkspaceSlugCandidate('Nome Azienda Srl')).toBe('nome-azienda-srl');
    expect(normalizeWorkspaceSlugCandidate('nome.azienda')).toBe('nome.azienda');
  });

  it('builds workspace and control-panel paths from workspace slugs', () => {
    expect(buildWorkspacePathFromSlug('nome.azienda')).toBe('/nome.azienda');
    expect(buildWorkspaceControlPathFromSlug('nome.azienda')).toBe('/nome.azienda/control');
  });

  it('resolves workspace by encoded route slug', () => {
    const workspace = resolveWorkspaceByRouteSlug(
      [
        {
          id: 'workspace-1',
          name: 'Atlas HQ',
          slug: 'atlas.hq',
          timezone: 'UTC',
          scheduleStartHour: 8,
          scheduleEndHour: 18,
          createdByUserId: 'user-1',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          membership: {
            role: 'ADMIN',
            status: 'ACTIVE',
          },
          invitation: null,
        },
      ],
      'ATLAS.hq',
    );

    expect(workspace?.id).toBe('workspace-1');
  });
});
