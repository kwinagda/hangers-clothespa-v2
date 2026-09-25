import http from 'node:http'

let createOrderRequests = 0
let assignmentRequests = 0
const experimentEvents = []

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
  customer: { name: 'Razorpay Test Customer', phone: '9930367267' },
  items: [{ sourceType: 'SERVICE', garmentType: 'Test garment', serviceName: 'Dry Clean', quantity: 1, unitPrice: 1, subtotal: 1 }],
  legalTerms: { sections: [] },
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:55103')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,idempotency-key')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  if (req.method === 'GET' && path === '/__test__/stats') {
    res.writeHead(200).end(JSON.stringify({ createOrderRequests, assignmentRequests, experimentEvents }))
    return
  }

  const segments = path.split('/').filter(Boolean)
  const slug = segments[4]
  if (req.method === 'GET' && /^\/api\/v1\/public\/invoices\/variant-(?:[ab]|telemetry-down)$/.test(path)) {
    res.writeHead(200).end(JSON.stringify({ success: true, data: { invoice } }))
    return
  }
  if (req.method === 'POST' && path.endsWith('/payment/experiment/assign')) {
    assignmentRequests += 1
    if (slug === 'variant-telemetry-down') {
      res.writeHead(503).end(JSON.stringify({ success: false, message: 'Experiment service unavailable.' }))
      return
    }
    res.writeHead(200).end(JSON.stringify({ success: true, data: { experimentId: 'invoice_checkout_presentation_v1', variant: slug === 'variant-b' ? 'B' : 'A' } }))
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
  if (req.method === 'POST' && path.endsWith('/payment/create-order')) {
    createOrderRequests += 1
    res.writeHead(403).end(JSON.stringify({ success: false, code: 'UI_TEST_PAYMENT_DISABLED', message: 'Order creation is blocked in this UI test.' }))
    return
  }
  res.writeHead(404).end(JSON.stringify({ success: false }))
})

server.listen(55101, '127.0.0.1')
