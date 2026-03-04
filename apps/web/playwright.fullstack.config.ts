import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { FULLSTACK_DATABASE_URL } from './e2e-fullstack/support/runtime-env';

const isCI = Boolean(process.env.CI);
const repoRoot = path.resolve(__dirname, '../..');

const apiEnv = {
  ...process.env,
  API_PORT: '3001',
  DATABASE_URL: FULLSTACK_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6379',
  TRUSTED_PROXY_IPS: '127.0.0.1,::1,::ffff:127.0.0.1',
  JWT_ACCESS_SECRET: 'playwright-access-secret',
  JWT_REFRESH_SECRET: 'playwright-refresh-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  EMAIL_VERIFICATION_TTL_MINUTES: '60',
};

export default defineConfig({
  testDir: './e2e-fullstack',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 5_000,
  },
  reporter: 'list',
  globalSetup: isCI ? undefined : './e2e-fullstack/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'api',
      command: isCI ? 'pnpm --filter @openspace/api start' : 'pnpm --filter @openspace/api start:dev',
      cwd: repoRoot,
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: false,
      timeout: isCI ? 240_000 : 120_000,
      env: apiEnv,
    },
    {
      name: 'web',
      command: 'pnpm --filter @openspace/web dev',
      cwd: repoRoot,
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: isCI ? 240_000 : 120_000,
      env: {
        ...process.env,
        OPENSPACE_API_BASE_URL: 'http://localhost:3001',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
