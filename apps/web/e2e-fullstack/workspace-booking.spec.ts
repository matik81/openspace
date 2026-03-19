import { loginAsSeededAdmin } from './support/auth';
import { expect, FULLSTACK_E2E, test } from './support/scenario';

function workspacePathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}`;
}

test('creates and cancels a booking against the real API', async ({ page }) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspacePathBySlug(FULLSTACK_E2E.workspaces.admin.slug));
  await page.getByRole('button', { name: 'Today' }).first().click();

  const createBookingTrigger = page.getByRole('button', {
    name: `Create booking in ${FULLSTACK_E2E.rooms.focus.name}`,
  });
  await expect(createBookingTrigger).toBeVisible();
  await createBookingTrigger.click();

  const createDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Create Booking' }),
  });

  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByLabel('Title')).toBeFocused();
  await createDialog.getByLabel('Title').fill('Full-stack booking');
  await createDialog.getByLabel('Start').selectOption('13:00');
  await createDialog.getByLabel('End').selectOption('14:00');
  await createDialog
    .locator('form')
    .getByRole('button', { name: 'Create', exact: true })
    .click();

  await expect(page.getByText('Booking created.')).toBeVisible();

  const myBookingsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'My bookings' }),
  });
  await expect(myBookingsSection).toContainText('Full-stack booking');

  await myBookingsSection.getByRole('button', { name: /Full-stack booking/i }).click();

  const editDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Booking' }),
  });

  await editDialog.getByRole('button', { name: 'Cancel Reservation' }).click();

  await expect(page.getByText('Booking cancelled.')).toBeVisible();
  await expect(myBookingsSection).not.toContainText('Full-stack booking');
});
