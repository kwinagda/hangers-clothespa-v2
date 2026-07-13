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
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error, notFound } = require('../utils/response');
const { getOrderStatuses, getOrderWorkflow } = require('../services/masterData.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { syncOrderGarmentUnits } = require('../services/garment-unit.service');

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

// Scan an exact garment-unit tag or an order bag tag.
const scanQRCode = async (req, res) => {
  const qrCode = String(req.params.qrCode || '').trim().toUpperCase();
  if (!qrCode) return badRequest(res, 'QR code is required');

  try {
    const isBagTag = /-BAG-\d+$/i.test(qrCode);
    let order;
    let scannedUnit = null;
    if (isBagTag) {
      const orderNumber = qrCode.replace(/-BAG-\d+$/i, '');
      order = await prisma.order.findFirst({
        where: { orderNumber, ...ORDER_ONLY_WHERE },
        include: {
          customer: { select: { name: true, phone: true } },
          items: { include: { garmentUnits: { where: { status: { not: 'VOID' } }, orderBy: { sequence: 'asc' } } } },
          stages: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    } else {
      scannedUnit = await prisma.garmentUnit.findUnique({
        where: { tagNumber: qrCode },
        include: {
          currentPlantPartner: { select: { id: true, code: true, name: true } },
          orderItem: {
            include: {
              order: {
                include: {
                  customer: { select: { name: true, phone: true } },
                  items: { include: { garmentUnits: { where: { status: { not: 'VOID' } }, orderBy: { sequence: 'asc' } } } },
                  stages: { orderBy: { createdAt: 'desc' }, take: 5 },
                },
              },
            },
          },
        },
      });
      order = scannedUnit?.orderItem?.order || null;
    }

    if (!order) return notFound(res, `No garment or bag found for QR: ${qrCode}`);

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
        scannedItem: scannedUnit?.orderItem || null,
        scannedUnit: scannedUnit ? {
          id: scannedUnit.id,
          tagNumber: scannedUnit.tagNumber,
          sequence: scannedUnit.sequence,
          status: scannedUnit.status,
          currentPlantPartner: scannedUnit.currentPlantPartner,
        } : null,
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
        items:    { include: { garmentUnits: { where: { status: { not: 'VOID' } }, orderBy: { sequence: 'asc' } } } },
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
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      const plantStageSequence = [plantLockedStatus, ...ALLOWED].filter(Boolean);
      const currentIndex = plantStageSequence.indexOf(order.status);
      const nextIndex = plantStageSequence.indexOf(status);
      if (currentIndex === -1 || nextIndex === -1 || nextIndex <= currentIndex || nextIndex - currentIndex > 1) {
        throw new Error('INVALID_PLANT_TRANSITION');
      }
      await syncOrderGarmentUnits(tx, id);
      const updated = await tx.order.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await tx.orderStage.create({
        data: {
          orderId: id, stage: status, eventType: 'WORKFLOW_TRANSITION', fromStatus: order.status, toStatus: status,
          reasonCode: 'PLANT_STAGE_UPDATE', notes: notes || `Stage updated by ${req.staff.name}`, changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_STAGE_UPDATED', resource: 'order', resourceId: id,
        description: `${req.staff.name} moved ${order.orderNumber} to ${statusLabels[status] || status}`,
        metadata: { fromStatus: order.status, toStatus: status, beforeVersion: order.version, afterVersion: order.version + 1 },
        ...getRequestMeta(req),
      });
      return { order, updated };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id, orderNumber: result.order.orderNumber,
      status, statusLabel: statusLabels[status] || status,
    }, `Order moved to: ${statusLabels[status] || status}`);
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'INVALID_PLANT_TRANSITION') return badRequest(res, 'Plant stage must advance exactly one configured step');
    if (err.code === 'P2034') return res.status(409).json({ success: false, message: 'Plant stage changed concurrently; retry with the same idempotency key' });
    return error(res, 'Failed to update stage');
  }
};

const flagIssue = async (req, res) => {
  const { id } = req.params;
  const { issueType, description, garmentUnitId, tagNumber } = req.body;
  const severity = String(req.body.severity || 'MEDIUM').trim().toUpperCase();

  if (!issueType) return badRequest(res, 'Issue type is required');
  if (!PLANT_ISSUE_TYPES.has(issueType)) {
    return badRequest(res, `Invalid issue type. Use: ${Array.from(PLANT_ISSUE_TYPES).join(', ')}`);
  }
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) return badRequest(res, 'Invalid issue severity');

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      await syncOrderGarmentUnits(tx, id);
      const unit = garmentUnitId || tagNumber
        ? await tx.garmentUnit.findFirst({
            where: {
              ...(garmentUnitId ? { id: garmentUnitId } : { tagNumber: String(tagNumber).trim().toUpperCase() }),
              orderItem: { orderId: id }, status: { not: 'VOID' },
            },
          })
        : null;
      if ((garmentUnitId || tagNumber) && !unit) throw new Error('GARMENT_UNIT_NOT_FOUND');
      const movement = unit ? await tx.challanGarmentUnit.findFirst({
        where: { garmentUnitId: unit.id, status: 'DISPATCHED' },
        include: { challanItem: { select: { challanId: true } } },
        orderBy: { dispatchedAt: 'desc' },
      }) : null;
      const issue = await tx.plantQualityIssue.create({
        data: {
          issueNo: await nextDocumentNumber({ tx, documentType: 'PLANT_ISSUE', prefix: 'PQI-', padding: 6 }),
          orderId: id,
          garmentUnitId: unit?.id || null,
          challanId: movement?.challanItem?.challanId || null,
          plantPartnerId: unit?.currentPlantPartnerId || null,
          issueType,
          severity,
          previousUnitStatus: unit?.status || null,
          description: description ? String(description).trim() : null,
          reportedById: req.staff.id,
        },
      });
      if (unit) {
        await tx.garmentUnit.update({
          where: { id: unit.id },
          data: { status: 'ISSUE_HOLD', version: { increment: 1 } },
        });
      }
      await tx.orderStage.create({
        data: {
          orderId: id, stage: order.status, eventType: 'QUALITY_ISSUE', reasonCode: issueType,
          notes: description ? String(description).trim() : null,
          metadata: { issueId: issue.id, issueNo: issue.issueNo, garmentUnitId: unit?.id || null, severity },
          changedById: req.staff.id,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_ISSUE_FLAGGED', resource: 'plant_quality_issue', resourceId: issue.id,
        description: `${req.staff.name} flagged ${issue.issueNo} on ${order.orderNumber}`,
        metadata: { orderId: id, issueType, severity, garmentUnitId: unit?.id || null },
        ...getRequestMeta(req),
      });
      return { order, issue, unit };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id, orderNumber: result.order.orderNumber, issue: result.issue, garmentUnit: result.unit,
    }, 'Issue flagged and logged');
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    if (err.message === 'GARMENT_UNIT_NOT_FOUND') return notFound(res, 'Garment unit does not belong to this order');
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'An open issue already exists for this garment' });
    return error(res, 'Failed to flag issue');
  }
};

