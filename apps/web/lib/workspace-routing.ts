import type { WorkspaceItem } from '@/lib/types';

function decodeWorkspacePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildWorkspacePathFromName(workspaceName: string): string {
  return `/${encodeURIComponent(workspaceName)}`;
}

export function buildWorkspaceAdminPathFromName(workspaceName: string): string {
  return `${buildWorkspacePathFromName(workspaceName)}/admin`;
}

export function resolveWorkspaceByRouteName(
  items: WorkspaceItem[],
  routeWorkspaceName: string,
): WorkspaceItem | null {
  const decodedWorkspaceName = decodeWorkspacePathSegment(routeWorkspaceName);
  return items.find((item) => item.name === decodedWorkspaceName) ?? null;
}

