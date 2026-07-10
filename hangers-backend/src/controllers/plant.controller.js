// ─────────────────────────────────────────────────────────────────────────────
// PLANT CONTROLLER — Plant app operations
// GET  /api/v1/plant/dashboard         → Counts by stage
// GET  /api/v1/plant/orders            → Orders at plant (paginated)
// GET  /api/v1/plant/scan/:qrCode      → Look up order by QR tag
// GET  /api/v1/plant/orders/:id        → Full order details
// POST /api/v1/plant/orders/:id/stage  → Update processing stage
// POST /api/v1/plant/orders/:id/flag   → Flag an issue
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound } = require('../utils/response');
const { getOrderStatuses, getOrderWorkflow } = require('../services/masterData.service');

const PLANT_ISSUE_TYPES = new Set(['MISSING_ITEM', 'DAMAGE', 'STAIN_NOT_REMOVED', 'WRONG_ITEM', 'OTHER']);
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const statusLabelsFrom = (statuses) => statuses.reduce((acc, status) => {
  acc[status.key] = status.plantLabel || status.label || status.key;
  return acc;
}, {});
const plantStatusKeysFrom = (statuses, workflow) =>
  (workflow.plantLockedStatuses || statuses.filter((status) => status.plantManaged).map((status) => status.key));

const getPlantDashboard = async (req, res) => {
  try {
    const orderWorkflow = await getOrderWorkflow();
    const workflowViews = orderWorkflow.views || {};
    const inProcessStatuses = workflowViews.in_process?.statuses || [];
    const readyStatuses = workflowViews.ready?.statuses || [];
    const plantStatuses = orderWorkflow.plantLockedStatuses || [];
    const plantReceivedTarget = orderWorkflow.plantReceivedTarget;
    const [pending, sentToPlant, ironing, ready, todayDone] =
      await Promise.all([
        prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: inProcessStatuses } } }),
        prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: plantStatuses } } }),
        prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: plantReceivedTarget || '__UNCONFIGURED__' } }),
        prisma.order.count({ where: { ...ORDER_ONLY_WHERE, status: { in: readyStatuses } } }),
        prisma.order.count({
          where: {
            ...ORDER_ONLY_WHERE,
            status: { in: readyStatuses },
            updatedAt: { gte: new Date(new Date().setHours(0,0,0,0)) },
          },
        }),
      ]);

    const atPlant = sentToPlant;

    return success(res, {
      dashboard: {
        pending, atPlant, sentToPlant, ironing,
        ready, todayDone,
        total: pending + atPlant + ready,
      },
    });
  } catch (err) {
    return error(res, 'Failed to load dashboard');
  }
};

const getPlantOrders = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  if (!Number.isInteger(parsedPage) || parsedPage <= 0) return badRequest(res, 'page must be a positive integer');
  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) return badRequest(res, 'limit must be an integer between 1 and 100');
  const skip = (parsedPage - 1) * parsedLimit;
  const [orderStatuses, orderWorkflow] = await Promise.all([getOrderStatuses(), getOrderWorkflow()]);
  const statusLabels = statusLabelsFrom(orderStatuses);
  const plantStatusKeys = plantStatusKeysFrom(orderStatuses, orderWorkflow);
  if (status && !plantStatusKeys.includes(String(status).trim().toUpperCase())) return badRequest(res, 'Invalid plant status filter');

  const where = status
    ? { ...ORDER_ONLY_WHERE, status: String(status).trim().toUpperCase() }
    : { ...ORDER_ONLY_WHERE, status: { in: plantStatusKeys } };

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          items:    { select: { serviceName: true, garmentType: true, quantity: true } },
        },
        orderBy: { updatedAt: 'asc' },
        skip,
        take: parsedLimit,
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      orders: orders.map(o => ({
        id: o.id, orderNumber: o.orderNumber, status: o.status,
        statusLabel: statusLabels[o.status] || o.status,
        customer:    { name: o.customer?.name, phone: o.customer?.phone },
        items:       o.items,
        totalItems:  o.items.reduce((s, i) => s + i.quantity, 0),
        notes:       o.notes,
        updatedAt:   o.updatedAt,
      })),
      total,
      page: parsedPage,
    });
  } catch (err) {
    return error(res, 'Failed to load orders');
  }
};

