// ── Challan System Controller ─────────────────────────────────────────────────
// Handles: Challans, ChallanOrders, ChallanItems, VendorPriceList, VendorBills
const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { getOrderWorkflow } = require('../services/masterData.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { emitOrderUpdate } = require('../services/sse.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const { PlantPartnerError, requireActivePlantPartner } = require('../services/plant-partner.service');
const { GarmentUnitError, syncOrderGarmentUnits } = require('../services/garment-unit.service');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

// ── Challan number generator ──────────────────────────────────────────────────
const genChallanNo = (tx = prisma) => nextDocumentNumber({
  tx, documentType: 'DELIVERY_CHALLAN', prefix: 'DINV-', padding: 1,
});

// ── Vendor Bill number generator ──────────────────────────────────────────────
const genBillNo = (tx = prisma) => nextDocumentNumber({
  tx, documentType: 'VENDOR_BILL', prefix: 'VB', padding: 5,
});

const genVendorPaymentNo = (tx = prisma) => nextDocumentNumber({
  tx, documentType: 'VENDOR_PAYMENT', prefix: 'VP', padding: 6,
});

const handlePlantPartnerError = (res, err) => {
  if (!(err instanceof PlantPartnerError)) return false;
  res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  return true;
};

const buildVendorPriceMap = (prices) => {
  const priceMap = {};
  const priceMeta = {};
  const setPrice = (key, value, updatedAt, priority = 0) => {
    if (!key) return;
    const parsedValue = Number(value) || 0;
    const currentValue = Number(priceMap[key]) || 0;
    const currentPriority = Number(priceMeta[key]?.priority || 0);
    const currentUpdatedAt = priceMeta[key] ? new Date(priceMeta[key].updatedAt).getTime() : 0;
    const nextUpdatedAt = updatedAt ? new Date(updatedAt).getTime() : 0;
    const shouldSet =
      priceMap[key] === undefined ||
      priority > currentPriority ||
      (priority === currentPriority && currentValue === 0 && parsedValue > 0) ||
      (priority === currentPriority && parsedValue > 0 && currentValue > 0 && nextUpdatedAt >= currentUpdatedAt);
    if (shouldSet) {
      priceMap[key] = parsedValue;
      priceMeta[key] = { updatedAt: updatedAt || new Date(0), priority };
    }
  };
  prices.forEach((price) => {
    setPrice(price.serviceId, price.costPrice, price.updatedAt, 100);
    getStrictServiceMatchKeys(price.serviceName).forEach((key) => setPrice(key, price.costPrice, price.updatedAt, 80));
  });
  return priceMap;
};

const normalizeServiceKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/\u2014/g, '-')
  .replace(/\(([a-z]{1,4})\s*(?:\/+\s*[a-z]{1,4})?\)/gi, '')
  .replace(/\bnomal\b/g, 'normal')
  .replace(/\blehanga\b/g, 'lehenga')
  .replace(/\s*\/\s*/g, '/')
  .replace(/\s*-\s*/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const getStrictServiceMatchKeys = (value) => {
  const normalized = normalizeServiceKey(value);
  const keys = new Set([String(value || ''), normalized]);
  if (normalized) keys.add(normalized.replace(/[^a-z0-9]/g, ''));
  return [...keys].filter(Boolean);
};

const resolveVendorCost = (priceMap, challanItem) => {
  const keys = [
    challanItem.orderItem?.serviceId,
    ...getStrictServiceMatchKeys(challanItem.serviceName),
    ...getStrictServiceMatchKeys(challanItem.orderItem?.serviceName),
  ].filter(Boolean);
  for (const key of keys) {
    if (priceMap[key] !== undefined) return Number(priceMap[key]) || 0;
  }
  return 0;
};

const recalculateVendorCostsForPlant = async (plant, tx = prisma) => {
  const vendorPrices = await tx.vendorPriceList.findMany({ where: { plant } });
  const priceMap = buildVendorPriceMap(vendorPrices);
  const challans = await tx.deliveryChallan.findMany({
    where: { plant, vendorBillId: null, status: 'DRAFT' },
    include: {
      challanItems: {
        include: {
          orderItem: { select: { serviceId: true, serviceName: true } }
        }
      }
    }
  });

  let challansUpdated = 0;
  let itemsUpdated = 0;
  for (const challan of challans) {
    let totalVendorCost = 0;
    for (const item of challan.challanItems) {
      const vendorCost = resolveVendorCost(priceMap, item);
      totalVendorCost += vendorCost * item.quantity;
      if (item.vendorCost !== vendorCost) {
        await tx.challanItem.update({
          where: { id: item.id },
          data: { vendorCost }
        });
        itemsUpdated += 1;
      }
    }
    if (challan.vendorCost !== totalVendorCost) {
      await tx.deliveryChallan.update({
        where: { id: challan.id },
        data: { vendorCost: totalVendorCost }
      });
      challansUpdated += 1;
    }
  }

  return {
    plant,
    challansChecked: challans.length,
    challansUpdated,
    itemsUpdated,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR PRICE LIST
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/vendor-prices?plant=<plant-code>
const getVendorPrices = async (req, res) => {
  try {
    const { plant } = req.query;
    const where = plant ? { plant } : {};
    const prices = await prisma.vendorPriceList.findMany({
      where,
      orderBy: { serviceName: 'asc' }
    });
    return success(res, prices);
  } catch (e) { return error(res, 'Failed to fetch vendor prices'); }
};

// POST /api/v1/vendor-prices — upsert price for a plant+service
const upsertVendorPrice = async (req, res) => {
  try {
    const { plant, serviceId, serviceName, costPrice } = req.body;
    if (!plant || !serviceName || costPrice === undefined) return badRequest(res, 'plant, serviceName and costPrice required');
    const parsedCost = parseFloat(costPrice);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) return badRequest(res, 'costPrice must be a valid non-negative number');
    const result = await prisma.$transaction(async (tx) => {
      const partner = await requireActivePlantPartner(tx, plant);
      const price = await tx.vendorPriceList.upsert({
        where: { plantPartnerId_serviceId: { plantPartnerId: partner.id, serviceId: serviceId || serviceName } },
        update: { costPrice: parsedCost, serviceName, plant: partner.code },
        create: { plant: partner.code, plantPartnerId: partner.id, serviceId: serviceId || serviceName, serviceName, costPrice: parsedCost }
      });
      const recalculation = await recalculateVendorCostsForPlant(partner.code, tx);
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'VENDOR_RATE_UPSERTED', resource: 'vendor_price', resourceId: price.id,
        description: `${partner.code} vendor rate set for ${serviceName}`,
        metadata: { plantPartnerId: partner.id, serviceId: serviceId || serviceName, costPrice: parsedCost },
        ...getRequestMeta(req),
      });
      return { price, recalculation };
    });
    return success(res, result, 'Vendor price saved');
  } catch (e) {
    if (handlePlantPartnerError(res, e)) return undefined;
    return error(res, 'Failed to save vendor price');
  }
};

