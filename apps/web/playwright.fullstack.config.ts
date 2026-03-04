import { defineConfig, devices } from '@playwright/test';
import { FULLSTACK_DATABASE_URL } from './e2e-fullstack/support/runtime-env';

const apiEnv = {
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
  globalSetup: './e2e-fullstack/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @openspace/api start:dev',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
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
