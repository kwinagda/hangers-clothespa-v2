const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { upchargeSchema } = require('../validation/upcharges.schemas');

const getUpcharges = async (req, res) => {
  try {
    const upcharges = await prisma.upcharge.findMany({ where: { isActive: true } });
    res.json({ success: true, data: upcharges });
  } catch (err) {
    return error(res, 'Failed to fetch upcharges');
  }
};

const createUpcharge = async (req, res) => {
  try {
    const parsed = upchargeSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid upcharge payload');
    const { name, type, value } = parsed.data;
    const upcharge = await prisma.upcharge.create({ data: { name, type, value } });
    return success(res, upcharge);
  } catch (err) {
    return error(res, 'Failed to create upcharge');
  }
};

module.exports = { getUpcharges, createUpcharge };