// POST /api/v1/vendor-prices/bulk — save multiple prices at once
const bulkUpsertVendorPrices = async (req, res) => {
  try {
    const { plant, prices } = req.body; // prices: [{serviceId, serviceName, costPrice}]
    if (!plant || !prices?.length) return badRequest(res, 'plant and prices array required');
    const invalid = prices.find((p) => !p?.serviceName || !Number.isFinite(parseFloat(p.costPrice)) || parseFloat(p.costPrice) < 0);
    if (invalid) return badRequest(res, 'Each vendor price must include serviceName and a valid non-negative costPrice');
    const result = await prisma.$transaction(async (tx) => {
      const partner = await requireActivePlantPartner(tx, plant);
      const savedPrices = [];
      for (const p of prices) {
        savedPrices.push(await tx.vendorPriceList.upsert({
          where: { plantPartnerId_serviceId: { plantPartnerId: partner.id, serviceId: p.serviceId || p.serviceName } },
          update: { costPrice: parseFloat(p.costPrice), serviceName: p.serviceName, plant: partner.code },
          create: { plant: partner.code, plantPartnerId: partner.id, serviceId: p.serviceId || p.serviceName, serviceName: p.serviceName, costPrice: parseFloat(p.costPrice) }
        }));
      }
      const recalculation = await recalculateVendorCostsForPlant(partner.code, tx);
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'VENDOR_RATES_BULK_UPSERTED', resource: 'plant_partner', resourceId: partner.id,
        description: `${savedPrices.length} vendor rates saved for ${partner.code}`,
        metadata: { serviceIds: savedPrices.map((price) => price.serviceId) },
        ...getRequestMeta(req),
      });
      return { prices: savedPrices, recalculation };
    }, { timeout: 30000 });
    return success(res, result, `${result.prices.length} prices saved`);
  } catch (e) {
    if (handlePlantPartnerError(res, e)) return undefined;
    return error(res, 'Failed to bulk save vendor prices');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHALLANS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/challans
const getChallans = async (req, res) => {
  try {
    const { plant, status } = req.query;
    const where = {};
    if (plant)  where.plant  = plant;
    if (status) where.status = status;

    const challans = await prisma.deliveryChallan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        challanOrders: {
          include: {
            order: {
              select: {
                id: true, orderNumber: true, status: true, totalAmount: true,
                customer: { select: { name: true, phone: true } },
                items: { select: { id: true, serviceName: true, quantity: true, unitPrice: true } }
              }
            }
          }
        },
        challanItems: { include: { garmentUnits: { include: { garmentUnit: true } } } },
        vendorBill: { select: { billNo: true, status: true } }
      }
    });
    return success(res, challans);
  } catch (e) { return error(res, 'Failed to fetch challans'); }
};

