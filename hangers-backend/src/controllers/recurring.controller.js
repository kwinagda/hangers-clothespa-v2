const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { recurringPickupSchema } = require('../validation/recurring.schemas');

const getRecurringPickups = async (req, res) => {
  try {
    const pickups = await prisma.recurringPickup.findMany({
      orderBy: [{ isActive: 'desc' }, { nextPickup: 'asc' }]
    });
    res.json({ success: true, data: pickups });
  } catch (err) {
    return error(res, 'Failed to fetch recurring pickups');
  }
};

const createRecurringPickup = async (req, res) => {
  try {
    const parsed = recurringPickupSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid recurring pickup payload');
    const { customerId, frequency, dayOfWeek, dayOfMonth, address, notes } = parsed.data;
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, isActive: true } });
    if (!customer?.isActive) return badRequest(res, 'Customer not found or inactive');
    if (frequency === 'WEEKLY' && (dayOfWeek === undefined || dayOfWeek === null)) {
      return badRequest(res, 'dayOfWeek must be provided for weekly pickups');
    }
    if (frequency === 'MONTHLY' && (dayOfMonth === undefined || dayOfMonth === null)) {
      return badRequest(res, 'dayOfMonth must be provided for monthly pickups');
    }
    const pickup = await prisma.recurringPickup.create({
      data: { customerId, frequency, dayOfWeek: dayOfWeek ?? null, dayOfMonth: dayOfMonth ?? null, address, notes: notes || null }
    });
    return success(res, pickup);
  } catch (err) {
    return error(res, 'Failed to create recurring pickup');
  }
};

const toggleRecurringPickup = async (req, res) => {
  try {
    const pickup = await prisma.recurringPickup.findUnique({ where: { id: req.params.id } });
    if (!pickup) return notFound(res, 'Recurring pickup not found');
    const updated = await prisma.recurringPickup.update({
      where: { id: req.params.id },
      data:  { isActive: !pickup.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to toggle recurring pickup');
  }
};

module.exports = { getRecurringPickups, createRecurringPickup, toggleRecurringPickup };
