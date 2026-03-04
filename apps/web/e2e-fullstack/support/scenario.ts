import { test as base } from '@playwright/test';
import { FULLSTACK_E2E } from './constants';
import { FULLSTACK_DATABASE_URL } from './runtime-env';

export const test = base.extend({});
export const expect = test.expect;
export { FULLSTACK_E2E };

type E2EDatabaseModule = {
  resetAndSeedFullStackScenario: () => Promise<void>;
  disconnectE2EDatabase: () => Promise<void>;
};

async function loadE2EDatabaseModule(): Promise<E2EDatabaseModule> {
  const modulePath = '../../../api/scripts/e2e-db.mjs';
  return import(modulePath) as Promise<E2EDatabaseModule>;
}

test.beforeEach(async ({ context }) => {
  process.env.DATABASE_URL = FULLSTACK_DATABASE_URL;
  const { resetAndSeedFullStackScenario } = await loadE2EDatabaseModule();
  await resetAndSeedFullStackScenario();
  await context.clearCookies();
});

test.afterAll(async () => {
  process.env.DATABASE_URL = FULLSTACK_DATABASE_URL;
  const { disconnectE2EDatabase } = await loadE2EDatabaseModule();
  await disconnectE2EDatabase();
});