// GET /api/v1/challans/:id
const getChallan = async (req, res) => {
  try {
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: {
          include: {
            order: {
              include: {
                customer: { select: { name: true, phone: true, id: true } },
                items: true
              }
            }
          }
        },
        challanItems: {
          include: {
            orderItem: { select: { serviceName: true, quantity: true, unitPrice: true, orderId: true } },
            garmentUnits: { include: { garmentUnit: true }, orderBy: { dispatchedAt: 'asc' } },
          }
        },
        vendorBill: true
      }
    });
    if (!challan) return badRequest(res, 'Challan not found');
    return success(res, challan);
  } catch (e) { return error(res, 'Failed to fetch challan'); }
};

// POST /api/v1/challans — create challan with multiple orders
const createChallan = async (req, res) => {
  try {
    const { plant, orderIds, driverName, vehicleNo, notes } = req.body;
    if (!plant)             return badRequest(res, 'Plant is required');
    if (!orderIds?.length)  return badRequest(res, 'At least one order required');
    const normalizedOrderIds = [...new Set(orderIds.filter(Boolean))];
    if (normalizedOrderIds.length !== orderIds.length) return badRequest(res, 'Duplicate order IDs are not allowed in one challan');

    const orderWorkflow = await getOrderWorkflow();
    const sendableStatuses = new Set(orderWorkflow.challanSendableStatuses || []);
    const result = await prisma.$transaction(async (tx) => {
      const partner = await requireActivePlantPartner(tx, plant);
      for (const id of [...normalizedOrderIds].sort()) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      }
      const orders = await tx.order.findMany({
        where: { id: { in: normalizedOrderIds }, ...ORDER_ONLY_WHERE },
        include: { items: true, customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } } },
      });
      if (orders.length !== normalizedOrderIds.length) throw new Error('ORDER_NOT_FOUND');
      if (orders.some((order) => !sendableStatuses.has(order.status))) throw new Error('ORDER_NOT_SENDABLE');
      for (const order of orders) await syncOrderGarmentUnits(tx, order.id);
      const alreadyLinked = await tx.challanOrder.findFirst({
        where: { orderId: { in: normalizedOrderIds }, status: 'ACTIVE' },
        select: { orderId: true },
      });
      if (alreadyLinked) throw new Error('ACTIVE_CHALLAN_EXISTS');

      const vendorPrices = await tx.vendorPriceList.findMany({ where: { plantPartnerId: partner.id } });
      const priceMap = buildVendorPriceMap(vendorPrices);
      let totalCustomerValue = 0;
      let totalVendorCost = 0;
      const challanItemsData = [];
      const unpriced = [];
      for (const order of orders) {
        totalCustomerValue += Number(order.totalAmount || 0);
        for (const item of order.items) {
          const vendorCost = resolveVendorCost(priceMap, { serviceName: item.serviceName, orderItem: item });
          if (!(vendorCost > 0)) unpriced.push(`${item.serviceName} (${order.orderNumber})`);
          totalVendorCost += vendorCost * item.quantity;
          challanItemsData.push({
            orderItemId: item.id, serviceName: item.serviceName, quantity: item.quantity,
            customerPrice: item.unitPrice, vendorCost, isReceived: false,
          });
        }
      }
      if (unpriced.length) {
        const err = new Error('UNPRICED_VENDOR_SERVICES');
        err.services = [...new Set(unpriced)].slice(0, 20);
        throw err;
      }

      const challanNo = await genChallanNo(tx);
      const c = await tx.deliveryChallan.create({
        data: {
          challanNo,
          plant: partner.code,
          plantPartnerId: partner.id,
          driverName,
          vehicleNo,
          notes,
          status:        'DISPATCHED',
          customerValue: totalCustomerValue,
          vendorCost:    totalVendorCost,
          challanOrders: {
            create: normalizedOrderIds.map(orderId => ({ orderId, status: 'ACTIVE' }))
          },
          challanItems: {
            create: challanItemsData
          }
        },
        include: {
          challanOrders: { include: { order: { select: { orderNumber: true, customer: { select: { name: true } } } } } },
          challanItems: true
        }
      });

      for (const challanItem of c.challanItems) {
        const units = await tx.garmentUnit.findMany({
          where: {
            orderItemId: challanItem.orderItemId,
            status: { in: ['RECEIVED', 'RECEIVED_FROM_PLANT', 'PROCESSING'] },
            currentPlantPartnerId: null,
          },
          orderBy: { sequence: 'asc' },
        });
        if (units.length !== challanItem.quantity) throw new Error('GARMENT_CUSTODY_MISMATCH');
        await tx.challanGarmentUnit.createMany({
          data: units.map((unit) => ({ challanItemId: challanItem.id, garmentUnitId: unit.id })),
        });
        await tx.garmentUnit.updateMany({
          where: { id: { in: units.map((unit) => unit.id) } },
          data: { status: 'AT_PLANT', currentPlantPartnerId: partner.id, version: { increment: 1 } },
        });
      }

      const transitionedOrders = [];
      for (const order of orders) {
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data:  { status: 'SENT_TO_PLANT', version: { increment: 1 } },
          include: {
            customer: true,
            items: true,
          },
        });

        await tx.orderStage.create({
          data: {
            orderId:     order.id,
            stage:       'SENT_TO_PLANT',
            eventType:   'WORKFLOW_TRANSITION',
            fromStatus:  order.status,
            toStatus:    'SENT_TO_PLANT',
            reasonCode:  'PLANT_DISPATCH',
            changedById: req.staff?.id || null,
            notes:       `Sent to ${partner.name} via challan ${challanNo}`,
          },
        });

        transitionedOrders.push({ ...updatedOrder, previousStatus: order.status });
        await writeAuditEvent(tx, {
          actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
          action: 'ORDER_SENT_TO_PLANT', resource: 'order', resourceId: order.id,
          description: `Order ${order.orderNumber}: ${order.status} -> SENT_TO_PLANT via challan ${challanNo}`,
          metadata: { fromStatus: order.status, toStatus: 'SENT_TO_PLANT', challanId: c.id, challanNo, plant: partner.code, plantPartnerId: partner.id },
          ...getRequestMeta(req),
        });
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.ORDER_STATUS, aggregateType: 'order', aggregateId: order.id,
          payload: { status: 'SENT_TO_PLANT' }, dedupeKey: `challan-dispatch:${c.id}:${order.id}`,
        });
      }

      return { challan: c, transitionedOrders };
    }, { isolationLevel: 'Serializable' });

    for (const order of result.transitionedOrders) {
      emitOrderUpdate(order.id, { status: 'SENT_TO_PLANT', orderNumber: order.orderNumber });
    }

    return success(res, result.challan, 'Challan created - orders sent to plant');
  } catch (e) {
    if (handlePlantPartnerError(res, e)) return undefined;
    if (e.message === 'ORDER_NOT_FOUND') return badRequest(res, 'One or more orders were not found');
    if (e.message === 'ORDER_NOT_SENDABLE') return badRequest(res, 'Only received or in-process orders can be sent to a plant');
    if (e.message === 'ACTIVE_CHALLAN_EXISTS' || e.code === 'P2002') return res.status(409).json({ success: false, message: 'One or more orders already belong to an active challan' });
    if (e.message === 'UNPRICED_VENDOR_SERVICES') return badRequest(res, `Vendor rates are required before dispatch: ${e.services.join(', ')}`);
    if (e.message === 'GARMENT_CUSTODY_MISMATCH') return badRequest(res, 'Garment-unit custody does not match the dispatched quantities; resolve voided or issue-held tags first');
    if (e instanceof GarmentUnitError) return badRequest(res, e.message);
    if (e.code === 'P2034') return res.status(409).json({ success: false, message: 'Challan creation conflicted with another dispatch; retry with the same idempotency key' });
    console.error('createChallan error:', e);
    return error(res, 'Failed to create challan');
  }
};

