import { expect, test } from '@playwright/test'
import { collapseQueuedWhatsAppEvents } from '../../src/lib/notificationTimeline'

const approvedTestContact = '+91 9930367267'

const viewports = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

test('WhatsApp timelines replace resolved queue rows with the provider outcome and keep unresolved rows queued', () => {
  const queued = {
    id: 'queued-1', stage: 'WHATSAPP_PENDING', eventType: 'NOTIFICATION', createdAt: '2026-09-26T02:27:00.000Z',
    metadata: { outboxEventId: 'outbox-1', outboxEventType: 'PAYMENT_RECEIVED', payload: { paymentId: 'pay_test_1' } },
  }
  const sent = {
    id: 'sent-1', stage: 'WHATSAPP_SENT', eventType: 'NOTIFICATION', createdAt: '2026-09-26T02:29:00.000Z',
    metadata: { outboxEventId: 'outbox-1', outboxEventType: 'PAYMENT_RECEIVED', payload: { paymentId: 'pay_test_1' } },
  }
  const resolved = collapseQueuedWhatsAppEvents([queued, sent])
  expect(resolved).toHaveLength(1)
  expect(resolved[0]).toMatchObject({ id: 'sent-1', stage: 'WHATSAPP_SENT', notificationQueuedAt: queued.createdAt })
  expect(collapseQueuedWhatsAppEvents([queued])).toEqual([queued])

  const historicQueued = { ...queued, id: 'historic-queued', metadata: { ...queued.metadata, outboxEventId: undefined } }
  const historicSent = { ...sent, id: 'historic-sent', metadata: { ...sent.metadata, outboxEventId: undefined } }
  expect(collapseQueuedWhatsAppEvents([historicQueued, historicSent])).toMatchObject([
    { id: 'historic-sent', notificationQueuedAt: historicQueued.createdAt },
  ])

  const legacySent = { ...sent, id: 'legacy-sent', metadata: { ...sent.metadata, outboxEventId: undefined } }
  const corrected = collapseQueuedWhatsAppEvents([queued, legacySent])
  expect(corrected).toHaveLength(1)
  expect(corrected[0]).toMatchObject({ id: 'legacy-sent', stage: 'WHATSAPP_SENT', notificationQueuedAt: queued.createdAt })

  const differentOutbox = { ...sent, id: 'different-outbox', metadata: { ...sent.metadata, outboxEventId: 'outbox-2' } }
  expect(collapseQueuedWhatsAppEvents([queued, differentOutbox])).toHaveLength(2)
})

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

  const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
  expect(await stats.json()).toMatchObject({ createOrderRequests: 0, assignmentRequests: 8 })
})

test('customer outstanding summary offers one total Pay action at phone, tablet, and desktop widths', async ({ page, request }) => {
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  const viewportsToCheck = [320, 390, 768, 1440]
  for (const width of viewportsToCheck) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/invoice/customer-summary')
    await expect(page.getByRole('heading', { name: 'Outstanding Summary' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay total outstanding · ₹97', exact: true })).toHaveCount(1)
    await expect(page.locator('.summary-receivable-pay button')).toHaveCount(0)
    await expect(page.getByText('Home QA')).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))
    expect(dimensions.content, `summary width ${width} must not overflow`).toBeLessThanOrEqual(dimensions.viewport + 2)
  }

  await expect.poll(async () => {
    const response = await request.get('http://127.0.0.1:55102/__test__/stats')
    const stats = await response.json()
    return new Set(stats.summaryStatusInvoiceIds).size
  }).toBe(1)
  const stats = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(stats.summaryStatusInvoiceIds).toEqual(expect.arrayContaining(['summary-invoice-42']))
  expect(stats.summaryAssignmentInvoiceIds).toEqual(expect.arrayContaining(['summary-invoice-42']))
  expect(stats.createOrderRequests).toBe(before.createOrderRequests)
})

