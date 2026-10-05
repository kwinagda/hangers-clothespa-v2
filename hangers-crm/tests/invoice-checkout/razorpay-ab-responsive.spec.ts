import { expect, test, type Page } from '@playwright/test'
import { collapseQueuedWhatsAppEvents } from '../../src/lib/notificationTimeline'

const approvedTestContact = '+91 9930367267'
const invoicePayButtonName = 'Pay online · ₹1'
const checkoutContinueButtonName = 'Continue · ₹1'

const viewports = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

const continueFromInvoiceToPayment = async (page: Page) => {
  await page.getByRole('button', { name: invoicePayButtonName, exact: true }).click()
  await expect(page).toHaveURL(/\/invoice\/[^/]+\/checkout(?:\?|$)/)
  await page.getByRole('button', { name: checkoutContinueButtonName, exact: true }).click()
}

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
      await expect(page.getByText(variant === 'a' ? 'Pay online' : 'Pay this invoice online', { exact: true })).toBeVisible()
      const payButton = page.getByRole('button', { name: invoicePayButtonName, exact: true })

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

test('outstanding summary with one remaining invoice pays only its remaining balance', async ({ page, request }) => {
  await request.post('http://127.0.0.1:55102/__test__/reset-summary-payment?paidInvoice=summary-invoice-55')
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/invoice/customer-summary')
    await expect(page.locator('article')).toHaveCount(1)
    await expect(page.getByText('INV-SUMMARY-55')).toHaveCount(0)
    await page.getByRole('button', { name: 'Pay total outstanding · ₹42', exact: true }).click()
    await expect(page).toHaveURL(/\/invoice\/customer-summary\/checkout\?/)
    await expect(page.getByRole('button', { name: 'Continue · ₹42', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue · ₹97', exact: true })).toHaveCount(0)
  }
  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.createOrderRequests).toBe(before.createOrderRequests)
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
    await page.getByRole('button', { name: 'Continue · ₹97', exact: true }).click()
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
    await continueFromInvoiceToPayment(page)
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
  const payButton = page.getByRole('button', { name: invoicePayButtonName, exact: true })
  await expect(payButton).toBeEnabled()
  await continueFromInvoiceToPayment(page)
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
  await continueFromInvoiceToPayment(page)
  const callbackStatus = page.locator('div[role="status"]').filter({ hasText: 'Check the final status before trying again.' })
  await expect(callbackStatus).toBeVisible()
  await expect(callbackStatus).not.toContainText('Bank said call')
  await expect(callbackStatus).not.toContainText('123456')
  await expect(page.getByText('Payment status under review')).toBeVisible()

  await page.getByRole('button', { name: 'Check Razorpay status' }).click()
  await expect(page.locator('div[role="status"]').filter({ hasText: 'This payment did not complete. You can start a new attempt.' })).toBeVisible()
  await expect(page.getByRole('button', { name: checkoutContinueButtonName, exact: true })).toBeEnabled()
})

test('custom checkout shows one invoice lookup error and never labels it a pending payment', async ({ page, request }) => {
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  let capabilitiesLookups = 0
  let statusLookups = 0
  const corsHeaders = { 'access-control-allow-origin': 'http://localhost:55104', 'access-control-allow-credentials': 'true' }
  await page.route('**/payment/custom/capabilities**', (route) => {
    capabilitiesLookups += 1
    return route.fulfill({ status: 404, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({
      success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found',
    }) })
  })
  await page.route('**/payment/status**', (route) => {
    statusLookups += 1
    return route.fulfill({ status: 404, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({
      success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found',
    }) })
  })
  await page.goto('http://localhost:55104/invoice/variant-a/checkout')
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  await expect.poll(() => capabilitiesLookups).toBe(1)
  await expect.poll(() => statusLookups).toBe(1)
  const unavailable = page.getByText('This invoice link is no longer available. Return to the invoice or contact Hangers.', { exact: true })
  await expect(unavailable).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Payment status under review' })).toHaveCount(0)
  await expect(page.getByLabel('Back to invoice')).toBeVisible()
  await expect(page.getByRole('button', { name: /Retry|Reload payment methods/ })).toHaveCount(0)
  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.createOrderRequests).toBe(before.createOrderRequests)
})