// PATCH /api/v1/challans/:id/status — update challan status
const updateChallanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 'PROCESSED') return badRequest(res, 'Only PROCESSED can be set manually; PARTIAL/RECEIVED are derived from item receipts');
    const challan = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM delivery_challans WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.deliveryChallan.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('CHALLAN_NOT_FOUND');
      if (!['DISPATCHED', 'PARTIAL'].includes(existing.status)) throw new Error('INVALID_CHALLAN_STATUS');
      const updated = await tx.deliveryChallan.update({
        where: { id: existing.id },
        data: { status: 'PROCESSED', processedAt: new Date(), version: { increment: 1 } },
        include: { challanOrders: true },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'CHALLAN_PROCESSED', resource: 'challan', resourceId: existing.id,
        description: `${existing.challanNo} marked processed`,
        metadata: { fromStatus: existing.status, toStatus: 'PROCESSED', version: existing.version + 1 },
        ...getRequestMeta(req),
      });
      return updated;
    }, { isolationLevel: 'Serializable' });

    return success(res, challan, `Challan marked as ${status}`);
  } catch (e) {
    if (e.message === 'CHALLAN_NOT_FOUND') return badRequest(res, 'Challan not found');
    if (e.message === 'INVALID_CHALLAN_STATUS') return badRequest(res, 'Only an active dispatched or partial challan can be marked processed');
    return error(res, 'Failed to update challan status');
  }
};

