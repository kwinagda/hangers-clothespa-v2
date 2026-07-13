const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { expenseSchema, expenseDecisionSchema } = require('../validation/expenses.schemas');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');

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

    const posted = expenses.filter((expense) => expense.status === 'POSTED');
    const total = posted.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = posted.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
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
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          category,
          description,
          amount,
          date: parsedDate,
          paidBy: paidBy || null,
          status: 'PENDING_APPROVAL',
          createdById: req.staff?.id || null,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'EXPENSE_SUBMITTED', resource: 'expense', resourceId: created.id,
        description: `Expense submitted for approval: Rs ${Number(amount).toFixed(2)}`,
        metadata: { category, description, amount, date: parsedDate, paidBy: paidBy || null },
        ...getRequestMeta(req),
      });
      return created;
    });
    return success(res, expense, 'Expense submitted for approval', 201);
  } catch (err) {
    return error(res, 'Failed to add expense');
  }
};

const deleteExpense = async (req, res) => {
  const parsed = expenseDecisionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'A void reason is required');
  try {
    const existingExpense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existingExpense) return notFound(res, 'Expense not found');
    if (existingExpense.status === 'VOIDED') return badRequest(res, 'Expense is already voided');
    const expense = await prisma.$transaction(async (tx) => {
      const voided = await tx.expense.update({
        where: { id: req.params.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: req.staff?.id || null,
          voidReason: parsed.data.reason,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'EXPENSE_VOIDED', resource: 'expense', resourceId: voided.id,
        description: `Expense voided: Rs ${Number(voided.amount).toFixed(2)}`,
        metadata: { beforeStatus: existingExpense.status, afterStatus: 'VOIDED', reason: parsed.data.reason, amount: voided.amount },
        ...getRequestMeta(req),
      });
      return voided;
    });
    return success(res, { expense }, 'Expense voided; record retained');
  } catch (err) {
    return error(res, 'Failed to void expense');
  }
};

const approveExpense = async (req, res) => {
  const parsed = expenseDecisionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'An approval reason is required');
  try {
    const expense = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id: req.params.id } });
      if (!existing) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
      if (existing.status !== 'PENDING_APPROVAL') throw Object.assign(new Error('INVALID_STATUS'), { code: 'INVALID_STATUS' });
      if (existing.createdById === req.staff?.id && req.staff?.role !== 'SUPER_ADMIN') {
        throw Object.assign(new Error('SEPARATION_OF_DUTIES'), { code: 'SEPARATION_OF_DUTIES' });
      }
      const approved = await tx.expense.update({
        where: { id: existing.id },
        data: { status: 'POSTED', approvedById: req.staff?.id || null },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'EXPENSE_APPROVED', resource: 'expense', resourceId: approved.id,
        description: `Expense approved: Rs ${Number(approved.amount).toFixed(2)}`,
        metadata: { reason: parsed.data.reason, creatorId: existing.createdById, approverId: req.staff?.id, superAdminOverride: existing.createdById === req.staff?.id },
        ...getRequestMeta(req),
      });
      return approved;
    }, { isolationLevel: 'Serializable' });
    return success(res, { expense }, 'Expense approved and posted');
  } catch (err) {
    if (err.code === 'NOT_FOUND') return notFound(res, 'Expense not found');
    if (err.code === 'INVALID_STATUS') return badRequest(res, 'Only pending expenses can be approved');
    if (err.code === 'SEPARATION_OF_DUTIES') return badRequest(res, 'A different authorized staff member must approve this expense');
    return error(res, 'Failed to approve expense');
  }
};

module.exports = { getExpenses, addExpense, deleteExpense, approveExpense };
