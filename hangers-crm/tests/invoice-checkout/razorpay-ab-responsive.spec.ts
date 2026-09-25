import { expect, test } from '@playwright/test'

const approvedTestContact = '+91 9930367267'

const viewports = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

test('invoice checkout A/B presentation stays responsive without starting a payment', async ({ page, request }, testInfo) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })

    for (const variant of ['a', 'b'] as const) {
      await page.goto(`/invoice/variant-${variant}`)
      const expectedCta = variant === 'a' ? 'Pay ₹1' : 'Pay invoice · ₹1'
      const payButton = page.getByRole('button', { name: expectedCta, exact: true })

      await expect(payButton).toBeVisible()
      await expect(page.locator('body')).toContainText(approvedTestContact)
      await payButton.scrollIntoViewIfNeeded()

      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }))
      const buttonBox = await payButton.boundingBox()

      expect(layout.documentWidth, `${viewport.name} variant ${variant.toUpperCase()} page overflow`).toBeLessThanOrEqual(layout.viewportWidth + 2)
      expect(buttonBox, `${viewport.name} variant ${variant.toUpperCase()} CTA has no visible box`).not.toBeNull()
      expect(buttonBox!.y, `${viewport.name} variant ${variant.toUpperCase()} CTA starts above the viewport`).toBeGreaterThanOrEqual(-1)
      expect(buttonBox!.x + buttonBox!.width, `${viewport.name} variant ${variant.toUpperCase()} CTA exceeds viewport`).toBeLessThanOrEqual(viewport.width + 1)
      expect(buttonBox!.y + buttonBox!.height, `${viewport.name} variant ${variant.toUpperCase()} CTA exceeds viewport height`).toBeLessThanOrEqual(viewport.height + 1)

      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-variant-${variant}.png`) })
    }
  }

  const stats = await request.get('http://127.0.0.1:55101/__test__/stats')
  expect(await stats.json()).toMatchObject({ createOrderRequests: 0, assignmentRequests: 8 })
})

test('both checkout variants log a CTA click and safely surface a rejected start without invoking Razorpay', async ({ page, request }) => {
  for (const variant of ['a', 'b'] as const) {
    await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    await page.goto(`/invoice/variant-${variant}`)
    const expectedCta = variant === 'a' ? 'Pay ₹1' : 'Pay invoice · ₹1'
    await page.getByRole('button', { name: expectedCta, exact: true }).click()
    await expect(page.getByText('Order creation is blocked in this UI test.')).toBeVisible()
    await expect.poll(async () => {
      const stats = await request.get('http://127.0.0.1:55101/__test__/stats')
      const body = await stats.json()
      return body.experimentEvents.filter((event: { eventType: string }) => event.eventType === 'CTA_CLICK').length
    }).toBeGreaterThanOrEqual(variant === 'a' ? 1 : 2)
  }

  const stats = await request.get('http://127.0.0.1:55101/__test__/stats')
  const body = await stats.json()
  expect(body.createOrderRequests).toBe(2)
  expect(body.experimentEvents).toEqual(expect.arrayContaining([
    { eventType: 'CTA_CLICK', variant: 'A' },
    { eventType: 'CLIENT_ERROR', variant: 'A' },
    { eventType: 'CTA_CLICK', variant: 'B' },
    { eventType: 'CLIENT_ERROR', variant: 'B' },
  ]))
  expect(await page.evaluate(() => Boolean((window as Window & { Razorpay?: unknown }).Razorpay))).toBe(false)
})

test('experiment assignment outage does not disable invoice payment', async ({ page, request }) => {
  await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  const beforeResponse = await request.get('http://127.0.0.1:55101/__test__/stats')
  const before = await beforeResponse.json()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/invoice/variant-telemetry-down')
  const payButton = page.getByRole('button', { name: 'Pay ₹1', exact: true })
  await expect(payButton).toBeEnabled()
  await payButton.click()
  await expect(page.getByText('Order creation is blocked in this UI test.')).toBeVisible()

  const afterResponse = await request.get('http://127.0.0.1:55101/__test__/stats')
  const after = await afterResponse.json()
  expect(after.createOrderRequests).toBe(before.createOrderRequests + 1)
  expect(after.experimentEvents).toHaveLength(before.experimentEvents.length)
})
