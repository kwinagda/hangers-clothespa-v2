import { expect, test } from '@playwright/test'

const paymentId = 'pay_test_finance_ui_projection'
const viewports = [
  { name: 'narrow-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

test('Finance shows a captured Test receipt and zero receivables without overflow or mutations', async ({ page }, testInfo) => {
  const mutations: string[] = []
  const reportPreviewRequests: string[] = []
  const pairedReportPreviewRequests: any[] = []
  const reportBackfillRequests: any[] = []
  const reportBackfillFailures: any[] = []
  let failNextReportBackfill = true
  let orderInventoryPreviewCalls = 0
  page.on('pageerror', (error) => console.error('FINANCE_PAGE_ERROR', error.stack || error.message))
  const payment = {
    id: 'payment_test_finance_ui_projection',
    amount: 10,
    signedAmount: 10,
    method: 'RAZORPAY',
    providerMethod: 'card',
    providerMethodDetail: 'Visa:credit',
    status: 'CAPTURED',
    kind: 'RECEIPT',
    mode: 'TEST',
    razorpayPaymentId: paymentId,
    razorpayOrderId: 'order_test_finance_ui_projection',
    createdAt: new Date().toISOString(),
    order: { orderNumber: 'RZP-TEST-FINANCE-UI', customer: { name: 'Home QA' } },
    customer: { name: 'Home QA' },
    allocations: [],
    collectedByStaff: { name: 'Finance QA' },
  }
  const refundPayment = {
    ...payment,
    id: 'refund_test_finance_ui_projection',
    amount: 4,
    signedAmount: -4,
    kind: 'REFUND',
    razorpayPaymentId: undefined,
    razorpayRefundId: 'rfnd_test_finance_ui_projection',
    reference: 'rfnd_test_finance_ui_projection',
    providerMethod: undefined,
    createdAt: new Date(Date.now() + 1000).toISOString(),
  }
  const bankTransferPayment = {
    ...payment,
    id: 'payment_test_bank_transfer_ui_projection',
    amount: 5,
    signedAmount: 5,
    method: 'ONLINE',
    status: 'CAPTURED',
    kind: 'RECEIPT',
    mode: undefined,
    razorpayPaymentId: undefined,
    razorpayOrderId: undefined,
    reference: 'BANK-TRANSFER-REF-001',
    providerMethod: undefined,
    providerMethodDetail: undefined,
  }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    if (request.method() === 'POST' && path === '/reconciliation/razorpay-dashboard-reports/payments/preview') {
      reportPreviewRequests.push(path)
      await route.fulfill({ json: { success: true, data: { report: {
        configuredMode: 'TEST', totalRows: 1, capturedRows: 1, otherStatusRows: 0, exactCandidateRows: 1, truncated: false,
        preview: [{ rowNumber: 2, providerPayment: { id: 'pay_test_report_preview_1', orderId: 'order_test_report_preview_1', status: 'captured', amountPaise: '1400', currency: 'INR' }, classification: 'EXACT_CAPTURED_PAYMENT_CANDIDATE', reasonCode: 'REPORT_IDS_AND_CRM_ATTEMPT_MATCH_PROVIDER_VERIFICATION_REQUIRED', invoice: { id: 'invoice_report_001', invoiceNumber: 'INV-REPORT-001', balanceDuePaise: '1400' }, checkoutAttemptId: 'attempt_report_001' }],
      } } } })
      return
    }
    if (request.method() === 'POST' && path === '/reconciliation/razorpay-dashboard-reports/orders/preview') {
      reportPreviewRequests.push(path)
      await route.fulfill({ json: { success: true, data: { report: {
        configuredMode: 'TEST', totalRows: 1, paidOrders: 0, unpaidOrders: 1, exactAttemptCandidates: 1, invoiceReferenceCandidates: 0, truncated: false,
        preview: [{ rowNumber: 2, providerOrder: { id: 'order_test_orders_report_1', status: 'created', amountPaise: '1400', amountPaidPaise: '0', amountDuePaise: '1400', currency: 'INR' }, classification: 'EXACT_ORDER_AND_ATTEMPT_CANDIDATE', reasonCode: 'LOCAL_ORDER_ATTEMPT_AMOUNT_MATCH', invoice: { id: 'invoice_orders_001', invoiceNumber: 'INV-ORDERS-001', status: 'OPEN', balanceDuePaise: '1400' }, checkoutAttemptId: 'attempt_orders_001', checkoutAttemptStatus: 'CREATE_FAILED' }],
      } } } })
      return
    }
    if (request.method() === 'POST' && path === '/reconciliation/razorpay-dashboard-reports/historical-payments/preview') {
      pairedReportPreviewRequests.push(request.postDataJSON())
      await route.fulfill({ json: { success: true, data: { report: {
        configuredMode: 'TEST', totalRows: 1, candidateRows: 1, alreadyRecordedRows: 0, reviewRows: 0, truncated: false,
        preview: [{ providerPayment: { id: 'pay_test_old_report', orderId: 'order_test_old_report', status: 'captured', amountPaise: '1400', currency: 'INR' }, providerOrder: { id: 'order_test_old_report', status: 'paid', amountPaise: '1400', amountPaidPaise: '1400', amountDuePaise: '0', attempts: 1, currency: 'INR' }, classification: 'HISTORICAL_PAYMENT_REPORT_CANDIDATE', reasonCode: 'EXACT_REPORT_BINDING_REQUIRES_LIVE_PAYMENT_VERIFICATION', invoice: { id: 'invoice_old_report', invoiceNumber: 'INV-OLD-REPORT', balanceDuePaise: '1400' } }],
      } } } })
      return
    }
    if (request.method() === 'POST' && path === '/reconciliation/razorpay-payments/pay_test_old_report/backfill') {
      const payload = request.postDataJSON()
      reportBackfillRequests.push(payload)
      if (failNextReportBackfill) {
        failNextReportBackfill = false
        reportBackfillFailures.push(payload)
        await route.fulfill({ status: 409, json: {
          success: false,
          code: 'HISTORICAL_PAYMENT_REFUND_REVIEW',
          message: 'This Razorpay payment has a refund state and requires separate Finance reconciliation.',
        } })
        return
      }
      await route.fulfill({ json: { success: true, message: 'Verified Test payment recorded in CRM', data: {} } })
      return
    }
    if (request.method() !== 'GET') {
      mutations.push(`${request.method()} ${path}`)
      await route.fulfill({ status: 403, json: { success: false, message: 'Mutation blocked by Finance UI test' } })
      return
    }

    if (path === '/staff/auth/me') {
      await route.fulfill({ json: { success: true, data: { staff: {
      id: 'finance-qa-read-only', name: 'Finance QA', role: 'ACCOUNTS',
        effectivePermissions: ['dashboard.view', 'orders.view', 'finance.view', 'finance.reconcile'],
      } } } })
      return
    }
    if (path === '/staff/me/ui-preferences') {
      await route.fulfill({ json: { success: true, data: {} } })
      return
    }
    if (path === '/metadata') {
      await route.fulfill({ json: { success: true, data: { metadata: {
        paymentMethods: [
          { value: 'RAZORPAY', label: 'Razorpay' },
          { value: 'ONLINE', label: 'Online' },
        ],
        paymentStatuses: [{ value: 'CAPTURED', label: 'Captured', color: '#047857', bg: '#ecfdf5' }],
      } } } })
      return
    }
    if (path === '/payments/daily') {
      await route.fulfill({ json: { success: true, data: {
        summary: { total: 11, byMethod: { RAZORPAY: 6, ONLINE: 5 }, count: 3 },
        payments: [payment, refundPayment, bankTransferPayment],
      } } })
      return
    }
    if (path === '/payments/receivables') {
      await route.fulfill({ json: { success: true, data: {
        total: 0, orders: [], receivables: [], customerGroups: [],
      } } })
      return
    }
    if (path === '/reconciliation/razorpay-settlement-summary-report') {
      await route.fulfill({ json: { success: true, data: { report: {
        mode: 'TEST', period: { from: '2026-09-01', to: '2026-09-26' },
        totals: {
          settlementBatchCount: 1, providerGrossPaise: '170000', refundsPaise: '0', feesPaise: '3400', taxPaise: '0',
          reportNetPaise: '166600', processedSettlementAmountPaise: '166600', bankCreditedPaise: '0',
          unmatchedBankCreditPaise: '0', unmatchedProcessedSettlementPaise: '166600', reportToSettlementVariancePaise: '0',
          reportToSummaryFeeVariancePaise: '3400', reportToSummaryTaxVariancePaise: '0', bankVariancePaise: '0',
          pendingSettlementAmountPaise: '0', failedSettlementAmountPaise: '0', unmatchedProcessedSettlementCount: 1,
          unmatchedBankCreditCount: 0, settledLineCount: 4, pendingNotOnHoldLineCount: 0, onHoldLineCount: 0,
          unsupportedCurrencyLineCount: 0, summaryRecordsWithoutReportLines: 0,
        },
        settlements: [{
          providerSettlementId: 'setl_test_fee_variance', settlementSummaryStatus: 'processed', settlementAmountPaise: '166600',
          settlementFeesPaise: '0', settlementTaxPaise: '0', providerGrossPaise: '170000', refundsPaise: '0',
          feesPaise: '3400', taxPaise: '0', reportNetPaise: '166600', reportToSettlementVariancePaise: '0',
          reportToSummaryFeeVariancePaise: '3400', reportToSummaryTaxVariancePaise: '0', bankCreditedPaise: '0',
          bankToSettlementVariancePaise: null, unsupportedCurrencies: [], lines: [], bankMatches: [],
        }],
        unassignedReport: null,
      } } } })
      return
    }
    if (path === '/reconciliation/razorpay-orders/preview') {
      const incompleteLinkedLookup = orderInventoryPreviewCalls++ % 2 === 0
      await route.fulfill({ json: { success: true, data: { preview: {
        mode: 'TEST', scanned: 2, pages: 1, paginationComplete: true, reviewItemsTruncated: false,
        linkedOrderLookups: incompleteLinkedLookup
          ? { requested: 1, fetched: 0, failed: 1, skippedByLimit: 0, complete: false }
          : { requested: 1, fetched: 1, failed: 0, skippedByLimit: 0, complete: true },
        counts: { EXACT_INVOICE_CANDIDATE: 1, UNMATCHED_REVIEW: 1 },
        paymentInventory: {
          paginationComplete: true, pages: 1, scanned: 2, reviewItemsTruncated: false,
          counts: { EXACT_CAPTURED_PAYMENT_CANDIDATE: 1, NON_CAPTURED_PROVIDER_PAYMENT: 1 },
          reviewItems: [
            { providerPayment: { id: 'pay_test_exact_capture', orderId: 'order_test_exact_candidate', amountPaise: '1000', currency: 'INR', status: 'captured', captured: true }, classification: 'EXACT_CAPTURED_PAYMENT_CANDIDATE', reasonCode: 'CAPTURED_PAYMENT_AND_ORDER_REFERENCE_MATCH', invoice: { id: 'invoice_old_001', invoiceNumber: 'INV-OLD-001', balanceDuePaise: '1000' } },
            { providerPayment: { id: 'pay_test_authorized_only', orderId: 'order_test_exact_candidate', amountPaise: '1000', currency: 'INR', status: 'authorized', captured: false }, classification: 'NON_CAPTURED_PROVIDER_PAYMENT', reasonCode: 'PROVIDER_PAYMENT_NOT_CAPTURED', invoice: { invoiceNumber: 'INV-OLD-001' } },
          ],
        },
        reviewItems: [
          { providerOrder: { id: 'order_test_exact_candidate', status: 'created', attempts: 0, amountPaise: '1000', amountPaidPaise: '0', amountDuePaise: '1000', currency: 'INR' }, classification: 'EXACT_INVOICE_CANDIDATE', reasonCode: 'UNIQUE_INVOICE_RECEIPT_AND_AMOUNT_MATCH', invoice: { id: 'invoice_old_001', invoiceNumber: 'INV-OLD-001', status: 'OPEN', balanceDuePaise: '1000' } },
          { providerOrder: { id: 'order_test_unmatched', status: 'created', amountPaise: '2500', currency: 'INR' }, classification: 'UNMATCHED_REVIEW', reasonCode: 'NO_EXACT_CRM_REFERENCE' },
        ],
      } } } })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/dashboard/finance')
    await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible()
    if (viewport.width < 768) {
      const transactionCard = page.locator('.finance-mobile-transactions article')
      await expect(transactionCard.filter({ hasText: paymentId })).toContainText('RZP-TEST-FINANCE-UI')
      await expect(transactionCard.filter({ hasText: paymentId })).toContainText('Test mode')
      await expect(transactionCard.filter({ hasText: 'rfnd_test_finance_ui_projection' })).toContainText('-₹4')
      await expect(transactionCard.filter({ hasText: 'rfnd_test_finance_ui_projection' })).toContainText('Refund')
      await expect(page.locator('.finance-summary-cards').getByText('₹6', { exact: true }).first()).toBeVisible()
      await expect(page.locator('.finance-summary-cards').getByText('Bank transfer', { exact: true })).toBeVisible()
      await expect(page.locator('.finance-summary-cards').getByText('₹5', { exact: true })).toBeVisible()
      await expect(page.locator('.finance-mobile-transactions article').filter({ hasText: 'BANK-TRANSFER-REF-001' })).toContainText('Bank transfer')
      const razorpayFilter = page.locator('.finance-register-head button').filter({ hasText: 'Razorpay' }).first()
      await expect(razorpayFilter).toBeVisible()
      const filterBounds = await razorpayFilter.evaluate((element) => {
        const elementRect = element.getBoundingClientRect()
        const headerRect = element.closest('.finance-register-head')!.getBoundingClientRect()
        return { left: elementRect.left, right: elementRect.right, headerLeft: headerRect.left, headerRight: headerRect.right }
      })
      expect(filterBounds.left).toBeGreaterThanOrEqual(filterBounds.headerLeft)
      expect(filterBounds.right).toBeLessThanOrEqual(filterBounds.headerRight)
    } else {
      const visibleRegister = page.locator('.finance-table tbody')
      const capturedRow = visibleRegister.locator('tr').filter({ hasText: paymentId })
      const refundRow = visibleRegister.locator('tr').filter({ hasText: 'rfnd_test_finance_ui_projection' })
      await expect(capturedRow).toContainText('RZP-TEST-FINANCE-UI')
      await expect(capturedRow).toContainText('Test mode')
      await expect(refundRow).toContainText('-₹4')
      await expect(refundRow).toContainText('Refund')
      const bankTransferRow = visibleRegister.locator('tr').filter({ hasText: 'BANK-TRANSFER-REF-001' })
      await expect(bankTransferRow).toContainText('Bank transfer')
      await expect(page.locator('.finance-summary-cards').getByText('Bank transfer', { exact: true })).toBeVisible()
      await expect(page.locator('.finance-summary-cards').getByText('₹5', { exact: true })).toBeVisible()
      await expect(page.locator('.finance-table tfoot').getByText('₹11', { exact: true })).toBeVisible()
    }

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }))
    expect(layout.documentWidth, `${viewport.name} Finance page overflows horizontally`).toBeLessThanOrEqual(layout.viewportWidth + 2)

    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-daily-register.png`), fullPage: true })

    if (viewport.width < 768) {
      await expect(page.locator('.finance-mobile-transactions article')).toHaveCount(3)
      await expect(page.locator('.finance-table')).toBeHidden()
    } else {
      await expect(page.locator('.finance-table')).toBeVisible()
      await expect(page.locator('.finance-mobile-transactions')).toBeHidden()
    }

    await page.getByRole('button', { name: 'Accounts Receivable' }).click()
    await expect(page.getByText('No outstanding balances.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Payment Events' }).click()
    const settlementSection = page.locator('section').filter({ hasText: 'Settlement and bank summary' })
    await settlementSection.locator('select').selectOption('TEST')
    await settlementSection.getByRole('button', { name: 'Build summary' }).click()
    await expect(settlementSection).toContainText('Report vs summary fees: ₹34.00')
    await expect(settlementSection).toContainText('Report vs summary tax: ₹0.00')
    await expect(settlementSection).toContainText('Report fees ₹34.00 · summary ₹0.00 · variance ₹34.00')
    const inventory = page.getByRole('region', { name: 'Historical Razorpay Order inventory' })
    await expect(inventory.getByText('Read-only scan of provider Orders and Payments', { exact: false })).toBeVisible()
    await inventory.getByLabel('Razorpay Payments CSV report').setInputFiles({
      name: 'razorpay-payments.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Payment ID,Order ID,Status,Amount,Currency,Customer Contact,VPA\npay_test_report_preview_1,order_test_report_preview_1,captured,14.00,INR,+919930367267,private@upi'),
    })
    await inventory.getByRole('button', { name: 'Preview Payments CSV' }).click()
    await expect(inventory.getByText('1 report rows', { exact: true }).first()).toBeVisible()
    await expect(inventory.getByText('pay_test_report_preview_1')).toBeVisible()
    await expect(inventory.getByText('+919930367267')).toHaveCount(0)
    await expect(inventory.getByText('private@upi')).toHaveCount(0)
    await inventory.getByRole('button', { name: 'Review & verify' }).click()
    const reportBackfillDialog = page.getByRole('dialog', { name: 'Review captured payment' })
    await expect(reportBackfillDialog).toContainText('INV-REPORT-001')
    await expect(reportBackfillDialog.getByRole('button', { name: 'Confirm & record' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(reportBackfillDialog).toBeHidden()
    await inventory.getByLabel('Razorpay Orders CSV report').setInputFiles({
      name: 'razorpay-orders.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('id,amount,amount_paid,amount_due,currency,receipt,status,notes\norder_test_orders_report_1,14.00,0,14.00,INR,INV-ORDERS-001,created,"private notes"'),
    })
    await inventory.getByRole('button', { name: 'Preview Orders CSV' }).click()
    await expect(inventory.getByText('1 report rows', { exact: true }).nth(1)).toBeVisible()
    await expect(inventory.getByText('order_test_orders_report_1')).toBeVisible()
    await expect(inventory.getByText('INV-ORDERS-001')).toBeVisible()
    await expect(inventory.getByRole('button', { name: 'Review & record' })).toHaveCount(0)
    await inventory.getByRole('button', { name: 'Preview paired reports' }).click()
    await expect(inventory.getByText('1 live-verification candidates')).toBeVisible()
    const reportCandidate = inventory.getByRole('button', { name: 'Review & verify live' })
    await expect(reportCandidate).toBeVisible()
    await reportCandidate.click()
    const historicalReportDialog = page.getByRole('dialog', { name: 'Review captured payment' })
    await expect(historicalReportDialog).toContainText('INV-OLD-REPORT')
    await expect(historicalReportDialog).toContainText('documented Order-retention error')
    const historicalReportConfirm = historicalReportDialog.getByRole('button', { name: 'Confirm & record' })
    await expect(historicalReportConfirm).toBeDisabled()
    await historicalReportDialog.getByLabel('I reviewed the paired Dashboard report references and authorize live verification and recording this one payment.').check()
    await expect(historicalReportConfirm).toBeEnabled()
    await historicalReportConfirm.click()
    if (viewport.name === 'narrow-phone') {
      await expect(historicalReportDialog).toBeVisible()
      await expect(page.getByText('This Razorpay payment has a refund state and requires separate Finance reconciliation.', { exact: true })).toBeVisible()
      await expect(historicalReportConfirm).toBeEnabled()
      await historicalReportConfirm.click()
    }
    await expect(historicalReportDialog).toBeHidden()
    await inventory.getByRole('button', { name: 'Preview Orders', exact: true }).click()
    await expect(inventory.getByText('TEST mode', { exact: true })).toBeVisible()
    await expect(inventory.getByText('Provider inventory is incomplete; do not use candidates or record payments')).toBeVisible()
    await expect(inventory.getByText('Referenced Orders checked: 0/1')).toBeVisible()
    await expect(inventory.getByRole('button', { name: 'Review & link unused Order' })).toHaveCount(0)
    await expect(inventory.getByRole('button', { name: 'Review & record' })).toHaveCount(0)
    await inventory.getByRole('button', { name: 'Preview Orders', exact: true }).click()
    await expect(inventory.getByText('Referenced Orders checked: 1/1')).toBeVisible()
    await expect(inventory.getByText('Provider inventory is incomplete; do not use candidates or record payments')).toHaveCount(0)
    await expect(inventory.getByText('order_test_exact_candidate')).toBeVisible()
    await expect(inventory.getByText('INV-OLD-001').first()).toBeVisible()
    await expect(inventory.getByText('order_test_unmatched')).toBeVisible()
    await expect(inventory.getByText('Provider Payments · 2 scanned · 1 page(s)')).toBeVisible()
    await expect(inventory.getByText('pay_test_exact_capture')).toBeVisible()
    await expect(inventory.getByText('pay_test_authorized_only')).toBeVisible()
    await expect(inventory.getByText('Preview never posts ledger entries', { exact: false })).toBeVisible()
    const orderLinkDialogButton = inventory.getByRole('button', { name: 'Review & link unused Order' })
    await expect(orderLinkDialogButton).toBeVisible()
    await orderLinkDialogButton.click()
    const orderLinkDialog = page.getByRole('dialog', { name: 'Review unused Order' })
    await expect(orderLinkDialog).toContainText('order_test_exact_candidate')
    await expect(orderLinkDialog).toContainText('This does not mark the invoice paid or collect money')
    await expect(orderLinkDialog.getByRole('button', { name: 'Confirm & link Order' })).toBeDisabled()
    await orderLinkDialog.getByLabel('I reviewed these references and authorize linking this unused Order to this unpaid invoice.').check()
    await expect(orderLinkDialog.getByRole('button', { name: 'Confirm & link Order' })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(orderLinkDialog).toBeHidden()
    await inventory.getByRole('button', { name: 'Review & record' }).click()
    const backfillDialog = page.getByRole('dialog', { name: 'Review captured payment' })
    await expect(backfillDialog).toContainText('pay_test_exact_capture')
    await expect(backfillDialog).toContainText('order_test_exact_candidate')
    await expect(backfillDialog.getByRole('button', { name: 'Confirm & record' })).toBeDisabled()
    await backfillDialog.getByLabel('I reviewed these provider references and authorize recording this one payment against this invoice.').check()
    await expect(backfillDialog.getByRole('button', { name: 'Confirm & record' })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(backfillDialog).toBeHidden()
    const eventLayout = await page.evaluate(() => ({ viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth }))
    expect(eventLayout.documentWidth, `${viewport.name} Payment Events page overflows horizontally`).toBeLessThanOrEqual(eventLayout.viewportWidth + 2)
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-finance.png`), fullPage: true })
  }

  expect(mutations, 'Finance display test must not send any write request').toEqual([])
  expect(reportPreviewRequests).toHaveLength(viewports.length * 2)
  expect(reportPreviewRequests.filter((path) => path.endsWith('/payments/preview'))).toHaveLength(viewports.length)
  expect(reportPreviewRequests.filter((path) => path.endsWith('/orders/preview'))).toHaveLength(viewports.length)
  expect(pairedReportPreviewRequests).toHaveLength(viewports.length * 2)
  expect(pairedReportPreviewRequests.every((payload) => payload.paymentsCsvText.includes('pay_test_report_preview_1') && payload.ordersCsvText.includes('order_test_orders_report_1'))).toBe(true)
  expect(reportBackfillRequests).toHaveLength(viewports.length + 1)
  expect(reportBackfillFailures).toHaveLength(1)
  expect(reportBackfillFailures[0]).toMatchObject({ invoiceId: 'invoice_old_report', mode: 'TEST' })
  expect(reportBackfillRequests.every((payload) => payload.invoiceId === 'invoice_old_report' && payload.mode === 'TEST' && payload.paymentsCsvText.includes('pay_test_report_preview_1') && payload.ordersCsvText.includes('order_test_orders_report_1'))).toBe(true)
})
