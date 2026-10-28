// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS CONTROLLER — Record, update, and track payments for orders
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { success, created } = require('../utils/response');
const { recordPaymentSchema, recordReceivablesPaymentSchema } = require('../validation/finance.schemas');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { getCapturedPaymentStatusValues, getCorePaymentMethods } = require('../services/masterData.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { PaymentRuleError, recordOrderSettlement, recordInvoiceAllocationsSettlement } = require('../services/payment.service');
const { ensureOrderInvoice } = require('../services/billing.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const { createPublicShareToken } = require('../services/publicShare.service');
const { getDefaultPaymentAccount, getPaymentAccountQrMediaUrl } = require('../services/payment-account-settings.service');
const { findOpenReceivableInvoices, groupReceivablesByCustomer, openInvoiceWhere, allocateReceivablePayment } = require('../services/receivables.service');
const { sendPaymentReminderMessage } = require('../services/whatomate.service');
const { paymentApiError, validationFieldErrors } = require('../utils/payment-api-error');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

// ── POST /api/v1/payments — Record a payment for an order ─────────────────────
const recordPayment = async (req, res) => {
  try {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) return paymentApiError(res, {
      statusCode: 400, code: 'PAYMENT_VALIDATION_FAILED', message: parsed.error.issues[0]?.message || 'Invalid payment payload',
      requestId: req.id, fieldErrors: validationFieldErrors(parsed.error.issues),
    });
    const { orderId, amount, method, reference, notes, effectiveAt } = parsed.data;
    const normalizedMethod = normalizePaymentMethod(method);
    const corePaymentMethods = await getCorePaymentMethods();
    if (!corePaymentMethods.includes(normalizedMethod)) {
      return paymentApiError(res, { statusCode: 400, code: 'PAYMENT_METHOD_UNSUPPORTED', message: `Payment method must be one of: ${corePaymentMethods.join(', ')}`, requestId: req.id });
    }
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE } });
      if (!before) throw new PaymentRuleError('ORDER_NOT_FOUND', 'Order not found', 404);
      const settlement = await recordOrderSettlement(tx, {
        orderId,
        amount,
        method: normalizedMethod,
        reference,
        notes,
        effectiveAt,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'PAYMENT_RECORDED',
        resource: 'order',
        resourceId: orderId,
        description: `Payment recorded for ${before.orderNumber}`,
        metadata: {
          orderNumber: before.orderNumber,
          paymentIds: settlement.payments.map((payment) => payment.id),
          method: normalizedMethod,
          reference: reference || null,
          effectiveAt: effectiveAt?.toISOString() || null,
          before: { paidAmount: before.paidAmount, paymentStatus: before.paymentStatus },
          after: {
            paidAmount: settlement.paidAmount,
            paymentStatus: settlement.paymentStatus,
            balanceDue: settlement.balanceDue,
          },
        },
        ...getRequestMeta(req),
      });
      for (const payment of settlement.payments) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.PAYMENT_RECEIVED,
          aggregateType: 'order',
          aggregateId: orderId,
          payload: { paymentId: payment.id },
          dedupeKey: `payment-received:${payment.id}`,
        });
      }
      if (settlement.paymentStatus === 'PAID') {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.REFERRAL_QUALIFY,
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {},
          dedupeKey: `referral-qualify:${orderId}:paid-v${order.version}`,
        });
      }
      return { order, settlement };
    }, { isolationLevel: 'Serializable' });

    const payment = result.settlement.payments[0];

    created(res, {
      payment,
      paidAmount: result.settlement.paidAmount,
      paymentStatus: result.settlement.paymentStatus,
      balance: result.settlement.balanceDue,
    }, 'Payment recorded successfully');

  } catch (err) {
    console.error('recordPayment:', err);
    if (err instanceof PaymentRuleError) {
      return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id, details: err.details });
    }
    if (err?.code === 'P2034') return paymentApiError(res, { statusCode: 409, code: 'PAYMENT_CONCURRENT_CONFLICT', message: 'Payment conflicted with another update; retry with the same idempotency key', requestId: req.id, retryable: true });
    return paymentApiError(res, { code: 'PAYMENT_RECORD_FAILED', message: 'Failed to record payment', requestId: req.id });
  }
};

