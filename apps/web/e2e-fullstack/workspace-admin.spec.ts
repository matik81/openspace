import { loginAsSeededAdmin } from './support/auth';
import { expect, FULLSTACK_E2E, test } from './support/scenario';

function workspaceAdminPathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}/admin`;
}

test('creates a room and invitation against the real API from the admin page', async ({ page }) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspaceAdminPathBySlug(FULLSTACK_E2E.workspaces.admin.slug));

  const roomsSection = page
    .getByRole('heading', { name: 'Meeting Rooms' })
    .locator('xpath=ancestor::section[1]');
  const peopleSection = page
    .getByRole('heading', { name: 'People' })
    .locator('xpath=ancestor::section[1]');

  await roomsSection.getByPlaceholder('Room name').fill('Full-stack Room');
  await roomsSection.getByPlaceholder('Description (optional)').fill('Created via API');
  await roomsSection.getByPlaceholder('Description (optional)').press('Enter');

  await expect(roomsSection).toContainText('Full-stack Room');
  await expect(roomsSection).toContainText('Created via API');

  await peopleSection.getByPlaceholder('Invite by email').fill('real.e2e.member@example.com');
  await peopleSection.getByRole('button', { name: 'Invite' }).click();

  await expect(peopleSection).toContainText('real.e2e.member@example.com');
});
