import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node server.js',
      url: 'http://127.0.0.1:3001/healthz',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npx vite --port 5174 --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--no-sandbox',
          ],
        },
      },
    },
  ],
});

