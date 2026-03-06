import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { installMockWorkspaceApp, MOCK_IDS, MOCK_NAMES } from './support/mock-workspace-app';

async function openUserMenu(page: Page) {
  await page.locator('button[aria-haspopup="menu"]').click();
}

test.beforeEach(async ({ page }) => {
  await installMockWorkspaceApp(page);
});

test('shows dashboard data and accepts a pending invitation', async ({ page }) => {
  await page.goto('/dashboard');

  const visibleWorkspacesSection = page
    .getByRole('heading', { name: 'Visible Workspaces' })
    .locator('xpath=ancestor::section[1]');

  await expect(page.getByRole('heading', { name: 'Visible Workspaces' })).toBeVisible();
  await expect(visibleWorkspacesSection).toContainText(MOCK_NAMES.adminWorkspace);
  await expect(visibleWorkspacesSection).toContainText(MOCK_NAMES.memberWorkspace);
  await expect(visibleWorkspacesSection).toContainText(MOCK_NAMES.pendingWorkspace);

  await page.getByRole('button', { name: 'Accept' }).first().click();

  await expect(page.getByText('Invitation accepted.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invitation Inbox' })).not.toBeVisible();
  await expect(visibleWorkspacesSection).toContainText('MEMBER / ACTIVE');
});

test('creates a workspace from the shell and lands in the admin panel', async ({ page }) => {
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Create new workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Create Workspace' }),
  });

  await dialog.getByRole('textbox', { name: 'Name' }).fill('Skunkworks');
  await dialog
    .locator('form')
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();

  await expect(page).toHaveURL(/\/workspaces\/workspace-created-\d+\/admin$/);
  await expect(page.getByRole('heading', { name: 'Workspace Admin' })).toBeVisible();
  await expect(page.getByLabel('Workspace Name')).toHaveValue('Skunkworks');
});

test('updates account settings and logs out to the public login modal', async ({ page }) => {
  await page.goto('/dashboard');

  await openUserMenu(page);
  await page.getByRole('menuitem', { name: 'Account' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Account' }),
  });

  await dialog.getByLabel('First name').fill('Adele');
  await dialog.getByRole('button', { name: 'Save account' }).click();

  await expect(page.getByText('Account updated.')).toBeVisible();

  await openUserMenu(page);
  await expect(page.getByRole('menu').getByText('Adele Admin')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Logout' }).click();

  await expect(page).toHaveURL(/auth=login/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('allows a member to leave a workspace from the shell', async ({ page }) => {
  await page.goto(`/workspaces/${MOCK_IDS.memberWorkspace}`);

  await openUserMenu(page);
  await page.getByRole('menuitem', { name: 'Leave workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Leave Workspace' }),
  });

  await dialog.getByLabel('Email').fill('ada@example.com');
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Leave workspace' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText(MOCK_NAMES.memberWorkspace)).not.toBeVisible();
});

test('persists the selected mini-calendar date across dashboard, workspaces, and admin', async ({
  page,
}) => {
  const selectedDateKey = DateTime.now()
    .setZone('Europe/Rome')
    .plus({ days: 1 })
    .toFormat('yyyy-LL-dd');
  const selectedDateButton = () => page.getByRole('button', { name: `Select ${selectedDateKey}` });

  await page.goto('/dashboard');
  await selectedDateButton().click();
  await expect(selectedDateButton()).toHaveClass(/bg-cyan-100/);

  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}`);
  await expect(selectedDateButton()).toHaveClass(/bg-cyan-100/);

  await page.goto(`/workspaces/${MOCK_IDS.memberWorkspace}`);
  await expect(selectedDateButton()).toHaveClass(/bg-cyan-100/);

  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}/admin`);
  await expect(selectedDateButton()).toHaveClass(/bg-cyan-100/);

  await page.goto('/dashboard');
  await expect(selectedDateButton()).toHaveClass(/bg-cyan-100/);
});
