import { expect, type Page } from '@playwright/test';
import { FULLSTACK_E2E } from './constants';

export async function loginAsSeededAdmin(page: Page) {
  await page.goto('/?auth=login');

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Login' }),
  });

  await dialog.getByLabel('Email').fill(FULLSTACK_E2E.credentials.email);
  await dialog.getByLabel('Password').fill(FULLSTACK_E2E.credentials.password);
  await dialog
    .locator('form')
    .getByRole('button', { name: 'Login', exact: true })
    .click();

  await expect(page).toHaveURL('/dashboard');
}
