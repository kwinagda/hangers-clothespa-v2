import { expect, test } from '@playwright/test'

const pendingInvoiceUrl = process.env.RAZORPAY_QA_PENDING_INVOICE_URL || ''

test('existing Home dry-cleaning invoice stays locked while payment status is pending', async ({ page }) => {
  let blockedPaymentMutations = 0
  const target = new URL(pendingInvoiceUrl || 'http://localhost:5002/')
  if (target.origin !== 'http://localhost:5002' || !/^\/invoice\/[^/]+$/.test(target.pathname)) {
    throw new Error('Set RAZORPAY_QA_PENDING_INVOICE_URL to the existing localhost:5002 Home invoice URL.')
  }

  await page.route('**/api/v1/public/invoices/**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const endpoint = path.split('/').pop()

    if (request.method() === 'GET' && endpoint === 'status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'PENDING', attemptId: 'local-ui-only', canResumeCheckout: false } }),
      })
      return
    }

    if (request.method() === 'POST' && ['client-events', 'assign', 'events'].includes(endpoint || '')) {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (request.method() === 'POST') {
      blockedPaymentMutations += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: '{"success":false}' })
      return
    }

    await route.continue()
  })

  await page.goto(pendingInvoiceUrl)
  await expect(page.getByRole('heading', { name: 'Invoice', exact: true })).toBeVisible()
  await expect(page.getByText('HCS-1291', { exact: true })).toBeVisible()
  await expect(page.getByText('+91 9930367267', { exact: true })).toBeVisible()
  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Check payment status' })).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByText('Payment status under review')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check payment status' })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Check payment status' }).click()
  await expect(page.getByText('Razorpay is still processing this payment. Check its status before trying again. If it remains unresolved, contact Hangers Clothes Spa; do not pay again.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  expect(blockedPaymentMutations).toBe(0)
})

test('closing Checkout without a browser attempt ID recovers server status instead of offering retry', async ({ page }) => {
  const target = new URL(pendingInvoiceUrl)
  if (target.origin !== 'http://localhost:5002' || !/^\/invoice\/[^/]+$/.test(target.pathname)) {
    throw new Error('Set RAZORPAY_QA_PENDING_INVOICE_URL to the existing localhost:5002 Home invoice URL.')
  }

  await page.addInitScript(() => {
    (window as Window & { Razorpay?: unknown }).Razorpay = class {
      on() {}
      open() { setTimeout(() => this.options.modal?.ondismiss?.(), 0) }
      private options: Record<string, any>
      constructor(options: Record<string, any>) { this.options = options }
    }
  })

  let checkoutCreated = false
  let paymentMutationRequests = 0
  await page.route('**/api/v1/public/invoices/**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const endpoint = path.split('/').pop()

    if (request.method() === 'GET' && endpoint === 'status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: checkoutCreated
          ? { status: 'PENDING', attemptId: 'server-resolved-attempt', canResumeCheckout: false }
          : { status: 'NONE', canResumeCheckout: false } }),
      })
      return
    }

    if (request.method() === 'POST' && endpoint === 'create-order') {
      checkoutCreated = true
      paymentMutationRequests += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        key: 'rzp_test_local_fixture', amount: 10000, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        razorpayOrderId: 'order_local_ui_fixture', invoiceNumber: 'LOCAL-UI-FIXTURE',
      } }) })
      return
    }

    if (request.method() === 'POST' && ['client-events', 'assign', 'events'].includes(endpoint || '')) {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (request.method() === 'POST') {
      paymentMutationRequests += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: '{"success":false}' })
      return
    }
    await route.continue()
  })

  await page.goto(pendingInvoiceUrl)
  await expect(page.getByText('+91 9930367267', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toBeVisible()
  await page.getByRole('button', { name: /^Pay/ }).click()

  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByText('Razorpay is still processing this payment. Check its status before trying again. If it remains unresolved, contact Hangers Clothes Spa; do not pay again.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  expect(paymentMutationRequests).toBe(1)
})
