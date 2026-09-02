import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/responsive',
  timeout: 10 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './tests/responsive/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5002',
    headless: true,
    launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    storageState: 'test-results/responsive-auth.json',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
