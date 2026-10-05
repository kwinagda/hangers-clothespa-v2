import http from 'node:http'

let createOrderRequests = 0
let assignmentRequests = 0
let serverSideStatusLookups = 0
let recoverCaptured = false
let recoverFailed = false
let standardCheckoutCaptured = false
let summaryCapturedInvoiceId = ''
const summaryCreatedInvoiceIds = []
const summaryVerifiedInvoiceIds = []
const experimentEvents = []
const clientEvents = []
const summaryStatusInvoiceIds = []
const summaryAssignmentInvoiceIds = []
const checkoutOrigins = new Set(['http://127.0.0.1:55103', 'http://localhost:55104'])

const invoice = {
  invoiceNumber: 'AB-VISUAL-FIXTURE',
  orderNumber: 'AB-VISUAL-FIXTURE',
  paymentStatus: 'UNPAID',
  status: 'RECEIVED',
  invoiceType: 'ORDER',
  currency: 'INR',
  subtotal: 1,
  totalAmount: 1,
  paidAmount: 0,
  balanceDue: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  deliveryDate: '2026-09-25T00:00:00.000Z',
  customer: { name: 'Home QA', phone: '9930367267' },
  items: [{ sourceType: 'SERVICE', garmentType: 'SERVICE', serviceName: 'Hangers service item', quantity: 1, unitPrice: 1, subtotal: 1 }],
  legalTerms: { sections: [] },
}

