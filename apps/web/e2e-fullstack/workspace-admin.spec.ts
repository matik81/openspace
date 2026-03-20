import { loginAsSeededAdmin } from './support/auth';
import { expect, FULLSTACK_E2E, test } from './support/scenario';

function workspaceAdminPathBySlug(workspaceSlug: string): string {
  return `/${encodeURIComponent(workspaceSlug)}/admin`;
}

test('creates a room and invitation against the real API from the admin page', async ({ page }) => {
  await loginAsSeededAdmin(page);
  await page.goto(workspaceAdminPathBySlug(FULLSTACK_E2E.workspaces.admin.slug));

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
  await expect(directorySection.getByRole('row').filter({ hasText: 'Ada Lovelace' })).toContainText(
    'ADMIN',
  );
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
  await directorySection
    .getByRole('row')
    .filter({ hasText: 'real.e2e.member@example.com' })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect(
    directorySection.getByRole('row').filter({ hasText: 'real.e2e.member@example.com' }),
  ).toHaveCount(0);
});