// ── GET /api/v1/payments/order/:orderId — All payments for an order ───────────
const getOrderPayments = async (req, res) => {
  try {
    const { orderId } = req.params;
    const payments = await prisma.payment.findMany({
      where: { OR: [{ orderId }, { allocations: { some: { orderId, status: 'POSTED' } } }] },
      include: { collectedByStaff: { select: { name: true } }, allocations: { where: { orderId, status: 'POSTED' } } },
      orderBy: { createdAt: 'asc' },
    });
    return success(res, { payments: payments.map((payment) => payment.orderId === orderId ? payment : {
      ...payment,
      totalPaymentAmount: payment.amount,
      amount: payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0),
    }) });
  } catch (err) {
    return paymentApiError(res, { code: 'PAYMENT_HISTORY_LOAD_FAILED', message: 'Failed to fetch payments', requestId: req.id });
  }
};

// ── GET /api/v1/payments/daily — Daily cash register summary ─────────────────
const getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const day   = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) return paymentApiError(res, { statusCode: 400, code: 'PAYMENT_REPORT_DATE_INVALID', message: 'date must be valid', requestId: req.id });
    const start = new Date(day.setHours(0, 0, 0, 0));
    const end   = new Date(day.setHours(23, 59, 59, 999));

    const capturedStatuses = await getCapturedPaymentStatusValues();
    const payments = await prisma.payment.findMany({
      where:   { createdAt: { gte: start, lte: end }, status: { in: capturedStatuses } },
      include: {
        order:            { select: { orderNumber: true, customer: { select: { name: true, phone: true } } } },
        customer:         { select: { name: true, phone: true } },
        allocations:      { include: { invoice: { select: { invoiceNumber: true, sourceType: true, ironBillId: true, serviceAppointmentId: true, ironBill: { select: { billNumber: true } }, serviceAppointment: { select: { appointmentNumber: true } } } } } },
        collectedByStaff: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paymentMethod = (payment) => normalizePaymentMethod(payment.method || payment.mode);
    const normalizedPayments = payments.map((payment) => ({
      ...payment,
      method: paymentMethod(payment),
      signedAmount: payment.kind === 'REFUND' ? -Number(payment.amount || 0) : Number(payment.amount || 0),
    }));
    const byMethod = normalizedPayments.reduce((acc, payment) => {
      acc[payment.method] = Number(((acc[payment.method] || 0) + payment.signedAmount).toFixed(2));
      return acc;
    }, {});
    const summary = {
      total:  normalizedPayments.reduce((s, p) => s + p.signedAmount, 0),
      byMethod,
      count:  normalizedPayments.length,
    };

    return success(res, { summary, payments: normalizedPayments });
  } catch (err) {
    return paymentApiError(res, { code: 'PAYMENT_DAILY_SUMMARY_FAILED', message: 'Failed to fetch daily summary', requestId: req.id });
  }
};

// ── GET /api/v1/payments/receivables — Outstanding balances ──────────────────
const getReceivables = async (req, res) => {
  try {
    const receivables = await findOpenReceivableInvoices();
    const now = new Date();
    const ledger = receivables.map((invoice) => ({
      ...invoice,
      id: invoice.sourceId,
      orderNumber: invoice.sourceNumber,
      paymentStatus: Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
      daysOverdue: Math.max(0, Math.floor((now - new Date(invoice.dueDate)) / 86400000)),
      isOverdue: new Date(invoice.dueDate) < now,
    }));

    const total = ledger.reduce((sum, invoice) => sum + invoice.balance, 0);

    return success(res, {
      total,
      orders: ledger,
      receivables: ledger,
      customerGroups: groupReceivablesByCustomer(ledger),
    });
  } catch (err) {
    return paymentApiError(res, { code: 'PAYMENT_RECEIVABLES_LOAD_FAILED', message: 'Failed to fetch receivables', requestId: req.id });
  }
};

const selectedReceivableSummary = async ({ customerId, invoiceIds = [] }) => {
  const selectedIds = Array.isArray(invoiceIds) ? invoiceIds.map(String).filter(Boolean) : [];
  if (!customerId) throw new PaymentRuleError('CUSTOMER_REQUIRED', 'Customer is required');
  const receivables = (await findOpenReceivableInvoices({ customerId }))
    .filter((invoice) => !selectedIds.length || selectedIds.includes(invoice.invoiceId));
  if (!receivables.length) throw new PaymentRuleError('NO_OUTSTANDING_BALANCE', 'No outstanding selected bills/orders found');
  const customer = receivables[0].customer;
  const outstandingAmount = Number(receivables.reduce((sum, invoice) => sum + Number(invoice.balanceDue || invoice.balance || 0), 0).toFixed(2));
  const buttonSlug = await createPublicShareToken({
    resourceType: 'CUSTOMER',
    resourceId: customerId,
    purpose: 'INVOICE_VIEW',
  });
  const { account } = await getDefaultPaymentAccount();
  const paymentSettings = account ? { ...account, qrMediaUrl: getPaymentAccountQrMediaUrl(account) } : null;
  return {
    customer,
    receivables,
    reminder: {
      mode: 'OUTSTANDING_SUMMARY',
      customer,
      outstandingOrderCount: receivables.length,
      outstandingAmount,
      orderNumbers: receivables.map((invoice) => invoice.sourceNumber).filter(Boolean),
      buttonSlug,
      paymentSettings,
    },
  };
};

const previewReceivablesReminder = async (req, res) => {
  try {
    const { customerId, invoiceIds = [] } = req.body || {};
    const { customer, receivables, reminder } = await selectedReceivableSummary({ customerId, invoiceIds });
    return success(res, {
      title: 'Outstanding summary',
      customer,
      receivables,
      body: [
        `Hi ${customer?.name || 'Customer'},`,
        '',
        'This is a payment reminder from Hangers Clothes Spa.',
        `Selected bills/orders: ${reminder.outstandingOrderCount}`,
        `Total outstanding: Rs ${reminder.outstandingAmount.toFixed(2)}`,
        '',
        'You can pay using:',
        `UPI ID: ${reminder.paymentSettings?.vpa || ''}`,
        `GPay: ${reminder.paymentSettings?.gpayNumber || ''}`,
        '',
        'Please use the payment link button to view payment details.',
      ].join('\n'),
      paymentAccount: reminder.paymentSettings,
      qrImage: reminder.paymentSettings?.qrMediaUrl || reminder.paymentSettings?.qrImageUrl || reminder.paymentSettings?.qrImageDataUrl || '',
      source: 'DB',
    });
  } catch (err) {
    if (err instanceof PaymentRuleError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id });
    console.error('previewReceivablesReminder error:', err);
    return paymentApiError(res, { code: 'PAYMENT_REMINDER_PREVIEW_FAILED', message: 'Failed to preview receivables reminder', requestId: req.id });
  }
};

