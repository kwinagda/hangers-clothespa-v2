const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { transferCreateSchema, transferStatusSchema } = require('../validation/transfers.schemas');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const getTransferOrders = async (req, res) => {
  try {
    const transfers = await prisma.transferOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: transfers });
  } catch (err) {
    return error(res, 'Failed to fetch transfer orders');
  }
};

const createTransferOrder = async (req, res) => {
  try {
    const parsed = transferCreateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid transfer payload');
    const { fromPlant, toPlant, orderId, bagCount, notes } = parsed.data;
    if (fromPlant === toPlant) return badRequest(res, 'fromPlant and toPlant must be different');
    if (orderId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE }, select: { id: true } });
      if (!order) return notFound(res, 'Order not found');
    }
    const transfer = await prisma.transferOrder.create({
      data: { fromPlant, toPlant, orderId, bagCount, notes: notes || null, transferredBy: req.staff?.id }
    });
    return success(res, transfer);
  } catch (err) {
    return error(res, 'Failed to create transfer order');
  }
};

const updateTransferStatus = async (req, res) => {
  try {
    const parsed = transferStatusSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid transfer status payload');
    const { status } = parsed.data;
    const existingTransfer = await prisma.transferOrder.findUnique({ where: { id: req.params.id } });
    if (!existingTransfer) return notFound(res, 'Transfer not found');
    if (existingTransfer.status === 'RECEIVED' && status !== 'RECEIVED') {
      return badRequest(res, 'Received transfers cannot move back to an earlier status');
    }
    const transfer = await prisma.transferOrder.update({
      where: { id: req.params.id },
      data:  { status, receivedBy: status === 'RECEIVED' ? req.staff?.id : undefined }
    });
    return success(res, transfer);
  } catch (err) {
    return error(res, 'Failed to update transfer status');
  }
};

module.exports = { getTransferOrders, createTransferOrder, updateTransferStatus };
