import { expect, test } from '@playwright/test'

const url = process.env.RAZORPAY_PENDING_CHECKOUT_QA_URL || ''
const orderId = process.env.RAZORPAY_PENDING_CHECKOUT_QA_ORDER_ID || ''

test('existing pending Home checkout survives offline, reconnect and refresh without another order', async ({ page, context }) => {
  test.skip(!url || !orderId, 'Requires an existing unresolved Home Test checkout and its bound provider order.')
  expect(new URL(url).origin).toBe('http://localhost:5002')
  expect(new URL(url).pathname).toMatch(/^\/invoice\/[^/]+\/checkout$/)
  await page.setViewportSize({ width: 320, height: 900 })
  const submissions: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/payment\/(create-order|verify)/.test(request.url())) submissions.push(request.url())
  })
  await page.goto(url)
  const references = page.locator('summary', { hasText: 'Payment references' })
  await expect(references).toBeVisible()
  await references.click()
  await expect(references.locator('..')).toContainText(orderId)
  await expect(page.getByRole('button', { name: /^Pay|Resume secure checkout/ })).toHaveCount(0)
  await context.setOffline(true)
  const check = page.getByRole('button', { name: 'Check payment status', exact: true })
  await expect(check).toBeDisabled()
  await context.setOffline(false)
  await expect(check).toBeEnabled({ timeout: 15000 })
  await page.reload()
  await expect(references).toBeVisible()
  await references.click()
  await expect(references.locator('..')).toContainText(orderId)
  await expect(page.getByRole('heading', { name: 'Payment status under review' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay|Resume secure checkout/ })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(submissions).toEqual([])
})
