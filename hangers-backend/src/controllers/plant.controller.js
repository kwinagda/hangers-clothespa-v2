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

const PLANT_STATUSES = ['PROCESSING','WASHING','DRYING','IRONING','QC','READY_FOR_DELIVERY'];
const STATUS_LABEL = {
  PENDING:'Order Placed', PICKED_UP:'Picked Up', PROCESSING:'At Plant',
  WASHING:'Being Cleaned', DRYING:'Drying', IRONING:'Ironing',
  QC:'Quality Check', READY_FOR_DELIVERY:'Ready', OUT_FOR_DELIVERY:'Out for Delivery',
  DELIVERED:'Delivered', CANCELLED:'Cancelled',
};

const getPlantDashboard = async (req, res) => {
  try {
    const [pending, processing, washing, drying, ironing, qc, ready, todayDone] =
      await Promise.all([
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.order.count({ where: { status: 'PROCESSING' } }),
        prisma.order.count({ where: { status: 'WASHING' } }),
        prisma.order.count({ where: { status: 'DRYING' } }),
        prisma.order.count({ where: { status: 'IRONING' } }),
        prisma.order.count({ where: { status: 'QC' } }),
        prisma.order.count({ where: { status: 'READY_FOR_DELIVERY' } }),
        prisma.order.count({
          where: {
            status: 'READY_FOR_DELIVERY',
            updatedAt: { gte: new Date(new Date().setHours(0,0,0,0)) },
          },
        }),
      ]);

    const atPlant = processing + washing + drying + ironing + qc;

    return success(res, {
      dashboard: {
        pending, atPlant, processing, washing, drying, ironing, qc,
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
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = status
    ? { status }
    : { status: { in: PLANT_STATUSES } };

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
        take: parseInt(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      orders: orders.map(o => ({
        id: o.id, orderNumber: o.orderNumber, status: o.status,
        statusLabel: STATUS_LABEL[o.status] || o.status,
        customer:    { name: o.customer?.name, phone: o.customer?.phone },
        items:       o.items,
        totalItems:  o.items.reduce((s, i) => s + i.quantity, 0),
        notes:       o.notes,
        updatedAt:   o.updatedAt,
      })),
      total,
      page: parseInt(page),
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
      where: { orderNumber },
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

    return success(res, {
      order: {
        id: order.id, orderNumber: order.orderNumber, status: order.status,
        statusLabel: STATUS_LABEL[order.status] || order.status,
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
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { select: { name: true, phone: true } },
        items:    true,
        stages:   { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) return notFound(res, 'Order not found');

    return success(res, {
      order: {
        ...order,
        statusLabel: STATUS_LABEL[order.status] || order.status,
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

  const ALLOWED = ['PROCESSING','WASHING','DRYING','IRONING','QC','READY_FOR_DELIVERY'];
  if (!ALLOWED.includes(status)) {
    return badRequest(res, `Plant can only set: ${ALLOWED.join(', ')}`);
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true } },
        items:    { select: { id: true, tagNumber: true } },
      },
    });
    if (!order) return notFound(res, 'Order not found');

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
      description: `${req.staff.name} moved ${order.orderNumber} to ${STATUS_LABEL[status]}`,
      metadata: { fromStatus: order.status, toStatus: status },
      ...getRequestMeta(req),
    });

    return success(res, {
      orderId: id, orderNumber: order.orderNumber,
      status, statusLabel: STATUS_LABEL[status],
    }, `Order moved to: ${STATUS_LABEL[status]}`);
  } catch (err) {
    return error(res, 'Failed to update stage');
  }
};

const flagIssue = async (req, res) => {
  const { id } = req.params;
  const { issueType, description, itemIndex } = req.body;

  const ISSUE_TYPES = ['MISSING_ITEM','DAMAGE','STAIN_NOT_REMOVED','WRONG_ITEM','OTHER'];
  if (!issueType) return badRequest(res, 'Issue type is required');
  if (!ISSUE_TYPES.includes(issueType)) {
    return badRequest(res, `Invalid issue type. Use: ${ISSUE_TYPES.join(', ')}`);
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) return notFound(res, 'Order not found');

    const flagNote = `⚠️ ISSUE FLAGGED: ${issueType.replace(/_/g, ' ')}${
      description ? ` — ${description}` : ''
    }${itemIndex !== undefined ? ` (Item ${parseInt(itemIndex) + 1})` : ''}. Reported by ${req.staff.name}`;

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
    const order = await prisma.order.findUnique({
      where: { id },
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
