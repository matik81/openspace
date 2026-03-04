import { loginAsSeededAdmin } from './support/auth';
import { expect, FULLSTACK_E2E, test } from './support/scenario';

test('logs in with a seeded verified user and accepts a real pending invitation', async ({
  page,
}) => {
  await loginAsSeededAdmin(page);

  const visibleWorkspacesSection = page
    .getByRole('heading', { name: 'Visible Workspaces' })
    .locator('xpath=ancestor::section[1]');

  await expect(visibleWorkspacesSection).toContainText(FULLSTACK_E2E.workspaces.admin.name);
  await expect(visibleWorkspacesSection).toContainText(FULLSTACK_E2E.workspaces.pending.name);

  await page.getByRole('button', { name: 'Accept' }).first().click();

  await expect(page.getByText('Invitation accepted.')).toBeVisible();
  await expect(visibleWorkspacesSection).toContainText(FULLSTACK_E2E.workspaces.pending.name);
  await expect(visibleWorkspacesSection).toContainText('MEMBER / ACTIVE');
});
