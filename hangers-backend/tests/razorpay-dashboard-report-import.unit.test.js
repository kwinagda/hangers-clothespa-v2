const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRazorpayOrdersReportCsv, parseRazorpayPaymentsReportCsv, previewRazorpayDashboardOrdersReport, previewRazorpayDashboardPaymentsReport, previewRazorpayHistoricalPaymentReports } = require('../src/services/razorpay-dashboard-report-import.service');

const header = 'Payment ID,Order ID,Status,Amount,Currency,Customer Contact,VPA,Card ID,Error Description,Notes';

test('parses only reconciliation-safe fields from a documented Razorpay Payments report', () => {
  const rows = parseRazorpayPaymentsReportCsv(`${header}\npay_Abc123,order_Xyz789,captured,14.00,INR,+919930367267,private@upi,card_123,private error,private notes`);
  assert.deepEqual(rows, [{ rowNumber: 2, paymentId: 'pay_Abc123', orderId: 'order_Xyz789', status: 'captured', amountPaise: '1400', currency: 'INR' }]);
  assert.equal(JSON.stringify(rows).includes('private'), false);
  assert.equal(JSON.stringify(rows).includes('9930367267'), false);
});

test('accepts the actual Razorpay sample-workbook headers and converts INR rupees to paise exactly', () => {
  const rows = parseRazorpayPaymentsReportCsv('id,amount,currency,status,order_id,captured,contact,vpa,card\npay_Abc123,5.0,INR,captured,order_Xyz789,1,+919930367267,private@upi,card_123');
  assert.deepEqual(rows, [{ rowNumber: 2, paymentId: 'pay_Abc123', orderId: 'order_Xyz789', status: 'captured', amountPaise: '500', currency: 'INR' }]);
});

test('rejects unknown, duplicate, incomplete, malformed, and duplicated provider references', () => {
  assert.throws(() => parseRazorpayPaymentsReportCsv('Payment ID,Order ID,Status,Amount,Currency,Extra\npay_Abc123,order_Xyz789,captured,1400,INR,x'), { code: 'RAZORPAY_REPORT_COLUMNS_UNSUPPORTED' });
  assert.throws(() => parseRazorpayPaymentsReportCsv('Payment ID,Payment ID,Status,Amount,Currency\npay_Abc123,pay_Abc123,captured,1400,INR'), { code: 'RAZORPAY_REPORT_HEADERS_INVALID' });
  assert.throws(() => parseRazorpayPaymentsReportCsv('id,Payment ID,Status,Amount,Currency\npay_Abc123,pay_Abc123,captured,14.00,INR'), { code: 'RAZORPAY_REPORT_HEADERS_INVALID' });
  assert.throws(() => parseRazorpayPaymentsReportCsv('Payment ID,Status,Amount\npay_Abc123,captured,1400'), { code: 'RAZORPAY_REPORT_COLUMNS_MISSING' });
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\ninvalid,order_Xyz789,captured,1400,INR,,,,,`), { code: 'RAZORPAY_REPORT_PAYMENT_ID_INVALID' });
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\npay_Abc123,order_Xyz789,captured,1400,INR,,,,,\npay_Abc123,order_Xyz789,captured,1400,INR,,,,,`), { code: 'RAZORPAY_REPORT_DUPLICATE_PAYMENT' });
});