// Scan QR tag — format: "HNG-XXXXX-1" or "HNG-XXXXX-BAG-1"
const scanQRCode = async (req, res) => {
  const { qrCode } = req.params;
  if (!qrCode) return badRequest(res, 'QR code is required');

  try {
    // Extract order number from QR — strip "-1", "-2", "-BAG-1" suffixes
    const orderNumber = qrCode
      .replace(/-BAG-\d+$/i, '')
      .replace(/-\d+$/, '')
      .toUpperCase();

    const order = await prisma.order.findFirst({
      where: { orderNumber, ...ORDER_ONLY_WHERE },
      include: {
        customer: { select: { name: true, phone: true } },
        items:    true,
        stages:   { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!order) return notFound(res, `No order found for QR: ${qrCode}`);

    const isBagTag = /BAG/i.test(qrCode);
    const itemIndex = !isBagTag
      ? (parseInt(qrCode.match(/-(\d+)$/)?.[1] || '1')) - 1
      : null;

    const orderStatuses = await getOrderStatuses();
    const statusLabels = statusLabelsFrom(orderStatuses);
    return success(res, {
      order: {
        id: order.id, orderNumber: order.orderNumber, status: order.status,
        statusLabel: statusLabels[order.status] || order.status,
        customer:   { name: order.customer?.name, phone: order.customer?.phone },
        items:       order.items,
        stages:      order.stages,
        totalItems:  order.items.reduce((s, i) => s + i.quantity, 0),
        notes:       order.notes,
        scannedItem: itemIndex !== null ? order.items[itemIndex] || null : null,
        scanType:    isBagTag ? 'bag' : 'garment',
        qrCode,
      },
    });
  } catch (err) {
    return error(res, 'Scan failed. Try again.');
  }
};

const getPlantOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, ...ORDER_ONLY_WHERE },
      include: {
        customer: { select: { name: true, phone: true } },
        items:    true,
        stages:   { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) return notFound(res, 'Order not found');

    const orderStatuses = await getOrderStatuses();
    const statusLabels = statusLabelsFrom(orderStatuses);
    return success(res, {
      order: {
        ...order,
        statusLabel: statusLabels[order.status] || order.status,
        totalItems:  order.items.reduce((s, i) => s + i.quantity, 0),
      },
    });
  } catch (err) {
    return error(res, 'Failed to load order');
  }
};

const updatePlantStage = async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!status) return badRequest(res, 'Status is required');

  const [orderWorkflow, orderStatuses] = await Promise.all([getOrderWorkflow(), getOrderStatuses()]);
  const statusLabels = statusLabelsFrom(orderStatuses);
  const plantLockedStatus = (orderWorkflow.plantLockedStatuses || [])[0];
  const ALLOWED = plantLockedStatus ? (orderWorkflow.allowedForward?.[plantLockedStatus] || []) : [];
  if (!ALLOWED.includes(status)) {
    return badRequest(res, `Plant can only set: ${ALLOWED.join(', ')}`);
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id, ...ORDER_ONLY_WHERE },
      include: {
        customer: { select: { name: true, phone: true } },
        items:    { select: { id: true, tagNumber: true } },
      },
    });
    if (!order) return notFound(res, 'Order not found');
    const plantStageSequence = [plantLockedStatus, ...ALLOWED].filter(Boolean);
    const currentIndex = plantStageSequence.indexOf(order.status);
    const nextIndex = plantStageSequence.indexOf(status);
    if (currentIndex === -1) return badRequest(res, 'Order is not currently in a plant-manageable stage');
    if (nextIndex === -1) return badRequest(res, 'Target stage is not a valid plant stage');
    if (nextIndex < currentIndex) return badRequest(res, 'Plant stage cannot move backward');
    if (nextIndex - currentIndex > 1) return badRequest(res, 'Plant stage must advance one step at a time');
    if (order.status === status) return badRequest(res, 'Order is already in this stage');

    // Auto-generate tag numbers when first entering PROCESSING
    if (status === 'PROCESSING' && order.status !== 'PROCESSING') {
      const itemsWithoutTags = order.items.filter(item => !item.tagNumber);
      for (let i = 0; i < itemsWithoutTags.length; i++) {
        const tagNumber = `HNG-${order.id.slice(-6).toUpperCase()}-${i + 1}`;
        await prisma.orderItem.update({
          where: { id: itemsWithoutTags[i].id },
          data:  { tagNumber },
        });
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data:  { status, updatedAt: new Date() },
      }),
      prisma.orderStage.create({
        data: {
          orderId:     id,
          stage:       status,
          notes:       notes || `Stage updated by ${req.staff.name}`,
          changedById: req.staff.id,
        },
      }),
    ]);

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'PLANT_STAGE_UPDATED', resource: 'order', resourceId: id,
      description: `${req.staff.name} moved ${order.orderNumber} to ${statusLabels[status] || status}`,
      metadata: { fromStatus: order.status, toStatus: status },
      ...getRequestMeta(req),
    });

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      status, statusLabel: statusLabels[status] || status,
    }, `Order moved to: ${statusLabels[status] || status}`);
  } catch (err) {
    return error(res, 'Failed to update stage');
  }
};