test('active custom checkout renders only returned methods and remains usable at narrow and desktop widths', async ({ page, request }) => {
  const before = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  const origin = 'http://localhost:55104'
  const paymentMethods = {
    upi: true,
    card: true,
    card_networks: { VISA: 1, MC: 1, RUPAY: 1, AMEX: 1, DICL: 0 },
    netbanking: { HDFC: 'HDFC Bank' },
    wallet: { payzapp: true },
    emi: false,
  }
  const corsHeaders = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key',
  }
  const apiRequests: string[] = []
  const providerRequests: string[] = []
  let capabilitiesLookups = 0
  let statusLookups = 0
  page.on('request', (request) => {
    if (request.url().includes('/payment/')) apiRequests.push(`observed ${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.url().includes('/payment/')) apiRequests.push(`response ${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    if (request.url().includes('/payment/')) apiRequests.push(`request failed ${request.url()}: ${request.failure()?.errorText || 'unknown'}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') apiRequests.push(`console error: ${message.text()}`)
  })
  page.on('pageerror', (error) => apiRequests.push(`page error: ${error.message}`))

  await page.route('**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    apiRequests.push(`${request.method()} ${path}`)
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' })
      return
    }
    if (request.method() === 'GET' && path.endsWith('/custom/capabilities')) {
      capabilitiesLookups += 1
      await route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_ui_fixture', mode: 'TEST', methods: paymentMethods,
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [
          { kind: 'network', code: 'VISA', label: 'Visa', url: 'https://cdn.razorpay.com/card-networks/visa.svg' },
          { kind: 'network', code: 'MC', label: 'Mastercard', url: 'https://cdn.razorpay.com/card-networks/mastercard.svg' },
          { kind: 'network', code: 'RUPAY', label: 'RuPay', url: 'https://cdn.razorpay.com/card-networks/rupay.svg' },
          { kind: 'network', code: 'AMEX', label: 'American Express', url: 'https://cdn.razorpay.com/card-networks/amex.svg' },
        ], excludedCardNetworks: ['DICL'] },
      } } })
      apiRequests.push('capabilities fulfilled')
      return
    }
    if (request.method() === 'GET' && path.endsWith('/payment/status')) {
      statusLookups += 1
      await route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'NONE' } } })
      apiRequests.push('status fulfilled')
      return
    }
    if (request.method() === 'GET' && path.endsWith('/custom/downtime')) {
      await route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'unknown', incidents: [] } } })
      apiRequests.push('downtime fulfilled')
      return
    }
    if (request.method() === 'POST' && path.endsWith('/payment/create-order')) {
      const body = request.postDataJSON()
      expect(body.checkoutIntegration).toBe('CUSTOM')
      await route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_ui_fixture', amount: 100, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        checkoutAttemptId: 'ui-custom-attempt', razorpayOrderId: 'order_ui_custom_test', invoiceNumber: 'AB-VISUAL-FIXTURE',
      } } })
      apiRequests.push('order preparation fulfilled')
      return
    }
    await route.fulfill({ status: 204, headers: corsHeaders, body: '' })
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', async (route) => {
    providerRequests.push(route.request().url())
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.Razorpay = class {
        constructor() { this.methods = ${JSON.stringify(paymentMethods)} }
        on() {}
        once(event, callback) { if (event === 'ready') callback({ methods: this.methods }) }
        static setFormatter() { return { add(type) { return { type: type === 'card' ? 'Visa' : '', isValid: () => true, on() { return this } } }, off() {} } }
        getSupportedUpiIntentApps() { return Promise.resolve([]) }
        createPayment() { throw new Error('Payment submission is not part of this UI test') }
      }
    ` })
  })

  for (const width of [320, 720, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 })
    await page.goto('http://localhost:55104/invoice/variant-a/checkout')
    expect(await page.evaluate(() => window.location.hostname)).toBe('localhost')
    await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
    await expect.poll(() => capabilitiesLookups).toBeGreaterThan(0)
    await expect.poll(() => statusLookups).toBeGreaterThan(0)
    await expect(page.getByText('Loading secure payment details...')).toBeHidden()
    await expect(page.locator('form'),
      `Checkout form did not render. API requests: ${apiRequests.join('; ')}; body: ${await page.locator('body').innerText()}`,
    ).toBeVisible()
    await expect(page.getByRole('radio', { name: 'UPI' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Netbanking' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Wallet' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Card EMI' })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Netbanking' }).check()
    await expect(page.locator('input[name="bank"]')).toHaveValue('HDFC')
    await expect(page.getByRole('button', { name: 'Pay ₹1' })).toBeVisible()

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))
    expect(layout.content, `custom checkout at ${width}px must not overflow`).toBeLessThanOrEqual(layout.viewport + 2)
    await page.getByRole('button', { name: 'Payment methods', exact: true }).click()
    await page.getByRole('radio', { name: 'UPI' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('heading', { name: 'Credit or debit card details' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toHaveCount(0)
    await expect(page.getByLabel('Card number')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Visa', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Mastercard', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'RuPay', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'American Express', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Diners Club', exact: true })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Visa', exact: true })).toHaveAttribute('src', 'https://cdn.razorpay.com/card-networks/visa.svg')
    await page.goto('about:blank')
  }

  expect(apiRequests.some((entry) => entry.includes('/custom/capabilities'))).toBe(true)
  expect(apiRequests.some((entry) => entry.includes('/payment/create-order'))).toBe(true)
  expect(apiRequests.some((entry) => entry.includes('/payment/verify'))).toBe(false)
  expect(providerRequests).toEqual(Array(3).fill('https://checkout.razorpay.com/v1/razorpay.js'))
  const stats = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(stats.createOrderRequests).toBe(before.createOrderRequests)
})