const sendReceivablesReminder = async (req, res) => {
  try {
    const { customerId, invoiceIds = [] } = req.body || {};
    const { customer, receivables, reminder } = await selectedReceivableSummary({ customerId, invoiceIds });
    if (customer?.notifWhatsApp === false) return paymentApiError(res, { statusCode: 409, code: 'PAYMENT_REMINDER_DISABLED', message: 'Customer WhatsApp notifications are disabled', requestId: req.id });
    const sent = await sendPaymentReminderMessage({ id: `customer-${customerId}`, customer }, reminder, {
      idempotencyKey: `ar-payment-reminder:${customerId}:${receivables.map((invoice) => invoice.invoiceId).join('-')}:${Date.now()}`,
      throwOnFailure: true,
    });
    if (!sent) throw new Error('WhatsApp provider did not accept the message');
    return success(res, { sent: true, receivables }, 'Outstanding payment summary sent on WhatsApp');
  } catch (err) {
    if (err instanceof PaymentRuleError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id });
    console.error('sendReceivablesReminder error:', err);
    return paymentApiError(res, { code: 'PAYMENT_REMINDER_SEND_FAILED', message: 'Failed to send receivables reminder', requestId: req.id, retryable: false, action: 'CHECK_DELIVERY_STATUS' });
  }
};

