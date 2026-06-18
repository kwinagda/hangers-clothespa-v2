const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { cashEntrySchema } = require('../validation/cashbook.schemas');

const getCashBook = async (req, res) => {
  try {
    const { date } = req.query;
    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const entries = await prisma.cashBook.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    });

    const totalIn  = entries.filter(e => e.type === 'IN' || e.type === 'OPEN').reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.type === 'OUT' || e.type === 'CLOSE').reduce((s, e) => s + e.amount, 0);

    res.json({ success: true, data: { entries, totalIn, totalOut, balance: totalIn - totalOut } });
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