test('CRED eligibility retry clears the previous ineligible result without submitting a payment', async ({ page }) => {
  const origin = 'http://localhost:55104'
  const corsHeaders = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key',
  }
  let paymentSubmissions = 0
  await page.route('**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    if (request.method() === 'GET' && path.endsWith('/custom/capabilities')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_cred_retry', mode: 'TEST', methods: { card: true, app: { cred: true } },
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [], excludedCardNetworks: [] },
      } } })
    }
    if (request.method() === 'GET' && path.endsWith('/payment/status')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'NONE' } } })
    }
    if (request.method() === 'GET' && path.endsWith('/custom/downtime')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'unknown', incidents: [] } } })
    }
    if (request.method() === 'POST' && path.endsWith('/payment/create-order')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_cred_retry', mode: 'TEST', amount: 100, currency: 'INR',
        testContact: '+919930367267', credCoinsDisabled: true,
        checkoutAttemptId: 'cred-retry-attempt', razorpayOrderId: 'order_cred_retry',
      } } })
    }
    if (path.endsWith('/payment/verify')) paymentSubmissions += 1
    return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      window.__credEligibility = { success: true, data: { state: 'INELIGIBLE' } }
      window.Razorpay = class {
        constructor() { this.methods = { card: true, app: { cred: true } } }
        once(event, callback) { if (event === 'ready') setTimeout(() => callback({ methods: this.methods }), 0) }
        on() {}
        open() {}
        checkCREDEligibility() { return Promise.resolve(window.__credEligibility) }
        createPayment() { window.__credPaymentSubmitted = true }
        static setFormatter() { return { add: () => ({ on() {}, isValid: () => true }), off() {} } }
      }
    `,
  }))

  await page.goto(`${origin}/invoice/variant-a/checkout`)
  await expect(page.getByRole('radio', { name: 'CRED Pay', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'CRED Pay', exact: true }).check()
  await page.getByRole('button', { name: 'Check CRED eligibility' }).click()
  await expect(page.locator('p[role="alert"]')).toContainText('CRED eligibility is not confirmed')

  await page.evaluate(() => {
    ;(window as Window & { __credEligibility?: unknown }).__credEligibility = { success: true, data: { state: 'ELIGIBLE' } }
  })
  await page.getByRole('button', { name: 'Check CRED eligibility' }).click()
  await expect(page.locator('small[role="status"]').filter({ hasText: 'CRED eligibility confirmed' })).toBeVisible()
  await expect(page.locator('p[role="alert"]')).toHaveCount(0)
  expect(paymentSubmissions).toBe(0)
  expect(await page.evaluate(() => (window as Window & { __credPaymentSubmitted?: boolean }).__credPaymentSubmitted)).not.toBe(true)
})

test('custom checkout keeps methods hidden until SDK readiness and retries after timeout', async ({ page }) => {
  const origin = 'http://localhost:55104'
  const corsHeaders = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key',
  }
  let verifyRequests = 0
  let capabilitiesLookups = 0
  let createOrderRequests = 0
  let sdkScriptRequests = 0
  await page.route('**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    if (request.method() === 'GET' && path.endsWith('/custom/capabilities')) {
      capabilitiesLookups += 1
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_ready_retry', mode: 'TEST', methods: null,
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [], excludedCardNetworks: [] },
      } } })
    }
    if (request.method() === 'GET' && path.endsWith('/payment/status')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'NONE' } } })
    }
    if (request.method() === 'GET' && path.endsWith('/custom/downtime')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'unknown', incidents: [] } } })
    }
    if (request.method() === 'POST' && path.endsWith('/payment/create-order')) {
      createOrderRequests += 1
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_ready_retry', mode: 'TEST', amount: 100, currency: 'INR',
        testContact: '+919930367267', checkoutAttemptId: 'ready-retry-attempt', razorpayOrderId: 'order_ready_retry',
      } } })
    }
    if (path.endsWith('/payment/verify')) verifyRequests += 1
    return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', async (route) => {
    sdkScriptRequests += 1
    if (sdkScriptRequests === 1) return route.abort()
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.__readyRetryInstances = window.__readyRetryInstances || 0
      window.__readyRetryPayments = window.__readyRetryPayments || 0
      window.__readyRetryReadyEvents = window.__readyRetryReadyEvents || 0
      window.Razorpay = class {
        constructor() {
          this.instanceNumber = ++window.__readyRetryInstances
          this.methods = window.__readyRetryReady === true ? { card: true } : {}
        }
        static setFormatter() {
          return { add: () => ({ on() {}, isValid: () => false }), off() {} }
        }
        once(event, callback) {
          if (window.__readyRetryReady === true && event === 'ready') setTimeout(() => {
            window.__readyRetryReadyEvents += 1
            callback({ methods: this.methods })
          }, 0)
        }
        on() {}
        createPayment() { window.__readyRetryPayments += 1 }
      }
    ` })
  })

  await page.goto(`${origin}/invoice/variant-a/checkout`)
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  const checkout = page.getByRole('region', { name: 'Invoice payment' })
  await expect(checkout.getByRole('alert')).toContainText('Payment tools could not load. Check your connection and retry.', { timeout: 8000 })
  await expect(checkout.getByRole('radio')).toHaveCount(0)
  await expect(checkout.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  await expect.poll(() => capabilitiesLookups).toBe(1)

  await page.getByRole('button', { name: 'Retry payment methods' }).click()
  await expect.poll(() => sdkScriptRequests).toBe(2)
  await expect(checkout.getByRole('alert')).toContainText('Razorpay payment methods could not be confirmed. Retry loading payment methods.', { timeout: 8000 })
  await expect(checkout.getByRole('radio')).toHaveCount(0)
  await expect(checkout.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  expect(createOrderRequests).toBe(0)
  expect(verifyRequests).toBe(0)

  const instancesBeforeRetry = await page.evaluate(() => (window as Window & { __readyRetryInstances?: number }).__readyRetryInstances || 0)
  await page.evaluate(() => { (window as Window & { __readyRetryReady?: boolean }).__readyRetryReady = true })
  await page.getByRole('button', { name: 'Retry payment methods' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __readyRetryInstances?: number }).__readyRetryInstances || 0), { timeout: 10000 }).toBeGreaterThan(instancesBeforeRetry)
  await expect.poll(() => page.evaluate(() => (window as Window & { __readyRetryReadyEvents?: number }).__readyRetryReadyEvents || 0), { timeout: 10000 }).toBeGreaterThan(0)
  await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toBeVisible({ timeout: 10000 })
  expect(sdkScriptRequests).toBe(2)
  expect(capabilitiesLookups).toBe(1)
  expect(verifyRequests).toBe(0)
  expect(createOrderRequests).toBe(1)
  expect(await page.evaluate(() => (window as Window & { __readyRetryPayments?: number }).__readyRetryPayments)).toBe(0)
})

