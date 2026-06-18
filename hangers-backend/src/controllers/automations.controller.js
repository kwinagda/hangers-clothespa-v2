const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { automationSchema } = require('../validation/automations.schemas');

const getAutomations = async (req, res) => {
  try {
    const automations = await prisma.automation.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: automations });
  } catch (err) {
    return error(res, 'Failed to fetch automations');
  }
};

const createAutomation = async (req, res) => {
  try {
    const parsed = automationSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid automation payload');
    const { name, trigger, message, delayHours, channel } = parsed.data;
    const automation = await prisma.automation.create({ data: { name, trigger, message, delayHours, channel } });
    return success(res, automation);
  } catch (err) {
    return error(res, 'Failed to create automation');
  }
};

const toggleAutomation = async (req, res) => {
  try {
    const auto = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!auto) return notFound(res, 'Automation not found');
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data:  { isActive: !auto.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to toggle automation');
  }
};

const updateAutomation = async (req, res) => {
  try {
    const parsed = automationSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid automation payload');
    const { name, trigger, message, delayHours, channel } = parsed.data;
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data:  { name, trigger, message, delayHours, channel }
    });
    return success(res, updated);
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Automation not found');
    return error(res, 'Failed to update automation');
  }
};

module.exports = { getAutomations, createAutomation, toggleAutomation, updateAutomation };