test('captured combined summary payment clears both receivables after refresh and reload', async ({ page, request }) => {
  await page.addInitScript(() => {
    const checkoutWindow = window as Window & { Razorpay?: new (options: Record<string, any>) => { open: () => void; on: () => void } }
    checkoutWindow.Razorpay = class {
      private options: Record<string, any>
      constructor(options: Record<string, any>) { this.options = options }
      on() {}
      open() {
        setTimeout(() => this.options.handler?.({
          razorpay_order_id: 'order_summary_ui_test',
          razorpay_payment_id: 'pay_summary_ui_captured',
          razorpay_signature: 'summary-ui-test-signature',
        }), 0)
      }
    }
  })

  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  for (const width of [320, 390, 768, 1440]) {
    await request.post('http://127.0.0.1:55102/__test__/reset-summary-payment')
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/invoice/customer-summary')
    await expect(page.getByRole('button', { name: 'Pay total outstanding · ₹97', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Pay total outstanding · ₹97', exact: true }).click()

    await expect(page).toHaveURL(/\/invoice\/customer-summary\/checkout\?/)
    await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
    await page.getByRole('button', { name: /^Pay/ }).click()
    await expect(page.getByRole('heading', { name: /^(Payment received|No balance due)$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
    await page.goto('/invoice/customer-summary')

    await expect(page.locator('article')).toHaveCount(0)
    await expect(page.getByText('0 open bills/orders')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
    await expect(page.locator('.summary-meta-card').filter({ hasText: 'Balance Due' })).toContainText('₹0')
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(dimensions.content, `captured summary width ${width} must not overflow`).toBeLessThanOrEqual(dimensions.viewport + 2)

    await page.reload()
    await expect(page.locator('article')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  }

  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.createOrderRequests).toBe(before.createOrderRequests + 4)
  expect(after.summaryCreatedInvoiceIds).toEqual(['summary-invoice-42'])
  expect(after.summaryVerifiedInvoiceIds).toEqual(['summary-invoice-42'])
})

test('both checkout variants log a CTA click and safely surface a rejected start without invoking Razorpay', async ({ page, request }) => {
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  for (const [index, variant] of (['a', 'b'] as const).map((variant, index) => [index, variant] as const)) {
    await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    await page.goto(`/invoice/variant-${variant}`)
    const expectedCta = variant === 'a' ? 'Pay ₹1' : 'Pay invoice · ₹1'
    await page.getByRole('button', { name: expectedCta, exact: true }).click()
    await expect(page.getByText('Order creation is blocked in this UI test.')).toBeVisible()
    await expect.poll(async () => {
      const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
      const body = await stats.json()
      return body.experimentEvents.filter((event: { eventType: string }) => event.eventType === 'CTA_CLICK').length
    }).toBe(before.experimentEvents.filter((event: { eventType: string }) => event.eventType === 'CTA_CLICK').length + index + 1)
  }

  await expect.poll(async () => {
    const current = await request.get('http://127.0.0.1:55102/__test__/stats')
    const currentBody = await current.json()
    return currentBody.experimentEvents.slice(before.experimentEvents.length).length
  }).toBe(4)
  await expect.poll(async () => {
    const current = await request.get('http://127.0.0.1:55102/__test__/stats')
    const currentBody = await current.json()
    return currentBody.clientEvents.slice(before.clientEvents.length).filter((event: { eventType: string }) => event.eventType === 'CLIENT_ERROR').length
  }).toBe(2)
  const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
  const body = await stats.json()
  expect(body.createOrderRequests).toBe(before.createOrderRequests + 2)
  const newExperimentEvents = body.experimentEvents.slice(before.experimentEvents.length)
  expect(newExperimentEvents).toEqual(expect.arrayContaining([
    { eventType: 'CTA_CLICK', variant: 'A' },
    { eventType: 'CLIENT_ERROR', variant: 'A' },
    { eventType: 'CTA_CLICK', variant: 'B' },
    { eventType: 'CLIENT_ERROR', variant: 'B' },
  ]))
  await expect.poll(async () => {
    const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
    return (await stats.json()).clientEvents.filter((event: { eventType: string }) => event.eventType === 'PAY_BUTTON_CLICKED').length
  }).toBe(before.clientEvents.filter((event: { eventType: string }) => event.eventType === 'PAY_BUTTON_CLICKED').length + 2)
  const finalStats = await request.get('http://127.0.0.1:55102/__test__/stats')
  const clientEvents = (await finalStats.json()).clientEvents.slice(before.clientEvents.length)
  expect(clientEvents.every((event: { hasClientEventId: boolean }) => event.hasClientEventId)).toBe(true)
  expect(clientEvents.some((event: { eventType: string }) => event.eventType === 'CREATE_ORDER_REQUESTED')).toBe(true)
  expect(clientEvents.some((event: { eventType: string }) => event.eventType === 'CREATE_ORDER_FAILED')).toBe(true)
  expect(await page.evaluate(() => Boolean((window as Window & { Razorpay?: unknown }).Razorpay))).toBe(false)
})

test('experiment assignment outage does not disable invoice payment', async ({ page, request }) => {
  await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  const beforeResponse = await request.get('http://127.0.0.1:55102/__test__/stats')
  const before = await beforeResponse.json()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/invoice/variant-telemetry-down')
  const payButton = page.getByRole('button', { name: 'Pay ₹1', exact: true })
  await expect(payButton).toBeEnabled()
  await payButton.click()
  await expect(page.getByText('Order creation is blocked in this UI test.')).toBeVisible()

  const afterResponse = await request.get('http://127.0.0.1:55102/__test__/stats')
  const after = await afterResponse.json()
  expect(after.createOrderRequests).toBe(before.createOrderRequests + 1)
  expect(after.experimentEvents).toHaveLength(before.experimentEvents.length)
})

test('untrusted payment.failed description is hidden and status is checked before retry', async ({ page }) => {
  const sensitiveDescription = 'Bank said call +91 9930367267 with OTP 123456 and card 4100280000001007'
  await page.addInitScript(({ sensitiveDescription: description }) => {
    (window as Window & { Razorpay?: unknown }).Razorpay = class {
      private handlers = new Map<string, (payload: unknown) => void>()
      constructor(_options: Record<string, unknown>) {}
      on(event: string, handler: (payload: unknown) => void) { this.handlers.set(event, handler) }
      open() { setTimeout(() => this.handlers.get('payment.failed')?.({ error: { description } }), 0) }
    }
  }, { sensitiveDescription })

  await page.goto('/invoice/variant-callback-failure')
  await page.getByRole('button', { name: 'Pay ₹1', exact: true }).click()
  const callbackStatus = page.locator('div[role="status"]').filter({ hasText: 'Check the final status before trying again.' })
  await expect(callbackStatus).toBeVisible()
  await expect(callbackStatus).not.toContainText('Bank said call')
  await expect(callbackStatus).not.toContainText('123456')
  await expect(page.getByText('Payment status under review')).toBeVisible()

  await page.getByRole('button', { name: 'Check Razorpay status' }).click()
  await expect(page.locator('div[role="status"]').filter({ hasText: 'This payment did not complete. You can start a new attempt.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay ₹1', exact: true })).toBeEnabled()
})

test('closing Checkout immediately checks the attempt and keeps a nonterminal payment locked', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { Razorpay?: unknown }).Razorpay = class {
      private options: Record<string, any>
      constructor(options: Record<string, any>) { this.options = options }
      on() {}
      open() { setTimeout(() => this.options.modal?.ondismiss?.(), 0) }
    }
  })

  await page.goto('/invoice/variant-modal-dismiss')
  await page.getByRole('button', { name: 'Pay ₹1', exact: true }).click()

  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.locator('div[role="status"]').filter({ hasText: 'Razorpay is still processing this payment.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
})

test('customer can choose the documented redirect callback fallback without replacing standard handler checkout', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { Razorpay?: unknown; __checkoutOptions?: Record<string, unknown> }).Razorpay = class {
      constructor(options: Record<string, unknown>) {
        (window as Window & { __checkoutOptions?: Record<string, unknown> }).__checkoutOptions = options
      }
      on() {}
      open() {}
    }
  })
  await page.goto('/invoice/variant-callback-failure')
  await expect(page.getByRole('button', { name: 'Pay ₹1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Checkout not opening? Use redirect checkout' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __checkoutOptions?: unknown }).__checkoutOptions))).toBe(true)
  const options = await page.evaluate(() => (window as Window & { __checkoutOptions?: Record<string, unknown> }).__checkoutOptions)
  expect(options).toMatchObject({
    callback_url: 'http://localhost:5001/api/v1/public/invoices/variant-callback-failure/payment/callback?invoiceId=ui-test-invoice',
    redirect: true,
    order_id: 'order_ui_test',
    config: { display: { hide: [{ method: 'upi', flows: ['collect'] }] } },
  })
  expect(options).not.toHaveProperty('handler')
})

