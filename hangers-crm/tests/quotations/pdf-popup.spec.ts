import { expect, test } from '@playwright/test'

const quotation = {
  id: 'quotation-popup-test',
  orderNumber: 'HCS-QTEST',
  quotationStatus: 'SENT',
  createdAt: '2026-10-06T00:00:00.000Z',
  validUntil: '2026-10-13T00:00:00.000Z',
  totalAmount: 350,
  customer: { name: 'Test Customer', phone: '9999999999' },
  items: [{ id: 'item-1', name: 'Chair Cleaning', quantity: 1, unitPrice: 350, subtotal: 350 }],
}

test.beforeEach(async ({ context }) => {
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let data: Record<string, unknown>

    if (path === '/api/v1/staff/auth/me') data = { staff: { id: 'staff-test', name: 'Test Staff', role: 'SUPER_ADMIN' } }
    else if (path === '/api/v1/metadata') data = { metadata: { quotationStatuses: [{ value: 'SENT', label: 'Sent' }] } }
    else if (path === '/api/v1/staff/me/ui-preferences') data = { primaryNavItems: ['orders', 'daily_iron'] }
    else if (path === '/api/v1/quotations') data = { quotations: [quotation], pagination: { total: 1 } }
    else if (path === `/api/v1/quotations/${quotation.id}`) data = { quotation }
    else if (path === `/api/v1/quotations/${quotation.id}/share`) data = { shareUrl: 'http://localhost:5098/quotation-preview.pdf' }
    else throw new Error(`Unexpected API request: ${path}`)

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  await context.route('**/quotation-preview.pdf', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>PDF viewer reached</h1>' })
  })
})

for (const entry of [
  { path: '/dashboard/quotations', button: 'PDF' },
  { path: `/dashboard/quotations/print?quotationId=${quotation.id}`, button: 'Open PDF' },
]) {
  test(`${entry.path} opens the quotation PDF`, async ({ page }) => {
    await page.goto(entry.path)
    await expect(page.getByText('HCS-QTEST').first()).toBeVisible()

    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: entry.button, exact: true }).click()
    const popup = await popupPromise

    await expect(popup).toHaveURL('http://localhost:5098/quotation-preview.pdf')
    await expect(popup.getByText('PDF viewer reached')).toBeVisible()
    expect(await popup.evaluate(() => window.opener)).toBeNull()
    await expect(page.getByText('Popup blocked. Allow popups to open the quotation PDF.')).toHaveCount(0)
  })
}
