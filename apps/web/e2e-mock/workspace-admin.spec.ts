import { expect, test } from '@playwright/test';
import {
  installMockWorkspaceApp,
  MOCK_NAMES,
  MOCK_SLUGS,
  workspaceAdminPathBySlug,
} from './support/mock-workspace-app';

test.beforeEach(async ({ page }) => {
  await installMockWorkspaceApp(page);
});

test('updates workspace settings and manages rooms and invitations', async ({ page }) => {
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await expect(page.getByRole('heading', { name: 'Workspace Admin' })).toBeVisible();

  await page.getByLabel('Display Name').fill('Atlas North');
  await page.getByLabel('Web Address').fill('atlas.north');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page).toHaveURL(`${workspaceAdminPathBySlug('atlas.north')}?panel=settings`);
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.getByLabel('Display Name')).toHaveValue('Atlas North');
  await expect(page.getByLabel('Web Address')).toHaveValue('atlas.north');

  await page.getByRole('link', { name: 'Resources' }).click();
  const roomsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Resources' }),
  });
  await roomsSection.getByPlaceholder('Room name').fill('War Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Escalation room');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');
  await expect(roomsSection.getByText('War Room')).toBeVisible();

  const focusRoomItem = roomsSection.locator('li').nth(0);
  await roomsSection.getByRole('button', { name: 'Edit' }).first().click();
  await focusRoomItem.getByRole('textbox').nth(1).fill('Quiet room updated');
  await focusRoomItem.getByRole('button', { name: 'Save' }).click();
  await expect(roomsSection.getByText('Quiet room updated')).toBeVisible();

  await page.getByRole('link', { name: 'Members' }).click();
  const membersSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Members' }),
  });
  const directorySection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Directory' }),
  });
  await expect(directorySection.getByRole('row').filter({ hasText: 'Ada Admin' })).toContainText(
    'ADMIN',
  );
  await expect(directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' })).toContainText(
    'ACTIVE',
  );
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toContainText('LEFT');
  await membersSection.getByPlaceholder('Invite by email').fill('teammate@example.com');
  await membersSection.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByRole('heading', { name: 'Pending Invitations' })).toHaveCount(0);
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'teammate@example.com' }),
  ).toContainText('INVITED');

  await page.getByRole('link', { name: 'Resources' }).click();
  const warRoomItem = roomsSection.locator('li').filter({
    has: page.getByText('War Room'),
  });
  await warRoomItem.getByRole('button', { name: 'Cancel' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Cancel Room' }),
  });

  await dialog.getByLabel('Room Name Confirmation').fill('War Room');
  await dialog.getByLabel('Email').click();
  await dialog.getByLabel('Email').fill('ada@example.com');
  await dialog.getByLabel('Password').click();
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Confirm Room Cancellation' }).click();

  await expect(roomsSection.getByText('War Room')).not.toBeVisible();
});

test('cancels the workspace and redirects back to the dashboard', async ({ page }) => {
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await page.getByRole('link', { name: 'Cancellation' }).click();
  await page.getByRole('button', { name: 'Cancel Workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Cancel Workspace' }),
  });

  expect(await dialog.evaluate((node) => node.parentElement?.tagName)).toBe('BODY');

  await dialog.getByLabel('Workspace Name Confirmation').fill(MOCK_NAMES.adminWorkspace);
  await dialog.getByLabel('Email').click();
  await dialog.getByLabel('Email').fill('ada@example.com');
  await dialog.getByLabel('Password').click();
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Confirm Workspace Cancellation' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Visible Workspaces' })).toBeVisible();
  await expect(page.getByText(MOCK_NAMES.adminWorkspace)).not.toBeVisible();
});

test('supports direct admin subpanel links and falls back to settings for invalid values', async ({
  page,
}) => {
  await page.goto(`${workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace)}?panel=resources`);

  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible();
  await expect(page.getByLabel('Display Name')).not.toBeVisible();

  await page.goto(`${workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace)}?panel=cancellation`);

  await expect(page.getByRole('heading', { name: 'Workspace Cancellation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel Workspace' })).toBeVisible();

  await page.goto(`${workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace)}?panel=unknown`);

  await expect(page.getByLabel('Display Name')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resources' })).not.toBeVisible();
});