test('redirect fallback is hidden unless the API confirms its callback route is configured', async ({ page }) => {
  await page.route('**/payment/status**', async (route) => {
    await route.fulfill({ json: { success: true, data: { status: 'NONE', redirectCheckoutAvailable: false } } })
  })
  await page.goto('/invoice/variant-redirect-disabled')
  await expect(page.getByRole('button', { name: 'Pay ₹1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Checkout not opening? Use redirect checkout' })).toHaveCount(0)
})

test('Standard Checkout hides the deprecated UPI Collect flow without hiding other UPI options', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { Razorpay?: unknown; __checkoutOptions?: Record<string, any> }).Razorpay = class {
      constructor(options: Record<string, any>) {
        (window as Window & { __checkoutOptions?: Record<string, any> }).__checkoutOptions = options
      }
      on() {}
      open() {}
    }
  })

  await page.goto('/invoice/variant-callback-failure')
  await page.getByRole('button', { name: 'Pay ₹1', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __checkoutOptions?: unknown }).__checkoutOptions))).toBe(true)
  const options = await page.evaluate(() => (window as Window & { __checkoutOptions?: Record<string, any> }).__checkoutOptions)

  expect(options?.config?.display?.hide).toEqual([{ method: 'upi', flows: ['collect'] }])
  expect(options).not.toHaveProperty('redirect')
  expect(options).toHaveProperty('handler')
})

