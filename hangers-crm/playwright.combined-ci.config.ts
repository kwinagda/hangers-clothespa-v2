import { defineConfig } from '@playwright/test'

if (!process.env.CI) throw new Error('This isolated mock harness is only for CI; local checks use localhost:5002')

export default defineConfig({
  testDir: './tests/invoice-checkout',
  testMatch: 'razorpay-ab-responsive.spec.ts',
  grep: /customer outstanding summary/,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:55103', headless: true },
  webServer: [
    { command: 'node tests/invoice-checkout/mock-api.mjs', url: 'http://127.0.0.1:55102/__test__/stats', reuseExistingServer: false },
    { command: 'npx next dev -p 55103 --hostname 127.0.0.1', url: 'http://127.0.0.1:55103/invoice/customer-summary', timeout: 120000, reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:55102/api/v1', NEXT_DIST_DIR: '.next-combined-ci' } },
  ],
})