test('rejects malformed CSV rows, control characters, and oversized reports', () => {
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\npay_Abc123,order_Xyz789,captured,14.123,INR,,,,,`), { code: 'RAZORPAY_REPORT_AMOUNT_INVALID' });
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\npay_Abc123,order_Xyz789,captured,1400,INR,,,,`), { code: 'RAZORPAY_REPORT_CSV_INVALID' });
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\n\u0000`), { code: 'RAZORPAY_REPORT_CONTROL_CHARS' });
  assert.throws(() => parseRazorpayPaymentsReportCsv(`${header}\npay_Abc123,order_Xyz789,captured,14.00,USD,,,,,`), { code: 'RAZORPAY_REPORT_CURRENCY_UNSUPPORTED' });
  assert.throws(() => parseRazorpayPaymentsReportCsv('x'.repeat(450_001)), { code: 'RAZORPAY_REPORT_TOO_LARGE' });
});

test('report preview proposes only exact captured rows bound to one local attempt and invoice', async () => {
  const db = {
    payment: { findMany: async () => [] },
    razorpayCheckoutAttempt: { findMany: async () => [{
      id: 'attempt_local_1', invoiceId: 'invoice_local_1', amountPaise: 1400n,
      currency: 'INR', mode: 'TEST', status: 'CREATE_FAILED', razorpayOrderId: 'order_Xyz789',
    }] },
    invoice: { findMany: async () => [{
      id: 'invoice_local_1', invoiceNumber: 'INV-LOCAL-1', currency: 'INR',
      balanceDue: 14, status: 'OPEN', voidedAt: null,
    }] },
  };
  const report = await previewRazorpayDashboardPaymentsReport({
    csvText: `${header}\npay_Abc123,order_Xyz789,captured,14.00,INR,+919930367267,private@upi,card_123,private error,private notes`,
    keyId: 'rzp_test_fixture', db,
  });
  assert.equal(report.configuredMode, 'TEST');
  assert.equal(report.exactCandidateRows, 1);
  assert.deepEqual(report.preview[0], {
    rowNumber: 2,
    providerPayment: { id: 'pay_Abc123', orderId: 'order_Xyz789', status: 'captured', amountPaise: '1400', currency: 'INR' },
    classification: 'EXACT_CAPTURED_PAYMENT_CANDIDATE',
    reasonCode: 'REPORT_IDS_AND_CRM_ATTEMPT_MATCH_PROVIDER_VERIFICATION_REQUIRED',
    invoice: { id: 'invoice_local_1', invoiceNumber: 'INV-LOCAL-1', balanceDuePaise: '1400' },
    checkoutAttemptId: 'attempt_local_1',
  });
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(JSON.stringify(report).includes('9930367267'), false);
});

test('report preview never proposes non-captured or amount-mismatched rows for receipt recording', async () => {
  const db = {
    payment: { findMany: async () => [] },
    razorpayCheckoutAttempt: { findMany: async () => [{
      id: 'attempt_local_1', invoiceId: 'invoice_local_1', amountPaise: 1400n,
      currency: 'INR', mode: 'TEST', status: 'CREATE_FAILED', razorpayOrderId: 'order_Xyz789',
    }] },
    invoice: { findMany: async () => [{ id: 'invoice_local_1', invoiceNumber: 'INV-LOCAL-1', currency: 'INR', balanceDue: 14, status: 'OPEN', voidedAt: null }] },
  };
  const nonCaptured = await previewRazorpayDashboardPaymentsReport({ csvText: `${header}\npay_Abc123,order_Xyz789,authorized,14.00,INR,,,,,`, keyId: 'rzp_test_fixture', db });
  assert.equal(nonCaptured.preview[0].classification, 'NOT_CAPTURED_IN_REPORT');
  const mismatch = await previewRazorpayDashboardPaymentsReport({ csvText: `${header}\npay_Abc123,order_Xyz789,captured,15.00,INR,,,,,`, keyId: 'rzp_test_fixture', db });
  assert.equal(mismatch.preview[0].classification, 'UNMATCHED_REVIEW');
  assert.equal(mismatch.preview[0].reasonCode, 'PROVIDER_AMOUNT_MISMATCH');
  assert.equal(mismatch.exactCandidateRows, 0);
});

test('parses documented Razorpay Orders sample fields, zero balances, and never returns raw Notes', () => {
  const csv = 'id,amount,amount_paid,amount_due,currency,receipt,offer_id,status,attempts,notes,created_at\norder_Abc123,12.00,0,0,INR,INV-1,,paid,1,"{""invoice_id"":""invoice_1"",""crm_attempt_id"":""attempt_1"",""private"":""do not expose""}",1727000000';
  const [row] = parseRazorpayOrdersReportCsv(csv);
  assert.deepEqual(row, {
    rowNumber: 2, orderId: 'order_Abc123', status: 'paid', amountPaise: '1200',
    amountPaidPaise: '0', amountDuePaise: '0', attempts: 1, currency: 'INR', receipt: 'INV-1',
    noteInvoiceId: 'invoice_1', noteAttemptId: 'attempt_1',
  });
  assert.equal(JSON.stringify(row).includes('private'), false);
  assert.equal(JSON.stringify(row).includes('do not expose'), false);
});

test('Orders report preview is inventory-only and surfaces only an exact local attempt/reference match', async () => {
  const db = {
    razorpayCheckoutAttempt: { findMany: async () => [{
      id: 'attempt_1', invoiceId: 'invoice_1', amountPaise: 1200n, currency: 'INR', mode: 'TEST', status: 'CREATE_FAILED', razorpayOrderId: 'order_Abc123',
    }] },
    invoice: { findMany: async () => [{ id: 'invoice_1', invoiceNumber: 'INV-1', currency: 'INR', totalAmount: 12, balanceDue: 12, status: 'OPEN', voidedAt: null }] },
  };
  const report = await previewRazorpayDashboardOrdersReport({
    csvText: 'id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\norder_Abc123,12.00,0,12.00,INR,INV-1,created,0,"{""invoice_id"":""invoice_1"",""crm_attempt_id"":""attempt_1""}"',
    keyId: 'rzp_test_fixture', db,
  });
  assert.equal(report.configuredMode, 'TEST');
  assert.equal(report.totalRows, 1);
  assert.equal(report.unpaidOrders, 1);
  assert.equal(report.exactAttemptCandidates, 1);
  assert.equal(report.preview[0].classification, 'EXACT_ORDER_AND_ATTEMPT_CANDIDATE');
  assert.equal(report.preview[0].providerOrder.amountPaise, '1200');
  assert.equal(report.preview[0].providerOrder.amountDuePaise, '1200');
  assert.equal(report.preview[0].providerOrder.attempts, 0);
  assert.equal(report.preview[0].invoice.invoiceNumber, 'INV-1');
  assert.equal(report.preview[0].checkoutAttemptId, 'attempt_1');
  assert.equal(JSON.stringify(report).includes('crm_attempt_id'), false);
});

test('Orders report only marks a current-balance-matched, explicitly unused Order as linkable', async () => {
  const db = {
    razorpayCheckoutAttempt: { findMany: async () => [{
      id: 'attempt_1', invoiceId: 'invoice_1', amountPaise: 1200n, currency: 'INR', mode: 'TEST', status: 'CREATE_FAILED', razorpayOrderId: 'order_Abc123',
    }] },
    invoice: { findMany: async () => [{ id: 'invoice_1', invoiceNumber: 'INV-1', currency: 'INR', totalAmount: 20, balanceDue: 12, status: 'OPEN', voidedAt: null }] },
  };
  const report = (row) => previewRazorpayDashboardOrdersReport({
    csvText: `id,amount,amount_paid,amount_due,currency,receipt,status,attempts\n${row}`,
    keyId: 'rzp_test_fixture', db,
  });
  const unpaid = await report('order_Abc123,12.00,0,12.00,INR,INV-1,created,0');
  assert.equal(unpaid.preview[0].classification, 'EXACT_ORDER_AND_ATTEMPT_CANDIDATE');

  const paid = await report('order_Abc123,12.00,12.00,0,INR,INV-1,paid,1');
  assert.equal(paid.preview[0].classification, 'UNMATCHED_REVIEW');
  assert.equal(paid.preview[0].reasonCode, 'ORDER_NOT_PROVEN_UNUSED');

  const staleTotal = await report('order_Abc123,20.00,0,20.00,INR,INV-1,created,0');
  assert.equal(staleTotal.preview[0].classification, 'UNMATCHED_REVIEW');
  assert.equal(staleTotal.preview[0].reasonCode, 'PROVIDER_AMOUNT_MISMATCH');

  const unknownState = await report('order_Abc123,12.00,,12.00,INR,INV-1,created,0');
  assert.equal(unknownState.preview[0].classification, 'UNMATCHED_REVIEW');
  assert.equal(unknownState.preview[0].reasonCode, 'ORDER_NOT_PROVEN_UNUSED');
});

test('Orders report rejects malformed attempt counts', () => {
  assert.throws(() => parseRazorpayOrdersReportCsv('id,amount,currency,status,attempts\norder_Abc123,12.00,INR,created,-1'), { code: 'RAZORPAY_REPORT_ATTEMPTS_INVALID' });
});

test('Orders reports reject non-INR and malformed money instead of guessing units', () => {
  assert.throws(() => parseRazorpayOrdersReportCsv('id,amount,currency,status\norder_Abc123,12.00,USD,created'), { code: 'RAZORPAY_REPORT_CURRENCY_UNSUPPORTED' });
  assert.throws(() => parseRazorpayOrdersReportCsv('id,amount,amount_paid,currency,status\norder_Abc123,12.00,-1,INR,created'), { code: 'RAZORPAY_REPORT_AMOUNT_INVALID' });
});

test('paired Dashboard reports propose a historical capture only with exact Payment, paid Order, and invoice references', async () => {
  const db = {
    payment: { findMany: async () => [] },
    razorpayCheckoutAttempt: { findMany: async () => [] },
    invoice: { findMany: async () => [{ id: 'invoice_1', invoiceNumber: 'INV-1', currency: 'INR', balanceDue: 14, status: 'OPEN', voidedAt: null }] },
  };
  const paymentsCsvText = 'id,order_id,status,amount,currency,contact,vpa\npay_Abc123,order_Xyz789,captured,14.00,INR,+919930367267,private@upi';
  const ordersCsvText = 'id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\norder_Xyz789,14.00,14.00,0,INR,INV-1,paid,1,"{""invoice_id"":""invoice_1"",""private"":""never expose""}"';
  const report = await previewRazorpayHistoricalPaymentReports({ paymentsCsvText, ordersCsvText, keyId: 'rzp_test_fixture', db });
  assert.equal(report.configuredMode, 'TEST');
  assert.equal(report.candidateRows, 1);
  assert.equal(report.preview[0].classification, 'HISTORICAL_PAYMENT_REPORT_CANDIDATE');
  assert.equal(report.preview[0].invoice.invoiceNumber, 'INV-1');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(JSON.stringify(report).includes('9930367267'), false);
});

test('paired Dashboard reports refuse mismatched Payment and Order amounts', async () => {
  const db = {
    payment: { findMany: async () => [] },
    razorpayCheckoutAttempt: { findMany: async () => [] },
    invoice: { findMany: async () => [{ id: 'invoice_1', invoiceNumber: 'INV-1', currency: 'INR', balanceDue: 15, status: 'OPEN', voidedAt: null }] },
  };
  const paymentsCsvText = 'id,order_id,status,amount,currency\npay_Abc123,order_Xyz789,captured,14.00,INR';
  const ordersCsvText = 'id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\norder_Xyz789,15.00,15.00,0,INR,INV-1,paid,1,"{""invoice_id"":""invoice_1""}"';
  const report = await previewRazorpayHistoricalPaymentReports({ paymentsCsvText, ordersCsvText, keyId: 'rzp_test_fixture', db });
  assert.equal(report.candidateRows, 0);
  assert.equal(report.preview[0].reasonCode, 'PAYMENT_ORDER_AMOUNT_MISMATCH');
  assert.equal(report.preview[0].classification, 'UNMATCHED_REVIEW');
});

test('paired Dashboard reports require current invoice balance and any reported CRM attempt reference to agree', async () => {
  let invoiceBalance = 15;
  let localAttempts = [];
  const db = {
    payment: { findMany: async () => [] },
    razorpayCheckoutAttempt: { findMany: async () => localAttempts },
    invoice: { findMany: async () => [{ id: 'invoice_1', invoiceNumber: 'INV-1', currency: 'INR', balanceDue: invoiceBalance, status: 'OPEN', voidedAt: null }] },
  };
  const paymentsCsvText = 'id,order_id,status,amount,currency\npay_Abc123,order_Xyz789,captured,14.00,INR';
  const orderReport = (notes) => `id,amount,amount_paid,amount_due,currency,receipt,status,attempts,notes\norder_Xyz789,14.00,14.00,0,INR,INV-1,paid,1,"${notes.replaceAll('"', '""')}"`;
  const staleBalance = await previewRazorpayHistoricalPaymentReports({ paymentsCsvText, ordersCsvText: orderReport(''), keyId: 'rzp_test_fixture', db });
  assert.equal(staleBalance.preview[0].reasonCode, 'INVOICE_BALANCE_MISMATCH');

  invoiceBalance = 14;
  localAttempts = [{ id: 'attempt_actual', invoiceId: 'invoice_1', amountPaise: 1400n, currency: 'INR', mode: 'TEST', status: 'REVIEW', razorpayOrderId: 'order_Xyz789', razorpayPaymentId: 'pay_Abc123' }];
  const wrongAttempt = await previewRazorpayHistoricalPaymentReports({
    paymentsCsvText,
    ordersCsvText: orderReport('{"invoice_id":"invoice_1","crm_attempt_id":"attempt_other"}'),
    keyId: 'rzp_test_fixture', db,
  });
  assert.equal(wrongAttempt.preview[0].reasonCode, 'REPORT_ATTEMPT_REFERENCE_MISMATCH');
  assert.equal(wrongAttempt.candidateRows, 0);
});