const createInvoiceShareLink = async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: String(req.params.invoiceId || ''), status: { not: 'VOID' } },
      select: { id: true, invoiceNumber: true },
    });
    if (!invoice) return paymentApiError(res, { statusCode: 404, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found', requestId: req.id });
    const slug = await createPublicShareToken({ resourceType: 'INVOICE', resourceId: invoice.id, purpose: 'INVOICE_VIEW' });
    if (!slug) return paymentApiError(res, { code: 'INVOICE_SHARE_CREATE_FAILED', message: 'Failed to create invoice link', requestId: req.id });
    return success(res, { invoiceNumber: invoice.invoiceNumber, slug, path: `/invoice/${slug}` });
  } catch (err) {
    console.error('createInvoiceShareLink error:', err);
    return paymentApiError(res, { code: 'INVOICE_SHARE_CREATE_FAILED', message: 'Failed to create invoice link', requestId: req.id });
  }
};

const recordReceivablesPayment = async (req, res) => {
  const parsed = recordReceivablesPaymentSchema.safeParse(req.body);
  if (!parsed.success) return paymentApiError(res, { statusCode: 400, code: 'PAYMENT_VALIDATION_FAILED', message: parsed.error.issues[0]?.message || 'Invalid payment', requestId: req.id });
  try {
    const { customerId, invoiceIds, orderIds, amount, method, effectiveAt, reference, notes } = parsed.data;
    const normalizedMethod = normalizePaymentMethod(method);
    if (!(await getCorePaymentMethods()).includes(normalizedMethod)) throw new PaymentRuleError('PAYMENT_METHOD_UNSUPPORTED', 'Select a supported manual payment method');
    const result = await prisma.$transaction(async (tx) => {
      if (orderIds) {
        const orders = await tx.order.findMany({ where: { id: { in: orderIds }, customerId, documentType: 'ORDER', status: { notIn: ['CANCELLED', 'RETURNED'] } }, select: { id: true } });
        if (orders.length !== orderIds.length) throw new PaymentRuleError('ORDER_NOT_COLLECTIBLE', 'Some orders are cancelled or belong to another customer. Refresh orders.', 409);
        for (const orderId of [...orderIds].sort()) await ensureOrderInvoice(tx, orderId, req.staff?.id);
      }
      const invoices = await tx.invoice.findMany({ where: { ...openInvoiceWhere, customerId, ...(invoiceIds ? { id: { in: invoiceIds } } : { orderId: { in: orderIds } }) } });
      if (invoices.length !== (invoiceIds || orderIds).length) throw new PaymentRuleError('INVOICE_NOT_COLLECTIBLE', 'Some invoices are closed, cancelled or belong to another customer. Refresh receivables.', 409);
      let allocations;
      try { allocations = allocateReceivablePayment(invoices, amount); }
      catch (error) { throw new PaymentRuleError('INVALID_ALLOCATION_PLAN', error.message, 409); }
      const settlement = await recordInvoiceAllocationsSettlement(tx, {
        allocations, expectedCustomerId: customerId, expectedCurrency: 'INR',
        amount,
        method: normalizedMethod, reference, notes, effectiveAt, staff: req.staff,
        idempotencyKey: req.idempotencyKey, allowPartial: true,
      });
      await writeAuditEvent(tx, { actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'PAYMENT_RECORDED', resource: 'customer', resourceId: customerId,
        description: `Payment recorded across ${allocations.length} invoices`,
        metadata: { allocations, paymentIds: [settlement.payment.id], effectiveAt: effectiveAt?.toISOString() || null, reference: reference || null }, ...getRequestMeta(req) });
      await enqueueOutboxEvent(tx, { eventType: OUTBOX_EVENT.INVOICE_PAYMENT_RECEIVED, aggregateType: 'invoice', aggregateId: settlement.invoice.id,
        payload: { paymentId: settlement.payment.id }, dedupeKey: `payment-received:${settlement.payment.id}` });
      return { payment: settlement.payment, invoiceCount: allocations.length };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    return created(res, result, 'Selected invoice payments recorded');
  } catch (err) {
    return paymentApiError(res, { statusCode: err.statusCode || 500, code: err.code || 'PAYMENT_RECORD_FAILED', message: err instanceof PaymentRuleError ? err.message : 'No payments were recorded. Refresh and try again.', requestId: req.id });
  }
};

module.exports = { recordPayment, recordReceivablesPayment, getOrderPayments, getDailySummary, getReceivables, previewReceivablesReminder, sendReceivablesReminder, createInvoiceShareLink };
