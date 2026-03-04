import { expect, test } from '@playwright/test';
import {
  installMockWorkspaceApp,
  MOCK_IDS,
  MOCK_NAMES,
} from './support/mock-workspace-app';

test.beforeEach(async ({ page }) => {
  await installMockWorkspaceApp(page);
});

test('updates workspace settings and manages rooms and invitations', async ({ page }) => {
  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}/admin`);

  const roomsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Meeting Rooms' }),
  });
  const peopleSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'People' }),
  });

  await expect(page.getByRole('heading', { name: 'Workspace Admin' })).toBeVisible();

  await page.getByLabel('Workspace Name').fill('Atlas North');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByLabel('Workspace Name')).toHaveValue('Atlas North');

  await roomsSection.getByPlaceholder('Room name').fill('War Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Escalation room');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');
  await expect(roomsSection.getByText('War Room')).toBeVisible();

  const focusRoomItem = roomsSection.locator('li').nth(0);
  await roomsSection.getByRole('button', { name: 'Edit' }).first().click();
  await focusRoomItem.getByRole('textbox').nth(1).fill('Quiet room updated');
  await focusRoomItem.getByRole('button', { name: 'Save' }).click();
  await expect(roomsSection.getByText('Quiet room updated')).toBeVisible();

  await peopleSection.getByPlaceholder('Invite by email').fill('teammate@example.com');
  await peopleSection.getByRole('button', { name: 'Invite' }).click();
  await expect(peopleSection.getByText('teammate@example.com')).toBeVisible();

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
  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}/admin`);

  await page.getByRole('button', { name: 'Cancel Workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Cancel Workspace' }),
  });

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
