import type { WorkspaceItem } from '@/lib/types';

function decodeWorkspacePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeWorkspaceSlugCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/[.-]{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

export function buildWorkspacePathFromSlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}`;
}

export function buildWorkspaceControlPathFromSlug(workspaceSlug: string): string {
  return `${buildWorkspacePathFromSlug(workspaceSlug)}/control`;
}

export function resolveWorkspaceByRouteSlug(
  items: WorkspaceItem[],
  routeWorkspaceSlug: string,
): WorkspaceItem | null {
  const decodedWorkspaceSlug = decodeWorkspacePathSegment(routeWorkspaceSlug).toLowerCase();
  return items.find((item) => item.slug === decodedWorkspaceSlug) ?? null;
}
