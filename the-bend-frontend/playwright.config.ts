import { defineConfig } from '@playwright/test';

const browserChannel = process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'output/playwright/test-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: browserChannel,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    env: {
      VITE_TENANT_SLUG: 'westmoreland',
    },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
  },
});
