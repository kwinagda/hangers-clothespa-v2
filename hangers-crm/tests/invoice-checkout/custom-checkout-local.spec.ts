import { expect, test } from '@playwright/test'

const invoiceUrl = process.env.RAZORPAY_CUSTOM_CHECKOUT_QA_URL || ''
const invoiceId = process.env.RAZORPAY_CUSTOM_CHECKOUT_QA_INVOICE_ID || ''
const orderNumber = process.env.RAZORPAY_CUSTOM_CHECKOUT_QA_ORDER_NUMBER || ''

// All SDK/API responses below are contract mocks, not merchant activation or payment evidence.
const installCustomCheckoutMock = async (page: import('@playwright/test').Page, mobile = true, ready = true, emiShape: 'options' | 'plans' = 'options') => {
  const methods = {
    card: true,
    card_networks: { VISA: 1, AMEX: 1, DICL: 0, MC: 1 },
    upi: true,
    upi_intent: true,
    emi: true,
    emi_subvention: 'customer',
    netbanking: { HDFC: 'HDFC Bank', SBIN: 'State Bank of India' },
    wallet: { payzapp: true },
    ...(emiShape === 'options' ? {
      emi_options: {
        HDFC: [
          { duration: 3, interest: 12, subvention: 'customer', min_amount: 10000 },
          { duration: 6, interest: 12, subvention: 'customer', min_amount: 10000 },
        ],
        AMEX: [
          { duration: 3, interest: 15, subvention: 'customer', min_amount: 10000 },
          { duration: 6, interest: 15, subvention: 'customer', min_amount: 10000 },
        ],
      },
    } : {
      emi_plans: { HDFC: { min_amount: 10000, plans: { 3: 12, 6: 12 } } },
    }),
    cardless_emi: { hdfc: true, zestmoney: true },
    paylater: { lazypay: true },
  }
  await page.addInitScript(({ ready, methods }) => {
    const testWindow = window as Window & { __customCheckoutNoReady?: boolean; __customCheckoutMethods?: Record<string, any> }
    testWindow.__customCheckoutNoReady = !ready
    testWindow.__customCheckoutMethods = methods
  }, { ready, methods })
  if (mobile) await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36' })
  })
}

