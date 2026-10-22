import { expect, test } from '@playwright/test'

const url = process.env.RAZORPAY_PAID_CHECKOUT_QA_URL || ''

for (const width of [320, 768, 1440]) {
  test(`captured Home checkout confirmation is keyboard accessible at ${width}px`, async ({ page }) => {
    test.skip(!url, 'Requires an existing captured Home Test invoice share.')
    const target = new URL(url)
    expect(target.origin).toBe('http://localhost:5002')
    expect(target.pathname).toMatch(/^\/invoice\/[^/]+\/checkout$/)
    await page.setViewportSize({ width, height: 900 })
    const submissions: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/payment\/(create-order|verify)/.test(request.url())) submissions.push(request.url())
    })
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Invoice paid', exact: true })).toBeVisible()
    await expect(page.getByAltText('Hangers Clothes Spa')).toBeVisible()
    await expect(page.locator('[aria-current="step"]')).toHaveText('3 Confirmation')
    await expect(page.getByRole('button', { name: /^Pay|Resume secure checkout/ })).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('pay_TiZlUVmIRkmX5R')
    const references = page.locator('summary', { hasText: 'Paid invoice split' })
    await expect(references).toBeVisible()
    for (let tab = 0; tab < 20; tab++) {
      if (await references.evaluate((element) => element === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(references).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(references.locator('..')).toHaveAttribute('open', '')
    await expect(references.locator('..')).toContainText('CUSTOM-ACCEPT-20261001-ONE')
    await page.keyboard.press('Enter')
    await expect(references.locator('..')).not.toHaveAttribute('open', '')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    expect(submissions).toEqual([])
  })
}
