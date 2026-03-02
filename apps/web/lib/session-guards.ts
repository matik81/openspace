import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ErrorPayload } from './types';

export function isUserSuspendedError(error: ErrorPayload | null | undefined): boolean {
  return error?.code === 'USER_SUSPENDED';
}

export async function logoutSuspendedUser(router: AppRouterInstance): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  router.replace('/login?reason=user-suspended');
  router.refresh();
}
