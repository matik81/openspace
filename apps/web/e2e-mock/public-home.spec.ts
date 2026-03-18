import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/register-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ allowed: true }),
    });
  });
});

test('opens and closes the login modal from the public home page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Guest preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify email' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reset password' })).toBeHidden();
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/auth=login/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/auth=login/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeHidden();
});

test('completes the register to verify-email smoke flow', async ({ page }) => {
  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/auth/verify-email', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();

  await page.getByLabel('First name').fill('Ada');
  await page.getByLabel('Last name').fill('Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel(/^Password$/).fill('password123');
  await page.getByLabel('Confirm password').fill('password123');
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Confirm password') })
    .getByRole('button', { name: 'Register' })
    .click();

  await expect(page).toHaveURL(/auth=verify-email/);
  await expect(page.getByText(/Registration complete for/)).toBeVisible();
  await expect(page.getByText('ada@example.com')).toBeVisible();

  await page.getByLabel('Verification token').fill('token-123');
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Verification token') })
    .getByRole('button', { name: 'Verify email' })
    .click();

  await expect(page).toHaveURL(/auth=login/);
  await expect(page.getByText('Email verified. You can now log in.')).toBeVisible();
});

test('completes invitation registration from a deep link', async ({ page }) => {
  await page.route('**/api/auth/register-invitation?token=invite-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: 'invitee@example.com',
        workspaceName: 'Engineering',
        inviterName: 'Ada Lovelace',
        expiresAt: '2026-03-25T10:00:00.000Z',
      }),
    });
  });

  await page.route('**/api/auth/register', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/register?token=invite-token');

  await expect(page).toHaveURL(/auth=register-invitation/);
  await expect(page.getByText(/Ada Lovelace/)).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('invitee@example.com');

  await page.getByLabel('First name').fill('Grace');
  await page.getByLabel('Last name').fill('Hopper');
  await page.getByLabel(/^Password$/).fill('password123');
  await page.getByLabel('Confirm password').fill('password123');
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Confirm password') })
    .getByRole('button', { name: 'Create invited account' })
    .click();

  await expect(page).toHaveURL(/auth=login/);
  await expect(page.getByText(/Account created and email verified/i)).toBeVisible();
});