test('rapid duplicate custom-checkout submits invoke the SDK payment method once', async ({ page }) => {
  const origin = 'http://localhost:55104'
  const corsHeaders = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key',
  }
  let orderRequests = 0
  let verifyRequests = 0
  await page.route('**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    if (request.method() === 'GET' && path.endsWith('/custom/capabilities')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_duplicate_submit', mode: 'TEST', methods: { netbanking: { HDFC: 'HDFC Bank' } },
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [], excludedCardNetworks: [] },
      } } })
    }
    if (request.method() === 'GET' && path.endsWith('/payment/status')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'NONE' } } })
    }
    if (request.method() === 'GET' && path.endsWith('/custom/downtime')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'unknown', incidents: [] } } })
    }
    if (request.method() === 'POST' && path.endsWith('/payment/create-order')) {
      orderRequests += 1
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_duplicate_submit', amount: 100, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        checkoutAttemptId: 'duplicate-submit-attempt', razorpayOrderId: 'order_duplicate_submit', invoiceNumber: 'AB-DUPLICATE-FIXTURE',
      } } })
    }
    if (path.endsWith('/payment/verify')) verifyRequests += 1
    return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.__duplicateSubmitCalls = 0
      window.Razorpay = class {
        constructor() { this.methods = { netbanking: { HDFC: 'HDFC Bank' } } }
        once(event, callback) { if (event === 'ready') callback({ methods: this.methods }) }
        on() {}
        createPayment() { window.__duplicateSubmitCalls += 1 }
      }
    ` })
  })

  await page.goto(`${origin}/invoice/variant-a/checkout`)
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  await page.getByRole('radio', { name: 'Netbanking' }).click()
  await expect(page.locator('input[name="bank"]')).toHaveValue('HDFC')
  await page.getByRole('button', { name: 'Payment methods', exact: true }).click()
  await page.getByRole('radio', { name: 'Netbanking' }).click()
  await expect(page.locator('input[name="bank"]')).toHaveValue('HDFC')
  await expect(page.getByRole('button', { name: 'Pay ₹1' })).toBeEnabled()
  await page.locator('form').evaluate((form) => {
    const event = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  await expect.poll(() => page.evaluate(() => (window as Window & { __duplicateSubmitCalls?: number }).__duplicateSubmitCalls || 0)).toBe(1)
  expect(orderRequests).toBe(1)
  expect(verifyRequests).toBe(0)
})

test('card validation focuses the invalid control and links its error for assistive technology', async ({ page }) => {
  const origin = 'http://localhost:55104'
  const corsHeaders = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key',
  }
  let verifyRequests = 0
  await page.route('**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    if (request.method() === 'GET' && path.endsWith('/custom/capabilities')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_card_field_error', mode: 'TEST', methods: { card: true, card_networks: { VISA: 1 } },
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [], excludedCardNetworks: [] },
      } } })
    }
    if (request.method() === 'GET' && path.endsWith('/payment/status')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'NONE' } } })
    }
    if (request.method() === 'GET' && path.endsWith('/custom/downtime')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: { status: 'unknown', incidents: [] } } })
    }
    if (request.method() === 'POST' && path.endsWith('/payment/create-order')) {
      return route.fulfill({ status: 200, headers: corsHeaders, json: { success: true, data: {
        key: 'rzp_test_card_field_error', amount: 100, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        checkoutAttemptId: 'card-field-error-attempt', razorpayOrderId: 'order_card_field_error', invoiceNumber: 'AB-CARD-ERROR-FIXTURE',
      } } })
    }
    if (path.endsWith('/payment/verify')) verifyRequests += 1
    return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.Razorpay = class {
        constructor() { this.methods = { card: true, card_networks: { VISA: 1 } } }
        once(event, callback) { if (event === 'ready') callback({ methods: this.methods }) }
        on() {}
        static setFormatter() {
          return {
            add: (_kind, input) => {
              const listeners = new Map()
              input.addEventListener('input', () => listeners.get('change')?.call({ type: 'visa' }))
              return { on: (event, listener) => listeners.set(event, listener), isValid: () => false }
            },
            off() {},
          }
        }
        createPayment() { window.__cardErrorPaymentCalls = (window.__cardErrorPaymentCalls || 0) + 1 }
      }
    ` })
  })

  await page.goto(`${origin}/invoice/variant-a/checkout`)
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  await page.getByRole('radio', { name: 'Credit or debit card' }).click()
  const cardNumber = page.locator('input[name="card-number"]')
  await expect(cardNumber).toBeEnabled()
  await cardNumber.fill('123')
  await page.getByLabel('Name on card').fill('Test Customer')
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await expect(page.getByRole('button', { name: 'Pay ₹1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Pay ₹1' }).click()

  await expect(cardNumber).toBeFocused()
  await expect(cardNumber).toHaveAttribute('aria-invalid', 'true')
  const errorId = await cardNumber.getAttribute('aria-describedby')
  expect(errorId).toBeTruthy()
  await expect(page.locator(`[id="${errorId}"]`)).toContainText('Check the card number, expiry date and security code')
  expect(verifyRequests).toBe(0)
  expect(await page.evaluate(() => (window as Window & { __cardErrorPaymentCalls?: number }).__cardErrorPaymentCalls || 0)).toBe(0)
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
  await continueFromInvoiceToPayment(page)

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
  await expect(page.getByRole('button', { name: invoicePayButtonName, exact: true })).toBeVisible()
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
  await expect(page.getByRole('button', { name: invoicePayButtonName, exact: true })).toBeVisible()
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
  await continueFromInvoiceToPayment(page)
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __checkoutOptions?: unknown }).__checkoutOptions))).toBe(true)
  const options = await page.evaluate(() => (window as Window & { __checkoutOptions?: Record<string, any> }).__checkoutOptions)

  expect(options?.config?.display?.hide).toEqual([{ method: 'upi', flows: ['collect'] }])
  expect(options).not.toHaveProperty('redirect')
  expect(options).toHaveProperty('handler')
})

