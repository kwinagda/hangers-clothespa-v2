import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/quotations',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5098',
    launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  },
  webServer: {
    command: 'NEXT_DIST_DIR=.next-test-quotation NEXT_PUBLIC_API_URL=http://localhost:5098/api/v1 npx next dev --hostname localhost -p 5098',
    url: 'http://localhost:5098/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
