const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { expenseSchema } = require('../validation/expenses.schemas');

const getExpenses = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month || now.getMonth() + 1);
    const y = parseInt(year || now.getFullYear());

    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);

    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' }
    });

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    res.json({ success: true, data: { expenses, total, byCategory } });
  } catch (err) {
    return error(res, 'Failed to fetch expenses');
  }
};

const addExpense = async (req, res) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid expense payload');
    const { category, description, amount, date, paidBy } = parsed.data;
    const parsedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) return badRequest(res, 'Expense date must be valid');
    const expense = await prisma.expense.create({
      data: { category, description, amount, date: parsedDate, paidBy: paidBy || null }
    });
    return success(res, expense);
  } catch (err) {
    return error(res, 'Failed to add expense');
  }
};

const deleteExpense = async (req, res) => {
  try {
    const existingExpense = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existingExpense) return notFound(res, 'Expense not found');
    await prisma.expense.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Expense deleted');
  } catch (err) {
    return error(res, 'Failed to delete expense');
  }
};

module.exports = { getExpenses, addExpense, deleteExpense };
