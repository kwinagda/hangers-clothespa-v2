const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { cashEntrySchema } = require('../validation/cashbook.schemas');
const { getCapturedPaymentStatusValues } = require('../services/masterData.service');
const { parseBusinessDateBoundary, businessDateKey } = require('../utils/business-time');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');

const getCashBook = async (req, res) => {
  try {
    const { date } = req.query;
    const dateKey = date || businessDateKey(new Date());
    const start = parseBusinessDateBoundary(dateKey, 'start');
    const end = parseBusinessDateBoundary(dateKey, 'end');
    if (!start || !end) return badRequest(res, 'date must use YYYY-MM-DD');

    const capturedPaymentStatuses = await getCapturedPaymentStatusValues();
    const [manualEntries, cashPayments] = await Promise.all([
      prisma.cashBook.findMany({
        where: { date: { gte: start, lte: end } },
        orderBy: { date: 'asc' }
      }),
      prisma.payment.findMany({
        where: {
          method: 'CASH',
          createdAt: { gte: start, lte: end },
          status: { in: capturedPaymentStatuses },
          kind: { in: ['RECEIPT', 'REFUND'] }
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              customer: { select: { name: true, phone: true } }
            }
          },
          customer: { select: { name: true, phone: true } },
          allocations: {
            take: 1,
            include: { invoice: { select: { invoiceNumber: true, sourceType: true, ironBill: { select: { billNumber: true } } } } },
          },
          collectedByStaff: { select: { name: true } }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const paymentEntries = cashPayments.map((payment) => ({
      id: `payment:${payment.id}`,
      date: payment.createdAt,
      type: payment.kind === 'REFUND' ? 'OUT' : 'IN',
      amount: Number(payment.amount),
      description: [
        payment.kind === 'REFUND' ? 'Cash refund' : 'Cash payment',
        payment.order?.orderNumber || payment.allocations[0]?.invoice?.ironBill?.billNumber || payment.allocations[0]?.invoice?.invoiceNumber,
        payment.order?.customer?.name || payment.customer?.name,
      ].filter(Boolean).join(' - '),
      staffId: payment.collectedBy || null,
      staffName: payment.collectedByStaff?.name || null,
      source: 'PAYMENT',
      paymentId: payment.id,
      orderNumber: payment.order?.orderNumber || payment.allocations[0]?.invoice?.ironBill?.billNumber || null,
      invoiceNumber: payment.allocations[0]?.invoice?.invoiceNumber || null,
      customerName: payment.order?.customer?.name || payment.customer?.name || null,
      customerPhone: payment.order?.customer?.phone || payment.customer?.phone || null
    }));

    const entries = [
      ...manualEntries.map((entry) => ({ ...entry, source: 'MANUAL' })),
      ...paymentEntries
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const openingBalance = Number(manualEntries.filter((entry) => entry.type === 'OPEN').at(-1)?.amount || 0);
    const closingCount = manualEntries.filter((entry) => entry.type === 'CLOSE').at(-1)?.amount ?? null;
    const manualIn = manualEntries.filter(e => e.type === 'IN').reduce((s, e) => s + Number(e.amount), 0);
    const manualOut = manualEntries.filter(e => e.type === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
    const cashPaymentIn = paymentEntries.reduce((s, e) => s + (e.type === 'OUT' ? -Number(e.amount) : Number(e.amount)), 0);
    const totalIn = manualIn + Math.max(0, cashPaymentIn);
    const totalOut = manualOut + Math.max(0, -cashPaymentIn);
    const expectedClosing = openingBalance + manualIn + cashPaymentIn - manualOut;

    res.json({
      success: true,
      data: {
        entries,
        manualEntries,
        paymentEntries,
        totalIn,
        totalOut,
        openingBalance,
        closingCount: closingCount === null ? null : Number(closingCount),
        expectedClosing,
        variance: closingCount === null ? null : Number(closingCount) - expectedClosing,
        balance: expectedClosing,
        cashPaymentIn,
        manualIn
      }
    });
  } catch (err) {
    return error(res, 'Failed to fetch cash book');
  }
};

const addCashEntry = async (req, res) => {
  try {
    const parsed = cashEntrySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid cash entry payload');
    const { type, amount, description } = parsed.data;
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.cashBook.create({
        data: { type, amount, description, staffId: req.staff?.id },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'CASHBOOK_ENTRY_CREATED', resource: 'cashbook', resourceId: created.id,
        description: `${type} cash entry recorded for Rs ${Number(amount).toFixed(2)}`,
        metadata: { type, amount, description: description || null },
        ...getRequestMeta(req),
      });
      return created;
    });
    return success(res, entry);
  } catch (err) {
    return error(res, 'Failed to add cash book entry');
  }
};

module.exports = { getCashBook, addCashEntry };
