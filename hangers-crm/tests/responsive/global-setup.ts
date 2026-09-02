import { chromium, type FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  const auditPassword = process.env.CRM_AUDIT_PASSWORD
  if (!auditPassword) throw new Error('CRM_AUDIT_PASSWORD is required for the authenticated responsive audit')
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  const page = await browser.newPage()
  const baseURL = config.projects[0].use.baseURL as string
  await page.goto(`${baseURL}/login`)
  await page.getByLabel('Email').fill(process.env.CRM_AUDIT_EMAIL || 'admin@hangers.local')
  await page.getByLabel('Password').fill(auditPassword)
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ])
  await page.context().storageState({ path: 'test-results/responsive-auth.json' })
  await browser.close()
}
