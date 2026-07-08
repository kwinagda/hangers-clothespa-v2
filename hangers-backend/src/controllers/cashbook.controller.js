const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { cashEntrySchema } = require('../validation/cashbook.schemas');

const CASH_PAYMENT_STATUSES_TO_EXCLUDE = ['FAILED', 'CANCELLED', 'VOID'];

const getCashBook = async (req, res) => {
  try {
    const { date } = req.query;
    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const [manualEntries, cashPayments] = await Promise.all([
      prisma.cashBook.findMany({
        where: { date: { gte: start, lte: end } },
        orderBy: { date: 'asc' }
      }),
      prisma.payment.findMany({
        where: {
          method: 'CASH',
          createdAt: { gte: start, lte: end },
          status: { notIn: CASH_PAYMENT_STATUSES_TO_EXCLUDE },
          order: { documentType: 'ORDER' }
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              customer: { select: { name: true, phone: true } }
            }
          },
          collectedByStaff: { select: { name: true } }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const paymentEntries = cashPayments.map((payment) => ({
      id: `payment:${payment.id}`,
      date: payment.createdAt,
      type: 'IN',
      amount: payment.amount,
      description: [
        'Cash payment',
        payment.order?.orderNumber,
        payment.order?.customer?.name
      ].filter(Boolean).join(' - '),
      staffId: payment.collectedBy || null,
      staffName: payment.collectedByStaff?.name || null,
      source: 'PAYMENT',
      paymentId: payment.id,
      orderNumber: payment.order?.orderNumber || null,
      customerName: payment.order?.customer?.name || null,
      customerPhone: payment.order?.customer?.phone || null
    }));

    const entries = [
      ...manualEntries.map((entry) => ({ ...entry, source: 'MANUAL' })),
      ...paymentEntries
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const manualIn = manualEntries.filter(e => e.type === 'IN' || e.type === 'OPEN').reduce((s, e) => s + e.amount, 0);
    const totalOut = manualEntries.filter(e => e.type === 'OUT' || e.type === 'CLOSE').reduce((s, e) => s + e.amount, 0);
    const cashPaymentIn = paymentEntries.reduce((s, e) => s + e.amount, 0);
    const totalIn = manualIn + cashPaymentIn;

    res.json({
      success: true,
      data: {
        entries,
        manualEntries,
        paymentEntries,
        totalIn,
        totalOut,
        balance: totalIn - totalOut,
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
    const entry = await prisma.cashBook.create({
      data: { type, amount, description, staffId: req.staff?.id }
    });
    return success(res, entry);
  } catch (err) {
    return error(res, 'Failed to add cash book entry');
  }
};

module.exports = { getCashBook, addCashEntry };