const flagIssue = async (req, res) => {
  const { id } = req.params;
  const { issueType, description, itemIndex } = req.body;

  if (!issueType) return badRequest(res, 'Issue type is required');
  if (!PLANT_ISSUE_TYPES.has(issueType)) {
    return badRequest(res, `Invalid issue type. Use: ${Array.from(PLANT_ISSUE_TYPES).join(', ')}`);
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id, ...ORDER_ONLY_WHERE },
      include: { items: true },
    });
    if (!order) return notFound(res, 'Order not found');
    if (itemIndex !== undefined) {
      const parsedItemIndex = Number(itemIndex);
      if (!Number.isInteger(parsedItemIndex) || parsedItemIndex < 0 || parsedItemIndex >= order.items.length) {
        return badRequest(res, 'itemIndex is out of range for this order');
      }
    }

    const flagNote = `ISSUE FLAGGED: ${issueType.replace(/_/g, ' ')}${
      description ? ` — ${String(description).trim()}` : ''
    }${itemIndex !== undefined ? ` (Item ${parseInt(itemIndex, 10) + 1})` : ''}. Reported by ${req.staff.name}`;

    await prisma.orderStage.create({
      data: {
        orderId:     id,
        stage:       order.status,
        notes:       flagNote,
        changedById: req.staff.id,
      },
    });

    await log({
      actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
      action: 'PLANT_ISSUE_FLAGGED', resource: 'order', resourceId: id,
      description: `${req.staff.name} flagged issue on ${order.orderNumber}: ${issueType}`,
      metadata: { issueType, description, itemIndex },
      ...getRequestMeta(req),
    });

    return success(res, {
      orderId: id, orderNumber: order.orderNumber, issueType, flagNote,
    }, 'Issue flagged and logged');
  } catch (err) {
    return error(res, 'Failed to flag issue');
  }
};

// POST /api/v1/plant/orders/:id/generate-tags — manually trigger tag generation
const generateTags = async (req, res) => {
  const { id } = req.params;
  try {
    const order = await prisma.order.findFirst({
      where: { id, ...ORDER_ONLY_WHERE },
      include: { items: { select: { id: true, tagNumber: true, serviceName: true } } },
    });
    if (!order) return notFound(res, 'Order not found');

    const generated = [];
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      if (!item.tagNumber) {
        const tagNumber = `HNG-${order.id.slice(-6).toUpperCase()}-${i + 1}`;
        await prisma.orderItem.update({ where: { id: item.id }, data: { tagNumber } });
        generated.push({ itemId: item.id, serviceName: item.serviceName, tagNumber });
      } else {
        generated.push({ itemId: item.id, serviceName: item.serviceName, tagNumber: item.tagNumber });
      }
    }

    return success(res, { orderId: id, tags: generated }, `${generated.length} tags ready`);
  } catch (err) {
    return error(res, 'Failed to generate tags');
  }
};

module.exports = {
  getPlantDashboard, getPlantOrders, scanQRCode, getPlantOrder,
  updatePlantStage, flagIssue, generateTags,
};