// PATCH /api/v1/challans/:id/receive-items — mark specific garments as received
const receiveItems = async (req, res) => {
  try {
    const { items, notes } = req.body;
    if (!items?.length) return badRequest(res, 'items array required');
    if (new Set(items.map((item) => item?.id)).size !== items.length) return badRequest(res, 'Duplicate challan item IDs are not allowed');
    const orderWorkflow = await getOrderWorkflow();
    const plantReceivedTarget = orderWorkflow.plantReceivedTarget;
    if (!plantReceivedTarget) return badRequest(res, 'Order workflow plantReceivedTarget is not configured');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM delivery_challans WHERE "id" = ${req.params.id} FOR UPDATE`;
      const challan = await tx.deliveryChallan.findUnique({
        where: { id: req.params.id },
        include: {
          challanOrders: true,
          challanItems: {
            include: {
              orderItem: { select: { orderId: true } },
              garmentUnits: { orderBy: { dispatchedAt: 'asc' } },
            },
          },
          _count: { select: { receipts: true } },
        },
      });
      if (!challan) throw new Error('CHALLAN_NOT_FOUND');
      if (challan.status === 'RECEIVED') throw new Error('CHALLAN_ALREADY_RECEIVED');
      const byId = new Map(challan.challanItems.map((item) => [item.id, item]));
      const changes = items.map((input) => {
        const existing = byId.get(input?.id);
        if (!existing) throw new Error('INVALID_CHALLAN_ITEM');
        const selectedUnitIds = Array.isArray(input?.garmentUnitIds) ? [...new Set(input.garmentUnitIds.filter(Boolean))] : null;
        const movementByUnitId = new Map(existing.garmentUnits.map((movement) => [movement.garmentUnitId, movement]));
        if (selectedUnitIds && selectedUnitIds.some((unitId) => !movementByUnitId.has(unitId))) throw new Error('INVALID_GARMENT_UNIT');
        const previouslyReceivedIds = existing.garmentUnits.filter((movement) => movement.status === 'RECEIVED').map((movement) => movement.garmentUnitId);
        if (selectedUnitIds && previouslyReceivedIds.some((unitId) => !selectedUnitIds.includes(unitId))) throw new Error('INVALID_RECEIVED_QUANTITY');
        const receivedQty = selectedUnitIds ? selectedUnitIds.length : Number(input?.receivedQty);
        if (!Number.isInteger(receivedQty) || receivedQty < existing.receivedQty || receivedQty > existing.quantity) {
          throw new Error('INVALID_RECEIVED_QUANTITY');
        }
        const unitMovementIds = selectedUnitIds
          ? selectedUnitIds.map((unitId) => movementByUnitId.get(unitId)).filter((movement) => movement.status === 'DISPATCHED').map((movement) => movement.id)
          : null;
        return { existing, receivedQty, deltaQty: receivedQty - existing.receivedQty, unitMovementIds };
      }).filter((change) => change.deltaQty > 0);
      if (!changes.length) throw new Error('NO_RECEIPT_CHANGE');

      const receipt = await tx.challanReceipt.create({
        data: {
          challanId: challan.id,
          receiptNo: challan._count.receipts + 1,
          receivedById: req.staff.id,
          notes: notes ? String(notes).trim() : null,
          lines: {
            create: changes.map((change) => ({
              challanItemId: change.existing.id,
              previousQty: change.existing.receivedQty,
              receivedQty: change.receivedQty,
              deltaQty: change.deltaQty,
              discrepancyQty: 0,
            })),
          },
        },
      });
      const nextQuantities = new Map(challan.challanItems.map((item) => [item.id, item.receivedQty]));
      for (const change of changes) {
        nextQuantities.set(change.existing.id, change.receivedQty);
        await tx.challanItem.update({
          where: { id: change.existing.id },
          data: {
            receivedQty: change.receivedQty,
            isReceived: change.receivedQty >= change.existing.quantity,
            receivedAt: new Date(),
          },
        });
        const selectedMovementIds = change.unitMovementIds || change.existing.garmentUnits
          .filter((movement) => movement.status === 'DISPATCHED')
          .slice(0, change.deltaQty)
          .map((movement) => movement.id);
        const unitMovements = change.existing.garmentUnits.filter((movement) => selectedMovementIds.includes(movement.id));
        if (unitMovements.length !== change.deltaQty) throw new Error('GARMENT_RECEIPT_MISMATCH');
        await tx.challanGarmentUnit.updateMany({
          where: { id: { in: unitMovements.map((movement) => movement.id) } },
          data: { status: 'RECEIVED', receivedAt: new Date(), receiptId: receipt.id },
        });
        await tx.garmentUnit.updateMany({
          where: { id: { in: unitMovements.map((movement) => movement.garmentUnitId) } },
          data: { status: 'RECEIVED_FROM_PLANT', currentPlantPartnerId: null, version: { increment: 1 } },
        });
      }

      const transitionedOrderIds = [];
      for (const membership of challan.challanOrders) {
        const orderItems = challan.challanItems.filter((item) => item.orderItem.orderId === membership.orderId);
        const complete = orderItems.length > 0 && orderItems.every((item) => Number(nextQuantities.get(item.id) || 0) >= item.quantity);
        if (!complete) continue;
        const order = await tx.order.findUnique({ where: { id: membership.orderId }, select: { id: true, orderNumber: true, status: true, version: true } });
        if (order?.status === 'SENT_TO_PLANT') {
          await tx.order.update({ where: { id: order.id }, data: { status: plantReceivedTarget, version: { increment: 1 } } });
          await tx.orderStage.create({
            data: {
              orderId: order.id, stage: plantReceivedTarget, eventType: 'WORKFLOW_TRANSITION',
              fromStatus: order.status, toStatus: plantReceivedTarget, reasonCode: 'PLANT_RECEIPT_COMPLETE',
              notes: `All dispatched quantities received on ${challan.challanNo}`, changedById: req.staff.id,
            },
          });
          await writeAuditEvent(tx, {
            actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
            action: 'ORDER_RECEIVED_FROM_PLANT', resource: 'order', resourceId: order.id,
            description: `${order.orderNumber}: ${order.status} -> ${plantReceivedTarget}`,
            metadata: { challanId: challan.id, challanNo: challan.challanNo, receiptId: receipt.id },
            ...getRequestMeta(req),
          });
          await enqueueOutboxEvent(tx, {
            eventType: OUTBOX_EVENT.ORDER_STATUS, aggregateType: 'order', aggregateId: order.id,
            payload: { status: plantReceivedTarget }, dedupeKey: `challan-receipt:${receipt.id}:${order.id}`,
          });
          transitionedOrderIds.push(order.id);
        }
        await tx.challanOrder.update({ where: { id: membership.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      }

      const allReceived = challan.challanItems.every((item) => Number(nextQuantities.get(item.id) || 0) >= item.quantity);
      const anyReceived = challan.challanItems.some((item) => Number(nextQuantities.get(item.id) || 0) > 0);
      const nextStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : challan.status;
      await tx.deliveryChallan.update({
        where: { id: challan.id },
        data: { status: nextStatus, receivedAt: allReceived ? new Date() : null, version: { increment: 1 } },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'CHALLAN_RECEIPT_POSTED', resource: 'challan', resourceId: challan.id,
        description: `${challan.challanNo} receipt ${receipt.receiptNo} posted`,
        metadata: { receiptId: receipt.id, fromStatus: challan.status, toStatus: nextStatus, changes: changes.map((change) => ({ itemId: change.existing.id, previousQty: change.existing.receivedQty, receivedQty: change.receivedQty })) },
        ...getRequestMeta(req),
      });
      return { allReceived, transitionedOrderIds };
    }, { isolationLevel: 'Serializable' });

    const updatedChallan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: { include: { order: { include: { customer: { select: { name: true, phone: true } }, items: true } } } },
        challanItems: true,
        receipts: { include: { lines: true }, orderBy: { receiptNo: 'asc' } },
      },
    });
    for (const orderId of result.transitionedOrderIds) emitOrderUpdate(orderId, { status: plantReceivedTarget });
    return success(res, updatedChallan, result.allReceived ? 'All items received - orders unlocked' : 'Partial receipt posted');
  } catch (e) {
    if (e.message === 'CHALLAN_NOT_FOUND') return badRequest(res, 'Challan not found');
    if (e.message === 'CHALLAN_ALREADY_RECEIVED') return badRequest(res, 'Received challans are immutable; post a correction receipt through the discrepancy workflow');
    if (e.message === 'INVALID_CHALLAN_ITEM') return badRequest(res, 'One or more items do not belong to this challan');
    if (e.message === 'INVALID_GARMENT_UNIT') return badRequest(res, 'One or more garment tags do not belong to this challan item');
    if (e.message === 'INVALID_RECEIVED_QUANTITY') return badRequest(res, 'Received quantity cannot decrease or exceed dispatched quantity');
    if (e.message === 'NO_RECEIPT_CHANGE') return badRequest(res, 'No new received quantity was entered');
    if (e.message === 'GARMENT_RECEIPT_MISMATCH') return badRequest(res, 'Garment-unit receipt records do not match the quantity entered');
    if (e.code === 'P2034') return res.status(409).json({ success: false, message: 'Receipt conflicted with another update; retry with the same idempotency key' });
    console.error('receiveItems error:', e);
    return error(res, 'Failed to receive challan items');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR BILLS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/vendor-bills
const getVendorBills = async (req, res) => {
  try {
    const { plant } = req.query;
    const where = plant ? { plant } : {};
    const bills = await prisma.vendorBill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        challans: {
          select: { id: true, challanNo: true, status: true, vendorCost: true, customerValue: true, createdAt: true }
        }
      }
    });
    return success(res, bills);
  } catch (e) { return error(res, 'Failed to fetch vendor bills'); }
};

// POST /api/v1/vendor-bills — create bill from selected challans
const createVendorBill = async (req, res) => {
  try {
    const { plant, challanIds, notes, vendorInvoiceNo, invoiceDate } = req.body;
    if (!plant)           return badRequest(res, 'Plant is required');
    if (!challanIds?.length) return badRequest(res, 'Select at least one challan');
    const normalizedChallanIds = [...new Set(challanIds.filter(Boolean))];
    if (normalizedChallanIds.length !== challanIds.length) return badRequest(res, 'Duplicate challan IDs are not allowed in one bill');

    const result = await prisma.$transaction(async (tx) => {
      const partner = await requireActivePlantPartner(tx, plant);
      for (const id of [...normalizedChallanIds].sort()) {
        await tx.$queryRaw`SELECT "id" FROM "delivery_challans" WHERE "id" = ${id} FOR UPDATE`;
      }
      const challans = await tx.deliveryChallan.findMany({
        where: { id: { in: normalizedChallanIds }, plantPartnerId: partner.id },
        include: { challanItems: true },
      });
      if (challans.length !== normalizedChallanIds.length) throw new Error('CHALLAN_NOT_FOUND');
      if (challans.some((challan) => !['PARTIAL', 'RECEIVED', 'PROCESSED'].includes(challan.status))) {
        throw new Error('CHALLAN_NOT_RECEIVED');
      }
      if (challans.some((challan) => challan.vendorBillId)) throw new Error('CHALLAN_ALREADY_BILLED');

      const totalAmount = challans.reduce((billTotal, challan) => billTotal + challan.challanItems.reduce((challanTotal, item) => {
        const acceptedQty = Math.min(Number(item.quantity || 0), Number(item.receivedQty || (item.isReceived ? item.quantity : 0)));
        return challanTotal + (Number(item.vendorCost || 0) * acceptedQty);
      }, 0), 0);
      if (!(totalAmount > 0)) throw new Error('NO_ACCEPTED_VENDOR_VALUE');
      const billNo = await genBillNo(tx);
      const normalizedInvoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();
      if (Number.isNaN(normalizedInvoiceDate.getTime())) throw new Error('INVALID_INVOICE_DATE');
      const dueDate = new Date(normalizedInvoiceDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + partner.paymentTermsDays);
      const bill = await tx.vendorBill.create({
        data: {
          billNo,
          vendorInvoiceNo: vendorInvoiceNo ? String(vendorInvoiceNo).trim() : null,
          invoiceDate: normalizedInvoiceDate,
          dueDate,
          plant: partner.code,
          plantPartnerId: partner.id,
          totalAmount,
          notes,
          status: 'PENDING',
          challans: { connect: normalizedChallanIds.map(id => ({ id })) },
        },
        include: {
          challans: {
            select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true },
          },
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'VENDOR_BILL_CREATED', resource: 'vendor_bill', resourceId: bill.id,
        description: `${billNo} created for ${partner.name}`,
        metadata: { plantPartnerId: partner.id, challanIds: normalizedChallanIds, totalAmount, dueDate },
        ...getRequestMeta(req),
      });
      return { bill, totalAmount, billNo };
    }, { isolationLevel: 'Serializable' });

    return success(res, result.bill, `Vendor bill ${result.billNo} created — ${fmt(result.totalAmount)}`);
  } catch (e) {
    if (handlePlantPartnerError(res, e)) return undefined;
    if (e.message === 'CHALLAN_NOT_FOUND') return badRequest(res, 'One or more challans were not found for this plant');
    if (e.message === 'CHALLAN_NOT_RECEIVED') return badRequest(res, 'Only accepted challan quantities can be billed');
    if (e.message === 'CHALLAN_ALREADY_BILLED') return badRequest(res, 'A selected challan is already attached to a bill');
    if (e.message === 'NO_ACCEPTED_VENDOR_VALUE') return badRequest(res, 'Selected challans have no accepted vendor value to bill');
    if (e.message === 'INVALID_INVOICE_DATE') return badRequest(res, 'invoiceDate must be a valid date');
    return error(res, 'Failed to create vendor bill');
  }
};

const approveVendorBill = async (req, res) => {
  try {
    const bill = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM vendor_bills WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.vendorBill.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('BILL_NOT_FOUND');
      if (existing.status !== 'PENDING') throw new Error('BILL_NOT_PENDING');
      const updated = await tx.vendorBill.update({
        where: { id: existing.id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedById: req.staff.id },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'VENDOR_BILL_APPROVED', resource: 'vendor_bill', resourceId: existing.id,
        description: `${existing.billNo} approved for payment`, ...getRequestMeta(req),
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return success(res, bill, 'Vendor bill approved');
  } catch (e) {
    if (e.message === 'BILL_NOT_FOUND') return badRequest(res, 'Bill not found');
    if (e.message === 'BILL_NOT_PENDING') return badRequest(res, 'Only pending vendor bills can be approved');
    return error(res, 'Failed to approve vendor bill');
  }
};

// POST /api/v1/vendor-bills/:id/payments — post an allocated vendor payment
const payVendorBill = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').trim().toUpperCase();
    const allowedMethods = new Set(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER']);
    if (!(amount > 0)) return badRequest(res, 'A positive payment amount is required');
    if (!allowedMethods.has(method)) return badRequest(res, 'A valid vendor payment method is required');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM vendor_bills WHERE "id" = ${req.params.id} FOR UPDATE`;
      const bill = await tx.vendorBill.findUnique({ where: { id: req.params.id } });
      if (!bill) throw new Error('BILL_NOT_FOUND');
      if (!['APPROVED', 'PARTIAL'].includes(bill.status)) throw new Error('BILL_NOT_PAYABLE');
      const balance = Number(bill.totalAmount) - Number(bill.paidAmount);
      if (amount > balance) throw new Error('PAYMENT_EXCEEDS_BALANCE');
      const paymentNo = await genVendorPaymentNo(tx);
      const payment = await tx.vendorPayment.create({
        data: {
          paymentNo, plantPartnerId: bill.plantPartnerId, amount, method,
          reference: req.body.reference ? String(req.body.reference).trim() : null,
          notes: req.body.notes ? String(req.body.notes).trim() : null,
          recordedById: req.staff.id,
          allocations: { create: { vendorBillId: bill.id, amount } },
        },
        include: { allocations: true },
      });
      const paidAmount = Number(bill.paidAmount) + amount;
      const isPaid = paidAmount >= Number(bill.totalAmount);
      const updatedBill = await tx.vendorBill.update({
        where: { id: bill.id },
        data: { paidAmount, status: isPaid ? 'PAID' : 'PARTIAL', paidAt: isPaid ? new Date() : null },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'VENDOR_PAYMENT_POSTED', resource: 'vendor_payment', resourceId: payment.id,
        description: `${paymentNo} allocated to ${bill.billNo}`,
        metadata: { vendorBillId: bill.id, amount, method, reference: payment.reference, resultingStatus: updatedBill.status },
        ...getRequestMeta(req),
      });
      return { payment, bill: updatedBill };
    }, { isolationLevel: 'Serializable' });
    return success(res, result, 'Vendor payment posted');
  } catch (e) {
    if (e.message === 'BILL_NOT_FOUND') return badRequest(res, 'Bill not found');
    if (e.message === 'BILL_NOT_PAYABLE') return badRequest(res, 'Vendor bill must be approved and have an outstanding balance');
    if (e.message === 'PAYMENT_EXCEEDS_BALANCE') return badRequest(res, 'Payment cannot exceed the outstanding vendor bill balance');
    if (e.code === 'P2034') return res.status(409).json({ success: false, message: 'Payment conflicted with another update; retry with the same idempotency key' });
    return error(res, 'Failed to post vendor payment');
  }
};

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;


