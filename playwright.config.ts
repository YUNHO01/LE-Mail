import path from 'path';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// 배포/런타임용 .env와 분리하여 테스트 전용 .env.test만 로드
dotenv.config({
  path: path.resolve(__dirname, '.env.test'),
  override: true,
});

const webmailUrl = (process.env.WEBMAIL_URL || 'http://localhost:9000').replace(/\/+$/, '');
const ignoreHttpsErrors = process.env.E2E_IGNORE_HTTPS_ERRORS === 'true';
const testTimeoutMs = Number(process.env.E2E_TIMEOUT_MS || 60000);

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  timeout: Number.isFinite(testTimeoutMs) ? testTimeoutMs : 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.resolve(__dirname, 'playwright-report'),
      },
    ],
  ],
  use: {
    baseURL: webmailUrl,
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: ignoreHttpsErrors,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
