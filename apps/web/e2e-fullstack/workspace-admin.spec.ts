import { loginAsSeededAdmin } from './support/auth';
import { expect, FULLSTACK_E2E, test } from './support/scenario';

function workspaceControlPathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}/control`;
}

function workspacePathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}`;
}

test('creates a room and invitation against the real API from the control panel', async ({
  page,
}) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspaceControlPathBySlug(FULLSTACK_E2E.workspaces.admin.slug));

  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancellation' })).toBeVisible();
  await page.getByRole('button', { name: /Ada Lovelace/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Leave workspace' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Resources' }).click();
  const roomsSection = page
    .getByRole('heading', { name: 'Resources' })
    .locator('xpath=ancestor::section[1]');

  await roomsSection.getByPlaceholder('Room name').fill('Full-stack Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Created via API');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');

  await expect(roomsSection).toContainText('Full-stack Room');
  await expect(roomsSection).toContainText('Created via API');

  await page.getByRole('link', { name: 'Members' }).click();
  const membersSection = page
    .getByRole('heading', { name: 'Members' })
    .locator('xpath=ancestor::section[1]');
  const directorySection = page
    .getByRole('heading', { name: 'Directory' })
    .locator('xpath=ancestor::section[1]');
  const ownerRow = directorySection.getByRole('row').filter({ hasText: 'Ada Lovelace' });
  await expect(ownerRow).toContainText('OWNER');
  await expect(ownerRow.getByText('ADMIN', { exact: true })).toHaveCount(0);
  await expect(ownerRow.getByText('Owner', { exact: true })).toHaveCount(0);
  const graceRow = directorySection.getByRole('row').filter({ hasText: 'Grace Hopper' });
  await expect(graceRow).toContainText('ACTIVE');
  await graceRow.getByRole('button', { name: 'Actions' }).click();
  await expect(graceRow.getByRole('menuitem', { name: 'Promote to admin' })).toBeVisible();
  await graceRow.getByRole('menuitem', { name: 'Promote to admin' }).click();
  await expect(graceRow).toContainText('ADMIN');
  await graceRow.getByRole('button', { name: 'Actions' }).click();
  await expect(graceRow.getByRole('menuitem', { name: 'Demote to member' })).toBeVisible();
  await graceRow.getByRole('menuitem', { name: 'Demote to member' }).click();
  await expect(graceRow).toContainText('ACTIVE');
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toContainText('INACTIVE');
  const filterButton = directorySection.getByRole('button', { name: /^Filter/ });
  await filterButton.click();
  await page.getByRole('checkbox', { name: 'INACTIVE', exact: true }).click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toHaveCount(0);
  await directorySection.getByRole('button', { name: 'Show all' }).click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' }),
  ).toHaveCount(1);
  await membersSection.getByPlaceholder('Invite by email').fill('real.e2e.member@example.com');
  await membersSection.getByRole('button', { name: 'Invite' }).click();

  await expect(page.getByRole('heading', { name: 'Pending Invitations' })).toHaveCount(0);
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'real.e2e.member@example.com' }),
  ).toContainText('INVITED');
  const invitedRow = directorySection.getByRole('row').filter({
    hasText: 'real.e2e.member@example.com',
  });
  await invitedRow.getByRole('button', { name: 'Actions' }).click();
  await invitedRow.getByRole('menuitem', { name: 'Revoke invitation' }).click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'real.e2e.member@example.com' }),
  ).toHaveCount(0);
});

test('opens a seeded booking from the control panel sidebar against the real API', async ({
  page,
}) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspaceControlPathBySlug(FULLSTACK_E2E.workspaces.admin.slug));

  const myBookingsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'My bookings' }),
  });
  await myBookingsSection
    .getByRole('button', { name: new RegExp(FULLSTACK_E2E.bookings.existing.subject, 'i') })
    .click();

  await expect(page).toHaveURL(
    new RegExp(
      `${workspacePathBySlug(FULLSTACK_E2E.workspaces.admin.slug).replace('.', '\\.')}\\?bookingId=${FULLSTACK_E2E.bookings.existing.id}&date=\\d{4}-\\d{2}-\\d{2}$`,
    ),
  );

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Booking' }),
  });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue(FULLSTACK_E2E.bookings.existing.subject);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(workspacePathBySlug(FULLSTACK_E2E.workspaces.admin.slug));
});

test('non-owner admins keep resource access, do not see owner-only actions, and can leave the workspace', async ({
  page,
}) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspaceControlPathBySlug(FULLSTACK_E2E.workspaces.managed.slug));

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

  const roomsSection = page
    .getByRole('heading', { name: 'Resources' })
    .locator('xpath=ancestor::section[1]');
  await roomsSection.getByPlaceholder('Room name').fill('Managed Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Owned by another user');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');
  await expect(roomsSection).toContainText('Managed Room');

  await page.getByRole('link', { name: 'Members' }).click();
  const membersSection = page
    .getByRole('heading', { name: 'Members' })
    .locator('xpath=ancestor::section[1]');
  const directorySection = page
    .getByRole('heading', { name: 'Directory' })
    .locator('xpath=ancestor::section[1]');
  const memberRow = directorySection.getByRole('row').filter({ hasText: 'Katherine Johnson' });

  await expect(memberRow).toContainText('ACTIVE');
  await memberRow.getByRole('button', { name: 'Actions' }).click();
  await expect(memberRow.getByRole('menuitem', { name: 'Remove member' })).toBeVisible();
  await expect(memberRow.getByRole('menuitem', { name: 'Promote to admin' })).toHaveCount(0);
  await expect(memberRow.getByRole('menuitem', { name: 'Demote to member' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await membersSection.getByPlaceholder('Invite by email').fill('managed.e2e.member@example.com');
  await membersSection.getByRole('button', { name: 'Invite' }).click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'managed.e2e.member@example.com' }),
  ).toContainText('INVITED');

  await page.getByRole('button', { name: /Ada Lovelace/i }).click();
  await page.getByRole('menuitem', { name: 'Leave workspace' }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Leave Workspace' }),
  });

  await dialog.getByLabel('Email').fill(FULLSTACK_E2E.credentials.email);
  await dialog.getByLabel('Password').fill(FULLSTACK_E2E.credentials.password);
  await dialog.getByRole('button', { name: 'Leave workspace' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText(FULLSTACK_E2E.workspaces.managed.name)).not.toBeVisible();
});
