const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { transferCreateSchema, transferStatusSchema } = require('../validation/transfers.schemas');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { PlantPartnerError, requireActivePlantPartner } = require('../services/plant-partner.service');

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
    const transfer = await prisma.$transaction(async (tx) => {
      const [fromPartner, toPartner] = await Promise.all([
        requireActivePlantPartner(tx, fromPlant),
        requireActivePlantPartner(tx, toPlant),
      ]);
      if (fromPartner.id === toPartner.id) throw new Error('SAME_PLANT');
      if (orderId) {
        const order = await tx.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE }, select: { id: true } });
        if (!order) throw new Error('ORDER_NOT_FOUND');
      }
      const created = await tx.transferOrder.create({
        data: {
          fromPlant: fromPartner.code, toPlant: toPartner.code,
          fromPlantPartnerId: fromPartner.id, toPlantPartnerId: toPartner.id,
          orderId, bagCount, notes: notes || null, transferredBy: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_TRANSFER_CREATED', resource: 'transfer_order', resourceId: created.id,
        description: `Transfer created from ${fromPartner.code} to ${toPartner.code}`,
        metadata: { orderId, bagCount, fromPlantPartnerId: fromPartner.id, toPlantPartnerId: toPartner.id },
        ...getRequestMeta(req),
      });
      return created;
    }, { isolationLevel: 'Serializable' });
    return success(res, transfer);
  } catch (err) {
    if (err instanceof PlantPartnerError) return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'SAME_PLANT') return badRequest(res, 'fromPlant and toPlant must be different');
    return error(res, 'Failed to create transfer order');
  }
};

const updateTransferStatus = async (req, res) => {
  try {
    const parsed = transferStatusSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid transfer status payload');
    const { status } = parsed.data;
    const allowed = {
      PENDING: new Set(['IN_TRANSIT', 'CANCELLED']),
      IN_TRANSIT: new Set(['RECEIVED']),
      RECEIVED: new Set(),
      CANCELLED: new Set(),
    };
    const transfer = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM transfer_orders WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.transferOrder.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('TRANSFER_NOT_FOUND');
      if (!allowed[existing.status]?.has(status)) throw new Error('INVALID_TRANSFER_STATUS');
      const updated = await tx.transferOrder.update({
        where: { id: existing.id },
        data: { status, receivedBy: status === 'RECEIVED' ? req.staff.id : undefined },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_TRANSFER_STATUS_CHANGED', resource: 'transfer_order', resourceId: existing.id,
        description: `Transfer ${existing.status} -> ${status}`,
        metadata: { fromStatus: existing.status, toStatus: status, orderId: existing.orderId },
        ...getRequestMeta(req),
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return success(res, transfer);
  } catch (err) {
    if (err.message === 'TRANSFER_NOT_FOUND') return notFound(res, 'Transfer not found');
    if (err.message === 'INVALID_TRANSFER_STATUS') return badRequest(res, 'Invalid transfer status transition');
    return error(res, 'Failed to update transfer status');
  }
};

module.exports = { getTransferOrders, createTransferOrder, updateTransferStatus };