const server = http.createServer((req, res) => {
  const requestOrigin = req.headers.origin
  if (typeof requestOrigin === 'string' && checkoutOrigins.has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,idempotency-key')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  if (req.method === 'POST' && path === '/__test__/reset-standard-success') {
    standardCheckoutCaptured = false
    res.writeHead(200).end(JSON.stringify({ success: true }))
    return
  }
  if (req.method === 'POST' && path === '/__test__/reset-summary-payment') {
    summaryCapturedInvoiceId = new URL(req.url, 'http://127.0.0.1').searchParams.get('paidInvoice') === 'summary-invoice-55' ? 'summary-invoice-55' : ''
    summaryCreatedInvoiceIds.length = 0
    summaryVerifiedInvoiceIds.length = 0
    res.writeHead(200).end(JSON.stringify({ success: true }))
    return
  }
  if (req.method === 'GET' && path === '/__test__/stats') {
    res.writeHead(200).end(JSON.stringify({ createOrderRequests, assignmentRequests, serverSideStatusLookups, experimentEvents, clientEvents, summaryStatusInvoiceIds, summaryAssignmentInvoiceIds, summaryCreatedInvoiceIds, summaryVerifiedInvoiceIds }))
    return
  }

  const segments = path.split('/').filter(Boolean)
  const slug = segments[4]
  if (req.method === 'GET' && path === '/api/v1/public/invoices/customer-summary') {
    const receivable = (invoiceId, invoiceNumber, sourceNumber, balanceDue) => ({
      invoiceId, invoiceNumber, sourceNumber, sourceType: 'ORDER', dueDate: '2026-09-27T00:00:00.000Z',
      totalAmount: balanceDue, paidAmount: 0, balanceDue, totalPieces: 1,
      items: [{ serviceName: 'Hangers service item', garmentType: 'SERVICE', quantity: 1, unitPrice: balanceDue, subtotal: balanceDue }],
    })
    const receivables = [
      ...(['ALL', 'summary-invoice-42'].includes(summaryCapturedInvoiceId) ? [] : [receivable('summary-invoice-42', 'INV-SUMMARY-42', 'HCS-SUM-42', 42)]),
      ...(['ALL', 'summary-invoice-55'].includes(summaryCapturedInvoiceId) ? [] : [receivable('summary-invoice-55', 'INV-SUMMARY-55', 'HCS-SUM-55', 55)]),
    ]
    const totals = receivables.reduce((sum, item) => ({
      totalAmount: sum.totalAmount + item.totalAmount,
      paidAmount: sum.paidAmount + item.paidAmount,
      balanceDue: sum.balanceDue + item.balanceDue,
    }), { totalAmount: 0, paidAmount: 0, balanceDue: 0 })
    res.writeHead(200).end(JSON.stringify({ success: true, data: { paymentSummary: {
      customer: { name: 'Home QA', phone: '9930367267' }, invoiceCount: receivables.length,
      totals, legalTerms: { sections: [] }, receivables,
    } } }))
    return
  }
  if (req.method === 'GET' && /^\/api\/v1\/public\/invoices\/variant-(?:[ab]|redesign|telemetry-down|callback-failure|modal-dismiss|terminal-failure|recover-captured|recover-pending|recover-failed|standard-success|redirect-disabled)$/.test(path)) {
    const invoiceData = slug === 'variant-redesign'
      ? { ...invoice, subtotal: 180, totalAmount: 180, balanceDue: 180, items: [{ ...invoice.items[0], unitPrice: 180, subtotal: 180 }] }
      : ((slug === 'variant-recover-captured' && recoverCaptured) || (slug === 'variant-standard-success' && standardCheckoutCaptured))
      ? { ...invoice, id: 'invoice_recover_captured', status: 'PAID', paymentStatus: 'PAID', paidAmount: 1, balanceDue: 0 }
      : invoice
    res.writeHead(200).end(JSON.stringify({ success: true, data: { invoice: invoiceData } }))
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/experiment/assign')) {
    assignmentRequests += 1
    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { rawBody += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(rawBody)
        if (event.invoiceId) summaryAssignmentInvoiceIds.push(event.invoiceId)
      } catch {}
      if (slug === 'variant-telemetry-down') {
        res.writeHead(503).end(JSON.stringify({ success: false, message: 'Experiment service unavailable.' }))
        return
      }
      res.writeHead(200).end(JSON.stringify({ success: true, data: { experimentId: 'invoice_checkout_presentation_v1', variant: slug === 'variant-b' ? 'B' : 'A' } }))
    })
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/experiment/events')) {
    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { rawBody += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(rawBody)
        experimentEvents.push({ eventType: event.eventType, variant: event.variant })
        res.writeHead(200).end(JSON.stringify({ success: true, data: { accepted: true } }))
      } catch {
        res.writeHead(400).end(JSON.stringify({ success: false }))
      }
    })
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/client-events')) {
    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { rawBody += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(rawBody)
        clientEvents.push({ eventType: event.eventType, hasAttemptId: Boolean(event.attemptId), hasClientEventId: Boolean(event.clientEventId) })
        res.writeHead(200).end(JSON.stringify({ success: true, data: { accepted: true } }))
      } catch {
        res.writeHead(400).end(JSON.stringify({ success: false }))
      }
    })
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/create-order')) {
    createOrderRequests += 1
    if (slug === 'customer-summary') {
      let rawBody = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { rawBody += chunk })
      req.on('end', () => {
        try {
          const requestBody = JSON.parse(rawBody)
          if (requestBody.invoiceId !== 'summary-invoice-42' || requestBody.paymentScope !== 'CUSTOMER_OUTSTANDING' || summaryCapturedInvoiceId) {
            res.writeHead(409).end(JSON.stringify({ success: false, code: 'SUMMARY_INVOICE_NOT_PAYABLE' }))
            return
          }
          summaryCreatedInvoiceIds.push(requestBody.invoiceId)
          res.writeHead(200).end(JSON.stringify({ success: true, data: {
            key: 'rzp_test_ui_fixture', amount: 9700, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
            checkoutAttemptId: 'summary-ui-test-attempt', razorpayOrderId: 'order_summary_ui_test', invoiceNumber: 'INV-SUMMARY-42',
          } }))
        } catch {
          res.writeHead(400).end(JSON.stringify({ success: false }))
        }
      })
      return
    }
    if (slug === 'variant-terminal-failure') {
      res.writeHead(409).end(JSON.stringify({
        success: false,
        code: 'CHECKOUT_ATTEMPT_TERMINAL',
        message: 'This payment attempt failed. Start a new attempt to continue.',
        details: { checkoutAttemptId: 'ui-test-terminal-attempt' },
      }))
      return
    }
    if (slug === 'variant-callback-failure' || slug === 'variant-modal-dismiss' || slug === 'variant-standard-success') {
      res.writeHead(200).end(JSON.stringify({ success: true, data: {
        key: 'rzp_test_ui_fixture', amount: 100, currency: 'INR', mode: 'TEST', testContact: '+919930367267',
        checkoutAttemptId: 'ui-test-attempt', razorpayOrderId: 'order_ui_test', invoiceNumber: 'AB-VISUAL-FIXTURE',
        redirectCheckoutAvailable: true,
        callbackUrl: `http://localhost:5001/api/v1/public/invoices/${slug}/payment/callback?invoiceId=ui-test-invoice`,
      } }))
      return
    }
    res.writeHead(403).end(JSON.stringify({ success: false, code: 'UI_TEST_PAYMENT_DISABLED', message: 'Order creation is blocked in this UI test.' }))
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/verify') && slug === 'customer-summary') {
    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { rawBody += chunk })
    req.on('end', () => {
      try {
        const tuple = JSON.parse(rawBody)
        if (tuple.invoiceId !== 'summary-invoice-42' || tuple.razorpayOrderId !== 'order_summary_ui_test' || tuple.razorpayPaymentId !== 'pay_summary_ui_captured' || tuple.razorpaySignature !== 'summary-ui-test-signature') {
          res.writeHead(400).end(JSON.stringify({ success: false, code: 'INVALID_FIXTURE_TUPLE' }))
          return
        }
        summaryCapturedInvoiceId = 'ALL'
        summaryVerifiedInvoiceIds.push(tuple.invoiceId)
        res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'CAPTURED', paymentId: tuple.razorpayPaymentId } }))
      } catch {
        res.writeHead(400).end(JSON.stringify({ success: false }))
      }
    })
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/verify') && slug === 'variant-standard-success') {
    let rawBody = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { rawBody += chunk })
    req.on('end', () => {
      try {
        const tuple = JSON.parse(rawBody)
        if (tuple.razorpayOrderId !== 'order_ui_test' || tuple.razorpayPaymentId !== 'pay_ui_test_captured' || tuple.razorpaySignature !== 'ui-test-signature') {
          res.writeHead(400).end(JSON.stringify({ success: false, code: 'INVALID_FIXTURE_TUPLE' }))
          return
        }
        standardCheckoutCaptured = true
        res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'CAPTURED', paymentId: tuple.razorpayPaymentId } }))
      } catch {
        res.writeHead(400).end(JSON.stringify({ success: false }))
      }
    })
    return
  }
  if (req.method === 'GET' && path.endsWith('/payment/status')) {
    const searchParams = new URL(req.url || '/', 'http://127.0.0.1').searchParams
    const hasAttemptId = Boolean(searchParams.get('attemptId'))
    const invoiceId = searchParams.get('invoiceId')
    if (invoiceId) summaryStatusInvoiceIds.push(invoiceId)
    if (!hasAttemptId) serverSideStatusLookups += 1
    if (slug === 'variant-recover-captured' && !hasAttemptId) {
      recoverCaptured = true
      res.writeHead(200).end(JSON.stringify({ success: true, data: {
        status: 'CAPTURED', attemptId: null, invoice: { status: 'PAID', balanceDue: 0 },
        paymentId: 'pay_test_captured', razorpayOrderId: 'order_test_captured', razorpayPaymentId: 'pay_test_captured',
        capturedAmountPaise: '100', currency: 'INR', capturedAt: '2026-10-02T00:00:00.000Z',
      } }))
      return
    }
    if (slug === 'variant-standard-success' && standardCheckoutCaptured && !hasAttemptId) {
      res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'CAPTURED', attemptId: 'server-resolved-attempt', invoice: { status: 'PAID', balanceDue: 0 }, paymentId: 'pay_ui_test_captured' } }))
      return
    }
    if (slug === 'customer-summary' && (summaryCapturedInvoiceId === 'ALL' || invoiceId === summaryCapturedInvoiceId)) {
      res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'CAPTURED', attemptId: 'summary-ui-test-attempt', invoice: { status: 'PAID', balanceDue: 0 }, paymentId: 'pay_summary_ui_captured' } }))
      return
    }
    if (slug === 'variant-recover-pending' && !hasAttemptId) {
      res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'PENDING', attemptId: 'server-resolved-pending-attempt', canResumeCheckout: false } }))
      return
    }
    if (slug === 'variant-modal-dismiss' && hasAttemptId) {
      res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'CREATED', attemptId: 'ui-test-attempt', canResumeCheckout: false } }))
      return
    }
    if (slug === 'variant-recover-failed') {
      if (!hasAttemptId && !recoverFailed) {
        recoverFailed = true
        res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'PENDING', attemptId: 'server-resolved-failed-attempt', canResumeCheckout: false } }))
        return
      }
      res.writeHead(200).end(JSON.stringify({ success: true, data: { status: 'FAILED', attemptId: 'server-resolved-failed-attempt', canResumeCheckout: false } }))
      return
    }
    res.writeHead(200).end(JSON.stringify({ success: true, data: { status: hasAttemptId ? 'FAILED' : 'NONE', redirectCheckoutAvailable: true } }))
    return
  }
  res.writeHead(404).end(JSON.stringify({ success: false }))
})

server.listen(55102, '127.0.0.1')