const resolveIssue = async (req, res) => {
  const resolution = String(req.body.resolution || '').trim();
  const responsibility = String(req.body.responsibility || '').trim().toUpperCase();
  if (resolution.length < 3) return badRequest(res, 'A resolution note is required');
  if (!['COMPANY', 'PLANT', 'CUSTOMER', 'NO_FAULT'].includes(responsibility)) return badRequest(res, 'A valid responsibility is required');
  try {
    const issue = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM plant_quality_issues WHERE "id" = ${req.params.issueId} FOR UPDATE`;
      const existing = await tx.plantQualityIssue.findUnique({ where: { id: req.params.issueId } });
      if (!existing) throw new Error('ISSUE_NOT_FOUND');
      if (existing.status !== 'OPEN') throw new Error('ISSUE_ALREADY_RESOLVED');
      const updated = await tx.plantQualityIssue.update({
        where: { id: existing.id },
        data: { status: 'RESOLVED', responsibility, resolution, resolvedAt: new Date(), resolvedById: req.staff.id },
      });
      if (existing.garmentUnitId) {
        await tx.garmentUnit.update({
          where: { id: existing.garmentUnitId },
          data: { status: existing.previousUnitStatus || 'RECEIVED', version: { increment: 1 } },
        });
      }
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_ISSUE_RESOLVED', resource: 'plant_quality_issue', resourceId: existing.id,
        description: `${existing.issueNo} resolved`, metadata: { responsibility, resolution }, ...getRequestMeta(req),
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return success(res, { issue }, 'Plant quality issue resolved');
  } catch (err) {
    if (err.message === 'ISSUE_NOT_FOUND') return notFound(res, 'Plant quality issue not found');
    if (err.message === 'ISSUE_ALREADY_RESOLVED') return badRequest(res, 'Plant quality issue is already resolved');
    return error(res, 'Failed to resolve plant quality issue');
  }
};

// POST /api/v1/plant/orders/:id/generate-tags — manually trigger tag generation
const generateTags = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id, ...ORDER_ONLY_WHERE } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      const units = await syncOrderGarmentUnits(tx, id);
      const tags = await tx.garmentUnit.findMany({
        where: { id: { in: units.map((unit) => unit.id) } },
        include: { orderItem: { select: { id: true, serviceName: true, garmentType: true } } },
        orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'GARMENT_TAGS_GENERATED', resource: 'order', resourceId: id,
        description: `${tags.length} garment-unit tags ready for ${order.orderNumber}`,
        metadata: { garmentUnitIds: tags.map((unit) => unit.id) }, ...getRequestMeta(req),
      });
      return { order, tags };
    }, { isolationLevel: 'Serializable' });

    return success(res, {
      orderId: id,
      tags: result.tags.map((unit) => ({
        garmentUnitId: unit.id, itemId: unit.orderItem.id, serviceName: unit.orderItem.serviceName,
        garmentType: unit.orderItem.garmentType, sequence: unit.sequence, tagNumber: unit.tagNumber,
      })),
    }, `${result.tags.length} garment-unit tags ready`);
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return notFound(res, 'Order not found');
    return error(res, 'Failed to generate tags');
  }
};

module.exports = {
  getPlantDashboard, getPlantOrders, scanQRCode, getPlantOrder,
  updatePlantStage, flagIssue, resolveIssue, generateTags,
};
