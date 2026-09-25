import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/invoice-checkout',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:55103',
    headless: true,
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
  },
  webServer: [
    {
      command: 'node tests/invoice-checkout/mock-api.mjs',
      port: 55101,
      reuseExistingServer: false,
    },
    {
      command: 'NEXT_PUBLIC_API_URL=http://127.0.0.1:55101/api/v1 NEXT_PUBLIC_RAZORPAY_CHECKOUT_AB_ENABLED=true npx next dev -p 55103',
      port: 55103,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