// ── PDF Generation ────────────────────────────────────────────────────────────
const { generateChallanHTML, generateVendorBillHTML } = require('../services/challan.pdf.service');

const { htmlToPDF } = require('../services/pdf-render.service');

const getChallanPDF = async (req, res) => {
  try {
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: { include: { order: { include: { customer: { select: { name: true, phone: true } }, items: true } } } },
        challanItems: true,
        vendorBill: true
      }
    });
    if (!challan) return badRequest(res, 'Challan not found');
    const html = generateChallanHTML(challan);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${challan.challanNo}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('Failed to generate challan PDF', e);
    return error(res, 'Failed to generate challan PDF');
  }
};

const getVendorBillPDF = async (req, res) => {
  try {
    const bill = await prisma.vendorBill.findUnique({
      where: { id: req.params.id },
      include: { challans: { select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true } } }
    });
    if (!bill) return badRequest(res, 'Bill not found');
    const html = generateVendorBillHTML(bill);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNo}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('Failed to generate vendor bill PDF', e);
    return error(res, 'Failed to generate vendor bill PDF');
  }
};

module.exports = {
  recalculateVendorCostsForPlant,
  // Vendor prices
  getVendorPrices, upsertVendorPrice, bulkUpsertVendorPrices,
  // Challans
  getChallans, getChallan, createChallan, updateChallanStatus, receiveItems,
  // Vendor bills
  getVendorBills, createVendorBill, approveVendorBill, payVendorBill,
  // PDF
  getChallanPDF, getVendorBillPDF,
};