test('terminal create-order failure shows safe retry guidance and retains the attempt reference', async ({ page, request }) => {
  await page.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.goto('/invoice/variant-terminal-failure')
  await continueFromInvoiceToPayment(page)

  await expect(page.getByRole('status')).toContainText('This payment attempt failed. Start a new attempt to continue.')
  await expect(page.getByRole('button', { name: checkoutContinueButtonName, exact: true })).toBeEnabled()
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

  await expect(page.locator('header').getByText('PAID', { exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText(/Balance Due\s*₹0/)
  const after = await (await request.get('http://127.0.0.1:55102/__test__/stats')).json()
  expect(after.serverSideStatusLookups).toBeGreaterThan(before.serverSideStatusLookups)
  await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)

  await page.goto('http://localhost:55104/invoice/variant-recover-captured/checkout')
  await expect(page.getByRole('heading', { name: 'Invoice paid', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible()
  await page.getByText('Payment references').click()
  await expect(page.locator('b').filter({ hasText: /^order_test_captured$/ })).toBeVisible()
  await expect(page.locator('b').filter({ hasText: /^pay_test_captured$/ })).toBeVisible()
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
    await continueFromInvoiceToPayment(page)

    await expect(page.getByRole('button', { name: 'Payment received', exact: true })).toBeVisible()
    await page.getByText('Back to invoice details', { exact: true }).click()
    await expect(page.locator('header').getByText('PAID', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)
    await expect(page.locator('body')).toContainText(/Balance Due\s*₹0/)

    await page.reload()
    await expect(page.locator('header').getByText('PAID', { exact: true })).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Continue to secure checkout' })).toBeVisible()
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
  await expect(page.getByRole('button', { name: invoicePayButtonName, exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Check Razorpay status' })).toHaveCount(0)
})

test('visibility return keeps Pay blocked until the refreshed provider status is terminal', async ({ page }) => {
  let statusReads = 0
  await page.route('**/payment/status**', async (route) => {
    statusReads += 1
    const data = statusReads === 1
      ? { status: 'PENDING', attemptId: 'attempt_visibility', razorpayOrderId: 'order_visibility', canResumeCheckout: false }
      : { status: 'FAILED', attemptId: 'attempt_visibility', razorpayOrderId: 'order_visibility', canResumeCheckout: true }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    })
  })

  await page.goto('/invoice/variant-recover-pending')
  await expect(page.getByText('Payment status under review')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  await expect.poll(() => statusReads).toBeGreaterThanOrEqual(1)

  await page.waitForTimeout(1600)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('div[role="status"]').filter({ hasText: 'This payment did not complete. You can start a new attempt.' })).toBeVisible()
  await expect(page.getByRole('button', { name: invoicePayButtonName, exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Check Razorpay status' })).toHaveCount(0)
  expect(statusReads).toBeGreaterThanOrEqual(2)
})
