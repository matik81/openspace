import { expect, test } from '@playwright/test';
import { installMockWorkspaceApp } from './support/mock-workspace-app';

test('redirects to login when the session is expired', async ({ page }) => {
  await installMockWorkspaceApp(page, {
    overrides: {
      workspaces: {
        status: 401,
        body: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
    },
  });

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/auth=login&reason=session-expired/);
  await expect(page.getByText('Your session has expired. Please log in again.')).toBeVisible();
});

test('logs out suspended users and redirects them to login', async ({ page }) => {
  await installMockWorkspaceApp(page, {
    overrides: {
      workspaces: {
        status: 429,
        body: {
          code: 'USER_SUSPENDED',
          message: 'Account suspended due to rate limits.',
        },
      },
    },
  });

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/auth=login&reason=user-suspended/);
  await expect(
    page.getByText(
      'This account has been temporarily suspended due to rate limits. Login is unavailable right now.',
    ),
  ).toBeVisible();
});
