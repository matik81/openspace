import { expect, test, type Page } from '@playwright/test';
import {
  installMockWorkspaceApp,
  MOCK_NAMES,
  MOCK_SLUGS,
  workspaceAdminPathBySlug,
} from './support/mock-workspace-app';

async function installNonOwnerAdminWorkspace(page: Page) {
  const { state } = await installMockWorkspaceApp(page);
  const workspace = state.workspaces.find((item) => item.id === 'workspace-admin');
  if (!workspace) {
    throw new Error('Expected admin workspace to exist');
  }

  workspace.createdByUserId = 'user-owner';
  state.membersByWorkspaceId['workspace-admin'] = [
    {
      userId: 'user-owner',
      firstName: 'Olivia',
      lastName: 'Owner',
      email: 'owner@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
      joinedAt: workspace.createdAt,
    },
    ...(state.membersByWorkspaceId['workspace-admin'] ?? []),
  ];

  return state;
}

test('owner updates workspace settings, manages rooms and invitations, and promotes or demotes admins', async ({
  page,
}) => {
  await installMockWorkspaceApp(page);
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await expect(page.getByRole('heading', { name: 'Workspace Admin' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancellation' })).toBeVisible();

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
  const ownerRow = directorySection.getByRole('row').filter({ hasText: 'Ada Admin' });
  await expect(ownerRow).toContainText('OWNER');
  await expect(ownerRow.getByText('ADMIN', { exact: true })).toHaveCount(0);
  await expect(ownerRow.getByText('Owner', { exact: true })).toHaveCount(0);
  await expect(directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' })).toContainText(
    'ACTIVE',
  );
  const graceRow = directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' });
  await expect(graceRow.getByRole('button', { name: 'Promote to admin' })).toBeVisible();
  await graceRow.getByRole('button', { name: 'Promote to admin' }).click();
  await expect(graceRow).toContainText('ADMIN');
  await expect(graceRow.getByRole('button', { name: 'Demote to member' })).toBeVisible();
  await graceRow.getByRole('button', { name: 'Demote to member' }).click();
  await expect(graceRow).toContainText('ACTIVE');
  await expect(graceRow.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toContainText('INACTIVE');
  await membersSection.getByPlaceholder('Invite by email').fill('teammate@example.com');
  await membersSection.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByRole('heading', { name: 'Pending Invitations' })).toHaveCount(0);
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'teammate@example.com' }),
  ).toContainText('INVITED');
  await directorySection
    .getByRole('row')
    .filter({ hasText: 'teammate@example.com' })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'teammate@example.com' }),
  ).toHaveCount(0);

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

test('removes an active member with email and password confirmation', async ({ page }) => {
  await installMockWorkspaceApp(page);
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await page.getByRole('link', { name: 'Members' }).click();
  const directorySection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Directory' }),
  });
  const graceRow = directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' });

  await expect(graceRow).toContainText('ACTIVE');
  await graceRow.getByRole('button', { name: 'Remove' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Remove Member' }),
  });

  await dialog.getByLabel('Email').fill('ada@example.com');
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Remove member' }).click();

  await expect(graceRow).toContainText('INACTIVE');
  await expect(graceRow.getByRole('button', { name: 'Remove' })).toHaveCount(0);
});

test('filters the member directory by status', async ({ page }) => {
  await installMockWorkspaceApp(page);
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await page.getByRole('link', { name: 'Members' }).click();
  const directorySection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Directory' }),
  });
  const filterButton = directorySection.getByRole('button', { name: /^Filter/ });

  await expect(directorySection.getByRole('row').filter({ hasText: 'Ada Admin' })).toHaveCount(1);
  await expect(directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' })).toHaveCount(
    1,
  );
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toHaveCount(1);

  await filterButton.click();
  await page.getByRole('checkbox', { name: 'INACTIVE', exact: true }).click();

  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toHaveCount(0);
  await expect(filterButton).toContainText('4/5');

  await page.getByRole('checkbox', { name: 'OWNER', exact: true }).click();
  await page.getByRole('checkbox', { name: 'ADMIN', exact: true }).click();
  await page.getByRole('checkbox', { name: 'ACTIVE', exact: true }).click();
  await page.getByRole('checkbox', { name: 'INVITED', exact: true }).click();

  await expect(
    directorySection.getByText('No people match the selected status filters.'),
  ).toBeVisible();
  await filterButton.click();
  await directorySection.getByRole('button', { name: 'Show all statuses' }).click();

  await expect(directorySection.getByRole('row').filter({ hasText: 'Ada Admin' })).toHaveCount(1);
  await expect(directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' })).toHaveCount(
    1,
  );
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toHaveCount(1);
});

test('cancels the workspace and redirects back to the dashboard', async ({ page }) => {
  await installMockWorkspaceApp(page);
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
  await installMockWorkspaceApp(page);
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

test('non-owner admins keep resource access, can leave, and do not see owner-only actions', async ({
  page,
}) => {
  await installNonOwnerAdminWorkspace(page);
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancellation' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
  await expect(
    page.getByText(
      'Only the workspace owner can edit these settings. Admins can review them here for reference.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Display Name')).toBeDisabled();
  await expect(page.getByLabel('Web Address')).toBeDisabled();
  await expect(page.getByLabel('Timezone')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Settings' })).toBeDisabled();

  await page.getByRole('link', { name: 'Resources' }).click();

  const roomsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Resources' }),
  });
  await roomsSection.getByPlaceholder('Room name').fill('Ops Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Admin-managed room');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');
  await expect(roomsSection.getByText('Ops Room')).toBeVisible();

  await page.getByRole('link', { name: 'Members' }).click();
  const membersSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Members' }),
  });
  const directorySection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Directory' }),
  });
  const graceRow = directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' });

  await expect(graceRow.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expect(graceRow.getByRole('button', { name: 'Promote to admin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Demote to member' })).toHaveCount(0);

  await membersSection.getByPlaceholder('Invite by email').fill('ops-admin@example.com');
  await membersSection.getByRole('button', { name: 'Invite' }).click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'ops-admin@example.com' }),
  ).toContainText('INVITED');

  await page.getByRole('button', { name: /Ada Admin/i }).click();
  await page.getByRole('menuitem', { name: 'Leave workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Leave Workspace' }),
  });

  await dialog.getByLabel('Email').fill('ada@example.com');
  await dialog.getByLabel('Password').fill('password123');
  await dialog.getByRole('button', { name: 'Leave workspace' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText(MOCK_NAMES.adminWorkspace)).not.toBeVisible();
});

test('owners do not get a leave-workspace action in the shell menu', async ({ page }) => {
  await installMockWorkspaceApp(page);
  await page.goto(workspaceAdminPathBySlug(MOCK_SLUGS.adminWorkspace));

  await page.getByRole('button', { name: /Ada Admin/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Leave workspace' })).toHaveCount(0);
});