const mockInvoicePaymentApi = async (page: import('@playwright/test').Page, verifiedPayloads: any[]) => {
  let captured = false
  await page.route('**/api/v1/public/invoices/**/payment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const endpoint = path.split('/').pop()
    if (request.method() === 'GET' && endpoint === 'capabilities') {
      const methods = await page.evaluate(() => (window as any).__customCheckoutMethods)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        key: 'rzp_test_local_custom', mode: 'TEST', methods,
        configuration: { feeBearer: 'MERCHANT', savedCards: false, bankTransfer: false, artwork: [], excludedCardNetworks: ['DICL'] },
      } }) })
      return
    }
    if (request.method() === 'POST' && endpoint === 'card-eligibility') {
      const { iin } = request.postDataJSON()
      expect(iin).toMatch(/^\d{6,8}$/)
      // Explicit scenario data; these IIN-to-issuer mappings are not real-account observations.
      const eligibility = await page.evaluate(() => (window as any).__customCardEligibility || {
        network: 'Visa', type: 'credit', issuerCode: 'HDFC', issuerName: 'HDFC Bank', emiAvailable: true,
      })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        ...eligibility, observedAt: new Date().toISOString(),
      } }) })
      return
    }
    if (request.method() === 'GET' && endpoint === 'downtime') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'unknown', incidents: [] } }) })
      return
    }
    if (request.method() === 'GET' && endpoint === 'status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: captured
        ? { status: 'CAPTURED', razorpayOrderId: 'order_custom_local_test', razorpayPaymentId: 'pay_custom_local_test', capturedAmountPaise: 18000, currency: 'INR' }
        : { status: 'NONE' } }) })
      return
    }
    if (request.method() === 'POST' && endpoint === 'create-order') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        key: 'rzp_test_local_custom', amount: 18000, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        razorpayOrderId: 'order_custom_local_test', invoiceNumber: 'INV-001643', checkoutAttemptId: 'attempt_custom_local_test',
        callbackUrl: 'http://localhost:5002/api/v1/public/invoices/local-test/payment/callback?invoiceId=invoice_test',
        redirect: await page.evaluate(() => (window as any).__customRedirect === true),
      } }) })
      return
    }
    if (request.method() === 'POST' && endpoint === 'verify') {
      verifiedPayloads.push(request.postDataJSON())
      captured = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'CAPTURED' } }) })
      return
    }
    if (request.method() === 'POST') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.continue()
  })
  await page.route('https://checkout.razorpay.com/v1/razorpay.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      (() => {
        const paymentHandlers = new Map();
        window.__emitCustomSuccess = () => {
          const handler = paymentHandlers.get('payment.success');
          if (!handler) return false;
          handler({
            razorpay_order_id: 'order_custom_local_test',
            razorpay_payment_id: 'pay_custom_local_test',
            razorpay_signature: 'local-test-signature'
          });
          return true;
        };
        window.Razorpay = class {
          static emi = {
            calculator(principal, months, rate) {
              const monthlyRate = rate / 1200;
              return monthlyRate === 0 ? principal / months
                : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
            }
          };
          static setFormatter() {
            const bindings = [];
            return {
              add(type, el) {
                const field = {
                  type: window.__customFormatterNetwork || 'visa',
                  isValid() { return window.__customCardValid !== false; },
                  on(event, callback) {
                    const listener = () => callback.call(field);
                    el.addEventListener('input', listener);
                    bindings.push(() => el.removeEventListener('input', listener));
                    return field;
                  }
                };
                return field;
              },
              off() { bindings.forEach((unbind) => unbind()); }
            };
          }
          constructor(options) { window.__customCheckoutOptions = options; this.methods = window.__customCheckoutNoReady ? {} : window.__customCheckoutMethods || {}; }
          open() {}
          focus() { window.__customPaymentFocused = true; }
          once(event, handler) {
            if (event === 'ready' && !window.__customCheckoutNoReady) setTimeout(() => handler({ methods: this.methods }), 0);
          }
          on(event, handler) { paymentHandlers.set(event, handler); }
          getSupportedUpiIntentApps() { return Promise.resolve(['gpay', 'phonepe', 'any']); }
          createPayment(data, options) {
            window.__customPayment = { data, options };
            if (window.__customSubmissionError) throw window.__customSubmissionError;
          }
        };
      })();
    `,
  }))
}

const openLocalTestCheckout = async (page: import('@playwright/test').Page) => {
  if (!invoiceUrl) throw new Error('Set RAZORPAY_CUSTOM_CHECKOUT_QA_URL to an existing Home invoice on localhost:5002.')
  const url = new URL(invoiceUrl)
  if (url.origin !== 'http://localhost:5002' || !/^\/invoice\/[^/]+$/.test(url.pathname)) {
    throw new Error('Custom Checkout QA must use an existing invoice URL on localhost:5002.')
  }
  await page.goto(invoiceUrl)
  await expect(page.getByRole('heading', { name: 'Invoice', exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText('+91 9930367267')
}

const beginLocalCustomCheckout = async (page: import('@playwright/test').Page, collectEmail = true) => {
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page).toHaveURL(/\/checkout(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Invoice payment' })).toBeVisible()
  if (collectEmail) {
    const email = page.getByRole('textbox', { name: 'Email address', exact: true })
    await expect(email).toBeVisible()
    await email.fill('kevinnagda@gmail.com')
  }
}

test('invoice lookup failure is shown once and is not mislabeled as a pending payment', async ({ page }) => {
  await openLocalTestCheckout(page)
  await page.route('**/api/v1/public/invoices/**/payment/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Invoice not found' }) })
      return
    }
    await route.continue()
  })

  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page).toHaveURL(/\/checkout(?:\?|$)/)
  await expect(page.getByText('Invoice not found', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Payment status under review' })).toHaveCount(0)
})

test('local Test Mode UPI selection submits the selected Razorpay intent app and verifies server-side', async ({ page }) => {
  await installCustomCheckoutMock(page)
  const verifiedPayloads: any[] = []
  await mockInvoicePaymentApi(page, verifiedPayloads)
  await openLocalTestCheckout(page)

  await beginLocalCustomCheckout(page)
  await expect(page.locator('form').getByText('Invoice').filter({ hasText: orderNumber })).toBeVisible()
  await expect(page.locator('form').getByText('Order').filter({ hasText: orderNumber })).toBeVisible()
  await page.getByRole('radio', { name: 'UPI', exact: true }).check()
  await page.getByRole('group', { name: 'UPI apps' }).getByRole('button', { name: 'phonepe', exact: true }).click()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  expect(await page.evaluate(() => (window as Window & { __emitCustomSuccess?: () => boolean }).__emitCustomSuccess?.())).toBe(true)

  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment).toMatchObject({ data: { method: 'upi', order_id: 'order_custom_local_test' }, options: { app: 'phonepe' } })
  expect(verifiedPayloads).toEqual([{
    razorpayOrderId: 'order_custom_local_test', razorpayPaymentId: 'pay_custom_local_test',
    razorpaySignature: 'local-test-signature', invoiceId,
  }])
})

test('custom SDK replaces a pre-existing Standard Checkout global and retains its formatter', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => {
    (window as unknown as { Razorpay: unknown }).Razorpay = class {
      constructor() { throw new Error('Standard Checkout must not initialize Custom Checkout') }
    }
  })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry loading payment methods' })).toHaveCount(0)
  await expect(page.locator('script[data-razorpay-custom-checkout]')).toHaveCount(1)
})

test('SDK submission preserves the documented mocked provider description', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.evaluate(() => {
    (window as unknown as { __customSubmissionError: unknown }).__customSubmissionError = {
      error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed due to incorrect otp', source: 'customer', step: 'payment_authentication', reason: 'invalid_otp' },
    }
  })
  await page.getByRole('radio', { name: 'Netbanking' }).check()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  await expect(page.getByText('Authentication failed due to incorrect otp', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check payment status', exact: true }).first()).toBeVisible()
})

test('local custom checkout submits Razorpay-enabled netbanking options', async ({ page }) => {
  await installCustomCheckoutMock(page)
  const verifiedPayloads: any[] = []
  await mockInvoicePaymentApi(page, verifiedPayloads)
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Netbanking' }).check()
  await expect(page.getByLabel('Select bank').locator('option[value="SBIN"]')).toHaveText('State Bank of India')
  await page.getByLabel('Select bank').selectOption('SBIN')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'netbanking', bank: 'SBIN', email: 'kevinnagda@gmail.com' })
  expect(verifiedPayloads).toHaveLength(0)
})

test('missing payer email blocks SDK submission without inventing an address', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Netbanking' }).check()
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  expect(await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)).toBeUndefined()
  const email = page.getByRole('textbox', { name: 'Email address', exact: true })
  await expect(email).toHaveValue('')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription(/.+/)
  await expect(email).toBeFocused()
})

test('redirect recovery passes the server callback URL to Custom Checkout without changing the order reference', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => { (window as any).__customRedirect = true })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await expect.poll(() => page.evaluate(() => (window as any).__customCheckoutOptions?.redirect)).toBe(true)
  await page.getByRole('radio', { name: 'Netbanking' }).check()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const result = await page.evaluate(() => ({ options: (window as any).__customCheckoutOptions, payment: (window as any).__customPayment }))
  expect(result.options).toMatchObject({ redirect: true, callback_url: 'http://localhost:5002/api/v1/public/invoices/local-test/payment/callback?invoiceId=invoice_test' })
  expect(result.payment.data).toMatchObject({ method: 'netbanking', order_id: 'order_custom_local_test', callback_url: result.options.callback_url })
})

for (const status of ['CAPTURED', 'PENDING']) {
test(`closed bank flow can check ${status} status without creating another payment`, async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  let createdOrders = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/payment/create-order')) createdOrders += 1
  })
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Netbanking' }).check()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  await expect(page.getByRole('button', { name: 'Confirming payment...' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Wallet' })).toBeDisabled()
  await page.getByRole('button', { name: 'Return to payment' }).click()
  expect(await page.evaluate(() => (window as any).__customPaymentFocused)).toBe(true)
  await page.route('**/payment/status*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
      status, razorpayOrderId: 'order_custom_local_test', razorpayPaymentId: 'pay_custom_local_test',
    } }),
  }))
  // Recovery intentionally coalesces status checks within a 1.5-second window.
  await page.waitForTimeout(1600)
  const statusResponse = page.waitForResponse((response) => response.url().includes('/payment/status') && response.request().method() === 'GET')
  await page.getByRole('button', { name: 'Check payment status', exact: true }).first().click()
  await statusResponse
  if (status === 'CAPTURED') {
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible()
  } else {
    await expect(page.getByRole('button', { name: 'Confirming payment...' })).toBeDisabled()
    await expect(page.getByRole('radio', { name: 'Wallet' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Check payment status', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Pay|Show QR for) / })).toHaveCount(0)
  }
  await expect(page.getByRole('heading', { name: 'Pay Hangers Clothes Spa' })).toHaveCount(0)
  expect(createdOrders).toBe(1)
})
}

test('local custom checkout submits a Razorpay-enabled wallet', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Wallet' }).check()
  await page.getByLabel('Select wallet').selectOption('payzapp')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'wallet', wallet: 'payzapp' })
})

test('disabled numeric and null provider flags are excluded from checkout options', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => {
    const methods = (window as any).__customCheckoutMethods
    methods.wallet = { payzapp: true, phonepe: 0, amazonpay: '0', disabled: null }
    methods.cardless_emi = { hdfc: 0, zestmoney: false }
    methods.paylater = { lazypay: 0 }
    methods.emi = 0
  })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Wallet' }).check()
  await expect(page.getByLabel('Select wallet').locator('option')).toHaveText(['payzapp'])
  await expect(page.getByRole('radio', { name: 'Cardless EMI', exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Card EMI', exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Pay later', exact: true })).toHaveCount(0)
})

test('local custom checkout submits an available card EMI plan', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Card EMI' }).check()
  await page.getByLabel('Card number').fill('4100 2800 0000 1007')
  const eligibilityRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/custom/card-eligibility'))
  await page.getByRole('button', { name: 'Check EMI eligibility' }).click()
  expect((await eligibilityRequest).postDataJSON()).toMatchObject({ iin: '41002800' })
  await expect(page.getByLabel('EMI duration').locator('option')).toHaveText(['3 months', '6 months'])
  await page.getByLabel('EMI duration').selectOption('3')
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'emi', emi_duration: 3, 'card[number]': '4100280000001007' })
})

test('explicitly disabled EMI is hidden even when Razorpay returns plan data', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => {
    const testWindow = window as Window & { __customCheckoutMethods?: Record<string, any> }
    if (testWindow.__customCheckoutMethods) testWindow.__customCheckoutMethods.emi = false
  })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await expect(page.getByRole('radio', { name: 'Card EMI', exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toBeVisible()
})

test('local custom checkout accepts Razorpay documented emi_plans response shape', async ({ page }) => {
  await installCustomCheckoutMock(page, true, true, 'plans')
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await expect(page.getByRole('radio', { name: 'Card EMI' })).toBeVisible()
  await page.getByRole('radio', { name: 'Card EMI' }).check()
  await page.getByLabel('Card number').fill('4100 2800 0000 1007')
  await page.getByRole('button', { name: 'Check EMI eligibility' }).click()
  await expect(page.getByLabel('EMI duration')).toContainText('3 months')
})

test('local custom checkout submits cardless EMI only for enabled providers', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Cardless EMI' }).check()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'cardless_emi', provider: 'hdfc' })
})

test('local custom checkout submits pay-later only for enabled providers', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Pay later' }).check()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'paylater', provider: 'lazypay' })
})

test('local desktop Test Mode UPI uses Razorpay QR fallback when no mobile intent apps are exposed', async ({ page }) => {
  await installCustomCheckoutMock(page, false)
  const verifiedPayloads: any[] = []
  await mockInvoicePaymentApi(page, verifiedPayloads)
  await openLocalTestCheckout(page)

  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'UPI', exact: true }).check()
  await expect(page.getByRole('button', { name: /^Show QR for / })).toBeVisible()
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()

  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment).toMatchObject({ data: { method: 'upi', upi: { qr: true, timeout: 10 } } })
  expect(payment.options).toBeUndefined()
})

test('local Test Mode card details go to Razorpay SDK only, not CRM payment requests', async ({ page }) => {
  const crmBodies: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname === 'localhost' && url.pathname.startsWith('/api/v1/')) {
      crmBodies.push(request.postData() || '')
    }
  })
  await installCustomCheckoutMock(page)
  const verifiedPayloads: any[] = []
  await mockInvoicePaymentApi(page, verifiedPayloads)
  await openLocalTestCheckout(page)

  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Card number').fill('4100 2800 0000 1007')
  await expect(page.getByLabel('Card networks enabled for this account')).toBeVisible()
  await expect(page.getByText('visa', { exact: true })).toBeVisible()
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  expect(await page.evaluate(() => (window as Window & { __emitCustomSuccess?: () => boolean }).__emitCustomSuccess?.())).toBe(true)

  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'card', 'card[number]': '4100280000001007', 'card[cvv]': '123', 'card[expiry_year]': '30' })
  expect(JSON.stringify(verifiedPayloads)).not.toContain('4100280000001007')
  expect(JSON.stringify(verifiedPayloads)).not.toContain('123')
  expect(crmBodies.join('\n')).not.toMatch(/4100\s*2800\s*0000\s*1007/)
  expect(crmBodies.join('\n')).not.toMatch(/card\[cvv\]|card-cvv|"cvv"/i)
  const persisted = await page.evaluate(() => JSON.stringify({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
  }))
  expect(persisted).not.toMatch(/4100\s*2800\s*0000\s*1007/)
  expect(persisted).not.toMatch(/card\[cvv\]|card-cvv|"cvv"/i)
})

test('SDK card validation blocks an invalid number before payment submission', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => { (window as any).__customCardValid = false })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Card number').fill('4100280000000001')
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  await expect(page.locator('form').getByRole('alert')).toContainText('Check the card number')
  expect(await page.evaluate(() => (window as any).__customPayment)).toBeUndefined()
})

test('card input always submits the documented card fields without network-specific omissions', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => {
    const testWindow = window as any
    testWindow.__customFormatterNetwork = 'maestro'
    testWindow.__customCardEligibility = { network: 'Maestro', type: 'debit', issuerCode: 'HDFC', issuerName: 'HDFC Bank', emiAvailable: false }
    testWindow.__customCheckoutMethods.card_networks.MAES = 1
  })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Card number').fill('6759649826438453')
  await page.getByLabel('Name on card').fill('Kevin Test')
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({
    method: 'card', 'card[name]': 'Kevin Test', 'card[number]': '6759649826438453',
    'card[cvv]': '123', 'card[expiry_month]': '12', 'card[expiry_year]': '30',
  })
})

test('blank cardholder name is blocked because Razorpay documents it as a required card field', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Name on card').fill('   ')
  await page.getByLabel('Card number').fill('4100 2800 0000 1007')
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('123')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  await expect(page.locator('form').getByRole('alert')).toContainText('Enter the name on the card.')
  expect(await page.evaluate(() => (window as any).__customPayment)).toBeUndefined()
})

test('AmEx Test Mode card data is passed to Razorpay without locally guessing its network', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => {
    const testWindow = window as any
    testWindow.__customFormatterNetwork = 'American Express'
    testWindow.__customCardEligibility = { network: 'American Express', type: 'credit', issuerCode: 'AMEX', issuerName: 'American Express', emiAvailable: true }
  })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Card number').fill('378282246310005')
  await expect(page.locator('form').getByText('American Express', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('DICL', { exact: true })).toHaveCount(0)
  await page.getByLabel('Expiry', { exact: true }).fill('12 / 30')
  await page.getByLabel('CVV').fill('1234')
  await page.getByRole('button', { name: /^(Pay|Show QR for) / }).click()
  const payment = await page.evaluate(() => (window as Window & { __customPayment?: any }).__customPayment)
  expect(payment.data).toMatchObject({ method: 'card', 'card[number]': '378282246310005', 'card[cvv]': '1234' })
})

test('card network acceptance is not guessed from a local BIN-prefix list', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await page.addInitScript(() => { (window as any).__customFormatterNetwork = 'discover' })
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)
  await page.getByRole('radio', { name: 'Credit or debit card' }).check()
  await page.getByLabel('Card number').fill('3608 280009 1007')
  await expect(page.getByRole('button', { name: /^(Pay|Show QR for) / })).toBeDisabled()
  await expect(page.getByText('Card network must be verified before payment.', { exact: false })).toBeVisible()
  await expect(page.getByText('Enabled card networks')).toBeVisible()
  await expect(page.getByText('DICL', { exact: true })).toHaveCount(0)
})

test('custom checkout shows no guessed methods when Razorpay does not return its method list', async ({ page }) => {
  await installCustomCheckoutMock(page, true, false)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page, false)

  await expect(page.locator('[class*="notice"]')).toContainText('Payment choices are hidden until Razorpay confirms availability.', { timeout: 7000 })
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry loading methods' })).toBeVisible()
})

test('payment method options stay in a single vertical list', async ({ page }) => {
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)

  const methodRows = page.getByRole('group', { name: 'Payment method', exact: true }).getByRole('radio').locator('..')
  await expect(methodRows).toHaveCount(7)
  const boxes = await methodRows.evaluateAll((labels) => labels.map((label) => {
    const { x, y, width } = label.getBoundingClientRect()
    return { x, y, width }
  }))
  expect(new Set(boxes.map((box) => box.x)).size).toBe(1)
  expect(boxes.every((box, index) => index === 0 || box.y > boxes[index - 1].y)).toBe(true)
})

test('custom checkout fits narrow mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await installCustomCheckoutMock(page)
  await mockInvoicePaymentApi(page, [])
  await openLocalTestCheckout(page)
  await beginLocalCustomCheckout(page)

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Credit or debit card' })).toBeVisible()
  const checkoutBounds = await page.locator('form').evaluate((form) => {
    const { left, right } = form.getBoundingClientRect()
    return { left, right, viewportWidth: window.innerWidth }
  })
  expect(checkoutBounds.left).toBeGreaterThanOrEqual(0)
  expect(checkoutBounds.right).toBeLessThanOrEqual(checkoutBounds.viewportWidth)
})