test('terminal create-order failure shows safe retry guidance and retains the attempt reference', async ({ page, request }) => {
  await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.goto('/invoice/variant-terminal-failure')
  await page.getByRole('button', { name: 'Pay ₹1', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('This payment attempt failed. Start a new attempt to continue.')
  await expect(page.getByRole('button', { name: 'Pay ₹1', exact: true })).toBeEnabled()
  await expect.poll(async () => {
    const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
    const body = await stats.json()
    return body.clientEvents.some((event: { eventType: string; hasAttemptId: boolean }) => event.eventType === 'CREATE_ORDER_FAILED' && event.hasAttemptId)
  }).toBe(true)
  await expect.poll(async () => {
    const stats = await request.get('http://127.0.0.1:55102/__test__/stats')
    return (await stats.json()).createOrderRequests
  }).toBeGreaterThan(0)
  await expect(page.getByRole('status')).not.toContainText('9930367267')
  await expect(page.getByRole('status')).not.toContainText('Razorpay may have collected')
  await expect(page.evaluate(() => Boolean((window as Window & { Razorpay?: unknown }).Razorpay))).resolves.toBe(false)
})

test('a reopened invoice discovers and records a captured payment without browser session state', async ({ page, request }) => {
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  await page.goto('/invoice/variant-recover-captured')

  await expect(page.getByText('PAID', { exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText(/Balance Due\s*₹0/)
  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.serverSideStatusLookups).toBeGreaterThan(before.serverSideStatusLookups)
  await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)
})

test('Standard Checkout capture refreshes the invoice and never reopens Pay after reload', async ({ page, request }) => {
  await page.addInitScript(() => {
    (window as Window & { Razorpay?: unknown }).Razorpay = class {
      private options: Record<string, unknown>
      private handlers = new Map<string, (payload: unknown) => void>()

      constructor(options: Record<string, unknown>) { this.options = options }
      on(event: string, handler: (payload: unknown) => void) { this.handlers.set(event, handler) }
      open() {
        const handler = this.options.handler as ((payload: unknown) => void) | undefined
        void handler?.({
          razorpay_order_id: 'order_ui_test',
          razorpay_payment_id: 'pay_ui_test_captured',
          razorpay_signature: 'ui-test-signature',
        })
      }
    }
  })

  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  for (const viewport of viewports) {
    await request.post('http://127.0.0.1:55102/__test__/reset-standard-success')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/invoice/variant-standard-success')
    await page.getByRole('button', { name: 'Pay ₹1', exact: true }).click()

    await expect(page.getByText('PAID', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)
    await expect(page.locator('body')).toContainText(/Balance Due\s*₹0/)

    await page.reload()
    await expect(page.getByText('PAID', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))
    expect(dimensions.content, `${viewport.name} paid invoice must not overflow`).toBeLessThanOrEqual(dimensions.viewport + 2)
  }

  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.createOrderRequests - before.createOrderRequests).toBe(viewports.length)
  expect(after.serverSideStatusLookups).toBeGreaterThan(before.serverSideStatusLookups)
})

test('a reopened invoice with an unresolved provider attempt blocks a duplicate checkout', async ({ page }) => {
  await page.goto('/invoice/variant-recover-pending')

  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.locator('div[role="status"]').filter({ hasText: 'Razorpay is still processing this payment.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check Razorpay status' })).toBeVisible()
})

test('manual reconciliation resumes only the same provider-confirmed unattempted order', async ({ page }) => {
  let statusReads = 0
  let reconciliationCalls = 0
  await page.route('**/payment/status**', async (route) => {
    statusReads += 1
    const data = statusReads <= 2
      ? { status: 'REVIEW', attemptId: 'attempt_review', razorpayOrderId: 'order_review' }
      : { status: 'CREATED', attemptId: 'attempt_review', razorpayOrderId: 'order_review', canResumeCheckout: true }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  await page.route('**/payment/reconcile', async (route) => {
    reconciliationCalls += 1
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toMatchObject({ attemptId: 'attempt_review' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'CREATED', attemptId: 'attempt_review', razorpayOrderId: 'order_review', canResumeCheckout: true } }) })
  })

  await page.goto('/invoice/variant-recover-pending')
  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByText('Razorpay order reference: order_review')).toBeVisible()
  await page.getByRole('button', { name: 'Check Razorpay status' }).click()
  await expect(page.getByRole('button', { name: 'Resume secure checkout' })).toBeVisible()
  expect(reconciliationCalls).toBe(1)
})

test('initial status recovery never flashes Pay while an existing attempt is unresolved', async ({ page }) => {
  let releaseResponse!: () => void
  let signalRequest!: () => void
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })
  const statusRequested = new Promise<void>((resolve) => { signalRequest = resolve })

  await page.route('**/payment/status**', async (route) => {
    signalRequest()
    await responseGate
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { status: 'PENDING', attemptId: 'attempt_ui_pending' } }),
    })
  })

  await page.goto('/invoice/variant-recover-pending')
  await statusRequested
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Checking payment status…' })).toBeVisible()

  releaseResponse()
  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
})

test('page-return recovery releases the checkout after Razorpay confirms the payment failed', async ({ page }) => {
  await page.goto('/invoice/variant-recover-failed')

  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check Razorpay status' })).toBeVisible()

  await page.waitForTimeout(1600)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(page.locator('div[role="status"]').filter({ hasText: 'This payment did not complete. You can start a new attempt.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay ₹1', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Check Razorpay status' })).toHaveCount(0)
})
