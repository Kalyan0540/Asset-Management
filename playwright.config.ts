import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3211',
    headless: true,
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3211',
    reuseExistingServer: false,
    env: { PORT: '3211', ATLAS_LIBRARY: '.test-library' },
    timeout: 30000,
  },
});
