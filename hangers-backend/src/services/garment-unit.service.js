const normalizeTagPart = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '-');

class GarmentUnitError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'GarmentUnitError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const makeTagNumber = (orderNumber, orderItemId, sequence) =>
  `HNG-${normalizeTagPart(orderNumber)}-${normalizeTagPart(orderItemId).slice(-6)}-${String(sequence).padStart(2, '0')}`;

const syncOrderGarmentUnits = async (tx, orderId, { voidReason = 'ORDER_QUANTITY_REDUCED' } = {}) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      documentType: true,
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          garmentUnits: {
            orderBy: { sequence: 'asc' },
            include: { _count: { select: { challanMovements: true } } },
          },
        },
      },
    },
  });
  if (!order) throw new GarmentUnitError('ORDER_NOT_FOUND', 'Order not found', 404);
  if (order.documentType !== 'ORDER') return [];

  for (const item of order.items) {
    const active = item.garmentUnits.filter((unit) => unit.status !== 'VOID');
    const target = Number(item.quantity || 0);
    if (active.length < target) {
      let nextSequence = item.garmentUnits.reduce((max, unit) => Math.max(max, unit.sequence), 0) + 1;
      for (let index = active.length; index < target; index += 1) {
        await tx.garmentUnit.create({
          data: {
            orderItemId: item.id,
            sequence: nextSequence,
            tagNumber: makeTagNumber(order.orderNumber, item.id, nextSequence),
          },
        });
        nextSequence += 1;
      }
    } else if (active.length > target) {
      const removable = [...active]
        .reverse()
        .filter((unit) => unit.status === 'RECEIVED' && unit._count.challanMovements === 0)
        .slice(0, active.length - target);
      if (removable.length !== active.length - target) {
        throw new GarmentUnitError('GARMENT_QUANTITY_LOCKED', 'Garment quantity cannot be reduced after a unit entered plant custody');
      }
      await tx.garmentUnit.updateMany({
        where: { id: { in: removable.map((unit) => unit.id) } },
        data: { status: 'VOID', voidedAt: new Date(), voidReason, version: { increment: 1 } },
      });
    }
  }

  return tx.garmentUnit.findMany({
    where: { orderItem: { orderId }, status: { not: 'VOID' } },
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
  });
};

module.exports = { GarmentUnitError, makeTagNumber, syncOrderGarmentUnits };
