import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/invoice-checkout',
  testMatch: ['invoice-local-safety.spec.ts', 'custom-checkout-local.spec.ts', 'paid-checkout-accessibility.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5002',
    headless: true,
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
  },
})
