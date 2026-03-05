import { expect, test } from '@playwright/test';
import { installMockWorkspaceApp, MOCK_IDS } from './support/mock-workspace-app';

test.beforeEach(async ({ page }) => {
  await installMockWorkspaceApp(page);
});

test('creates, edits, and cancels a booking from the workspace page', async ({ page }) => {
  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}`);

  const createBookingTrigger = page.getByRole('button', { name: 'Create booking in Focus Room' });
  await expect(createBookingTrigger).toBeVisible();
  await createBookingTrigger.click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Create Booking' }),
  });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill('Ops Review');
  await dialog.getByLabel('Start').selectOption('13:00');
  await dialog.getByLabel('End').selectOption('14:00');
  await dialog.getByLabel('Criticality').selectOption('HIGH');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByText('Booking created.')).toBeVisible();

  const myBookingsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'My bookings' }),
  });

  await expect(myBookingsSection.getByText('Ops Review')).toBeVisible();
  await myBookingsSection.getByRole('button', { name: /Ops Review/i }).click();

  const editDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Booking' }),
  });

  await editDialog.getByLabel('Title').fill('Ops Review Updated');
  await editDialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Booking updated.')).toBeVisible();
  await expect(myBookingsSection.getByText('Ops Review Updated')).toBeVisible();

  await myBookingsSection.getByRole('button', { name: /Ops Review Updated/i }).click();
  await editDialog.getByRole('button', { name: 'Cancel Reservation' }).click();

  await expect(page.getByText('Reservation cancelled.')).toBeVisible();
  await expect(myBookingsSection.getByText('Ops Review Updated')).not.toBeVisible();
});

test('opens an existing booking from the URL and shows non-owner details as read-only', async ({
  page,
}) => {
  await page.goto(`/workspaces/${MOCK_IDS.adminWorkspace}?bookingId=booking-admin-other`);

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Booking Details' }),
  });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue('Team Sync');
  await expect(dialog.getByRole('button', { name: 'Save' })).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel Reservation' })).not.toBeVisible();
});
