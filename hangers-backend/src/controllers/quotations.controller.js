const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { generateOrderNumber } = require('../utils/order-number');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { generateQuotationHTML } = require('../services/quotation.pdf.service');
const { htmlToPDF } = require('../services/pdf-render.service');
const { createPublicShareToken } = require('../services/publicShare.service');
const { ensureOrderInvoice } = require('../services/billing.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const { syncOrderGarmentUnits } = require('../services/garment-unit.service');
const { CommercialRuleError, resolveOrderPricing } = require('../services/pricing.service');

const VALID_QUOTATION_STATUSES = new Set(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED']);
const QUOTATION_TRANSITIONS = Object.freeze({
  DRAFT: ['SENT'],
  SENT: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
});
const QUOTATION_WHERE = { documentType: 'QUOTATION' };

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseDate = (value, label) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return parsed;
};

const buildQuotationPayload = async (tx, body, customerId, staff) => {
  if (!Array.isArray(body.items) || !body.items.length) throw new CommercialRuleError('ITEMS_REQUIRED', 'At least one item is required');
  const pricing = await resolveOrderPricing(tx, {
    items: body.items,
    customerId,
    discount: body.discount,
    commercialReason: body.commercialReason,
    staff,
  });
  const quotationStatus = VALID_QUOTATION_STATUSES.has(body.quotationStatus) ? body.quotationStatus : 'DRAFT';
  const validUntil = parseDate(body.validUntil, 'validUntil');

  return {
    items: pricing.items,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    totalAmount: pricing.totalAmount,
    pricing,
    quotationStatus,
    validUntil,
    notes: body.notes ? String(body.notes).trim() : null,
    source: body.source ? String(body.source).trim().toUpperCase() : 'CRM',
  };
};

const includeQuotation = {
  customer: { select: { id: true, name: true, phone: true } },
  items: true,
  assignedTo: { select: { id: true, name: true, role: true } },
};

const hydrateQuotationPricing = (quotation) => {
  if (!quotation) return quotation;

  const items = Array.isArray(quotation.items)
    ? quotation.items.map((item) => ({
        ...item,
        ...normalizeOrderItem(item, { defaultServiceName: item.serviceName || 'Service' }),
      }))
    : [];

  const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const discount = Math.max(0, Number.parseFloat(String(quotation.discount ?? 0)) || 0);
  const totalAmount = roundMoney(Math.max(0, subtotal - discount));

  return {
    ...quotation,
    items,
    subtotal,
    discount,
    totalAmount,
  };
};

const buildPublicQuotationUrl = (req, slug) => {
  const configuredBase = process.env.CRM_URL || process.env.CUSTOMER_APP_URL;
  const requestBase = req.get?.('origin');
  const base = String(configuredBase || requestBase || '').replace(/\/+$/, '');
  return base ? `${base}/quotation/${slug}` : `/quotation/${slug}`;
};

const listQuotations = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 30), 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';
    const quotationStatus = typeof req.query.quotationStatus === 'string' ? req.query.quotationStatus.trim().toUpperCase() : '';

    const where = { ...QUOTATION_WHERE };
    if (customerId) where.customerId = customerId;
    if (quotationStatus) where.quotationStatus = quotationStatus;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    const [quotations, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: includeQuotation,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, {
      quotations: quotations.map(hydrateQuotationPricing),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('listQuotations error:', err);
    return error(res, 'Failed to fetch quotations');
  }
};

const getQuotation = async (req, res) => {
  try {
    const quotation = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      include: {
        ...includeQuotation,
        stages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!quotation) return notFound(res, 'Quotation not found');
    return success(res, { quotation: hydrateQuotationPricing(quotation) });
  } catch (err) {
    return error(res, 'Failed to fetch quotation');
  }
};

const createQuotation = async (req, res) => {
  const { customerId } = req.body;
  if (!customerId) return badRequest(res, 'customerId is required');

  try {
    const quotation = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true } });
      if (!customer) throw Object.assign(new Error('Customer not found'), { code: 'CUSTOMER_NOT_FOUND' });
      const payload = await buildQuotationPayload(tx, req.body, customerId, req.staff);
      const orderNumber = await generateOrderNumber({ documentType: 'QUOTATION', client: tx });
      const createdQuotation = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'QUOTATION',
          customerId,
          status: 'PENDING',
          source: payload.source,
          quotationStatus: 'DRAFT',
          validUntil: payload.validUntil,
          subtotal: payload.subtotal,
          discount: payload.discount,
          totalAmount: payload.totalAmount,
          paidAmount: 0,
          paymentStatus: 'UNPAID',
          notes: payload.notes,
          assignedToId: req.staff?.id || null,
          items: {
            create: payload.items.map((item, index) => ({
              serviceId: item.serviceId,
              serviceName: item.serviceName,
              garmentType: item.garmentType,
              variant: item.variant,
              quantity: item.quantity,
              baseUnitPrice: item.baseUnitPrice,
              unitPrice: item.unitPrice,
              lineDiscountType: item.lineDiscountType,
              lineDiscountValue: item.lineDiscountValue || 0,
              lineDiscountAmount: item.lineDiscountAmount || 0,
              subtotal: item.subtotal,
              notes: item.notes,
              catalogUnitPrice: item.baseUnitPrice,
              priceSource: payload.pricing.overrideDetails.some((entry) => entry.line === index + 1) ? 'OVERRIDE' : 'CATALOG',
              priceOverrideReason: payload.pricing.overrideDetails.find((entry) => entry.line === index + 1)?.reason || null,
              priceOverriddenById: payload.pricing.overrideDetails.some((entry) => entry.line === index + 1) ? req.staff?.id || null : null,
              pricingSnapshot: { catalogUnitPrice: item.baseUnitPrice, appliedUnitPrice: item.unitPrice, quotation: true },
            })),
          },
          stages: {
            create: {
              stage: 'QUOTATION_CREATED',
              eventType: 'QUOTATION_EVENT',
              toStatus: 'DRAFT',
              notes: 'Quotation created as draft',
              changedById: req.staff?.id || null,
            },
          },
        },
        include: includeQuotation,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'QUOTATION_CREATED', resource: 'quotation', resourceId: createdQuotation.id,
        description: `Quotation ${createdQuotation.orderNumber} created for ${customer.name || customer.phone}`,
        metadata: { customerId, orderNumber: createdQuotation.orderNumber, totalAmount: createdQuotation.totalAmount, status: 'DRAFT' },
        ...getRequestMeta(req),
      });
      return createdQuotation;
    }, { isolationLevel: 'Serializable' });

    return success(res, { quotation }, `Quotation ${quotation.orderNumber} created successfully`, 201);
  } catch (err) {
    console.error('createQuotation error:', err);
    if (err.code === 'CUSTOMER_NOT_FOUND') return notFound(res, err.message);
    if (err instanceof CommercialRuleError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    if (err.message?.includes('required') || err.message?.includes('valid')) {
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to create quotation');
  }
};

const updateQuotation = async (req, res) => {
  try {
    const quotation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.order.findFirst({
        where: { id: req.params.id, ...QUOTATION_WHERE },
        select: { id: true, orderNumber: true, customerId: true, quotationStatus: true, version: true, totalAmount: true },
      });
      if (!existing) throw Object.assign(new Error('Quotation not found'), { code: 'QUOTATION_NOT_FOUND' });
      if ((existing.quotationStatus || 'DRAFT') !== 'DRAFT') {
        throw Object.assign(new Error('Only draft quotations can be edited. Create a new revision after sending.'), { code: 'QUOTATION_LOCKED' });
      }
      const payload = await buildQuotationPayload(tx, req.body, existing.customerId, req.staff);
      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });

      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          quotationStatus: 'DRAFT',
          validUntil: payload.validUntil,
          subtotal: payload.subtotal,
          discount: payload.discount,
          totalAmount: payload.totalAmount,
          notes: payload.notes,
          version: { increment: 1 },
          items: {
            create: payload.items.map((item, index) => ({
              serviceId: item.serviceId,
              serviceName: item.serviceName,
              garmentType: item.garmentType,
              variant: item.variant,
              quantity: item.quantity,
              baseUnitPrice: item.baseUnitPrice,
              unitPrice: item.unitPrice,
              lineDiscountType: item.lineDiscountType,
              lineDiscountValue: item.lineDiscountValue || 0,
              lineDiscountAmount: item.lineDiscountAmount || 0,
              subtotal: item.subtotal,
              notes: item.notes,
              catalogUnitPrice: item.baseUnitPrice,
              priceSource: payload.pricing.overrideDetails.some((entry) => entry.line === index + 1) ? 'OVERRIDE' : 'CATALOG',
              priceOverrideReason: payload.pricing.overrideDetails.find((entry) => entry.line === index + 1)?.reason || null,
              priceOverriddenById: payload.pricing.overrideDetails.some((entry) => entry.line === index + 1) ? req.staff?.id || null : null,
              pricingSnapshot: { catalogUnitPrice: item.baseUnitPrice, appliedUnitPrice: item.unitPrice, quotation: true },
            })),
          },
        },
        include: includeQuotation,
      });

      await tx.orderStage.create({
        data: {
          orderId: existing.id,
          stage: 'QUOTATION_UPDATED',
          eventType: 'QUOTATION_EVENT',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          notes: 'Draft quotation updated',
          changedById: req.staff?.id || null,
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'QUOTATION_UPDATED', resource: 'quotation', resourceId: existing.id,
        description: `Draft quotation ${existing.orderNumber} updated`,
        metadata: {
          before: { version: existing.version, totalAmount: existing.totalAmount },
          after: { version: existing.version + 1, totalAmount: payload.totalAmount },
        },
        ...getRequestMeta(req),
      });

      return updated;
    }, { isolationLevel: 'Serializable' });

    return success(res, { quotation }, `Quotation ${quotation.orderNumber} updated successfully`);
  } catch (err) {
    console.error('updateQuotation error:', err);
    if (err.code === 'QUOTATION_NOT_FOUND') return notFound(res, err.message);
    if (err.code === 'QUOTATION_LOCKED') return badRequest(res, err.message);
    if (err instanceof CommercialRuleError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
    if (err.message?.includes('required') || err.message?.includes('valid')) {
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to update quotation');
  }
};

const updateQuotationStatus = async (req, res) => {
  const nextStatus = String(req.body?.quotationStatus || '').trim().toUpperCase();
  if (!VALID_QUOTATION_STATUSES.has(nextStatus)) {
    return badRequest(res, `quotationStatus must be one of: ${[...VALID_QUOTATION_STATUSES].join(', ')}`);
  }
  if (nextStatus === 'CONVERTED') return badRequest(res, 'CONVERTED is reserved for successful order conversion');
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  if (nextStatus === 'REJECTED' && (!reason || reason.length < 3)) return badRequest(res, 'A rejection reason is required');

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const quotation = await tx.order.findFirst({
        where: { id: req.params.id, ...QUOTATION_WHERE },
        select: { id: true, orderNumber: true, quotationStatus: true, validUntil: true, version: true },
      });
      if (!quotation) throw Object.assign(new Error('Quotation not found'), { code: 'QUOTATION_NOT_FOUND' });
      const currentStatus = quotation.quotationStatus || 'DRAFT';
      if (currentStatus === nextStatus) return tx.order.findUnique({ where: { id: quotation.id }, include: includeQuotation });
      if (!QUOTATION_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
        throw Object.assign(new Error(`Quotation cannot move from ${currentStatus} to ${nextStatus}`), { code: 'INVALID_TRANSITION' });
      }
      const now = new Date();
      if (nextStatus === 'SENT' && (!quotation.validUntil || quotation.validUntil <= now)) {
        throw Object.assign(new Error('Set a future valid-until date before sending the quotation'), { code: 'INVALID_VALIDITY' });
      }
      if (nextStatus === 'APPROVED' && quotation.validUntil && quotation.validUntil < now) {
        throw Object.assign(new Error('An expired quotation cannot be approved'), { code: 'INVALID_VALIDITY' });
      }
      const nextQuotation = await tx.order.update({
        where: { id: quotation.id },
        data: { quotationStatus: nextStatus, version: { increment: 1 } },
        include: includeQuotation,
      });
      await tx.orderStage.create({
        data: {
          orderId: quotation.id,
          stage: 'QUOTATION_STATUS_UPDATED',
          eventType: 'QUOTATION_EVENT',
          fromStatus: currentStatus,
          toStatus: nextStatus,
          reasonCode: nextStatus === 'REJECTED' ? 'CUSTOMER_REJECTED' : nextStatus === 'EXPIRED' ? 'VALIDITY_EXPIRED' : null,
          notes: reason,
          changedById: req.staff?.id || null,
        },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'QUOTATION_STATUS_CHANGED', resource: 'quotation', resourceId: quotation.id,
        description: `${quotation.orderNumber}: ${currentStatus} -> ${nextStatus}`,
        metadata: { fromStatus: currentStatus, toStatus: nextStatus, reason, version: quotation.version + 1 },
        ...getRequestMeta(req),
      });
      return nextQuotation;
    }, { isolationLevel: 'Serializable' });

    return success(res, { quotation: updated }, `Quotation marked as ${nextStatus}`);
  } catch (err) {
    console.error('updateQuotationStatus error:', err);
    if (err.code === 'QUOTATION_NOT_FOUND') return notFound(res, err.message);
    if (['INVALID_TRANSITION', 'INVALID_VALIDITY'].includes(err.code)) return badRequest(res, err.message);
    return error(res, 'Failed to update quotation status');
  }
};

const convertQuotation = async (req, res) => {
  try {
    const createdOrder = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const quotation = await tx.order.findFirst({
        where: { id: req.params.id, ...QUOTATION_WHERE },
        include: { customer: { select: { id: true, name: true, phone: true } }, items: true },
      });
      if (!quotation) throw Object.assign(new Error('Quotation not found'), { code: 'QUOTATION_NOT_FOUND' });
      if (quotation.quotationStatus === 'CONVERTED' || quotation.convertedOrderId) {
        throw Object.assign(new Error('Quotation has already been converted'), { code: 'ALREADY_CONVERTED' });
      }
      if (quotation.quotationStatus !== 'APPROVED') {
        throw Object.assign(new Error('Only an approved quotation can be converted'), { code: 'NOT_APPROVED' });
      }
      if (!quotation.validUntil || quotation.validUntil < new Date()) {
        throw Object.assign(new Error('Quotation validity has expired; issue a new quotation revision'), { code: 'EXPIRED_QUOTATION' });
      }
      const hydratedQuotation = hydrateQuotationPricing(quotation);
      if (!hydratedQuotation.items.length) {
        throw Object.assign(new Error('Quotation must have at least one item before conversion'), { code: 'EMPTY_QUOTATION' });
      }
      const orderNumber = await generateOrderNumber({ documentType: 'ORDER', client: tx });
      const order = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId: quotation.customerId,
          status: 'PICKED_UP',
          source: 'QUOTATION',
          subtotal: hydratedQuotation.subtotal,
          discount: hydratedQuotation.discount,
          totalAmount: hydratedQuotation.totalAmount,
          paidAmount: 0,
          writeOffAmount: 0,
          paymentStatus: 'UNPAID',
          notes: quotation.notes ? `Converted from quotation ${quotation.orderNumber}. ${quotation.notes}` : `Converted from quotation ${quotation.orderNumber}.`,
          assignedToId: req.staff?.id || null,
          items: {
            create: hydratedQuotation.items.map((item) => ({
              serviceId: item.serviceId,
              serviceName: item.serviceName,
              garmentType: item.garmentType,
              variant: item.variant,
              quantity: item.quantity,
              baseUnitPrice: item.baseUnitPrice,
              unitPrice: item.unitPrice,
              lineDiscountType: item.lineDiscountType,
              lineDiscountValue: item.lineDiscountValue || 0,
              lineDiscountAmount: item.lineDiscountAmount || 0,
              subtotal: item.subtotal,
              upcharges: item.upcharges,
              notes: item.notes,
            })),
          },
          stages: {
            create: {
              stage: 'RECEIVED',
              eventType: 'WORKFLOW_TRANSITION',
              toStatus: 'PICKED_UP',
              reasonCode: 'QUOTATION_CONVERSION',
              notes: `In-store order created from quotation ${quotation.orderNumber}`,
              changedById: req.staff?.id || null,
            },
          },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
        },
      });

      await syncOrderGarmentUnits(tx, order.id);
      await ensureOrderInvoice(tx, order.id, req.staff?.id);

      const conversionClaim = await tx.order.updateMany({
        where: { id: quotation.id, quotationStatus: 'APPROVED', convertedOrderId: null },
        data: {
          quotationStatus: 'CONVERTED',
          convertedOrderId: order.id,
          version: { increment: 1 },
        },
      });
      if (conversionClaim.count !== 1) throw Object.assign(new Error('Quotation conversion was claimed by another request'), { code: 'CONVERSION_CONFLICT' });

      await tx.orderStage.create({
        data: {
          orderId: quotation.id,
          stage: 'QUOTATION_CONVERTED',
          eventType: 'QUOTATION_EVENT',
          fromStatus: 'APPROVED',
          toStatus: 'CONVERTED',
          reasonCode: 'ORDER_CREATED',
          notes: `Converted to order ${order.orderNumber}`,
          changedById: req.staff?.id || null,
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'QUOTATION_CONVERTED', resource: 'quotation', resourceId: quotation.id,
        description: `Quotation ${quotation.orderNumber} converted to order ${order.orderNumber}`,
        metadata: { quotationId: quotation.id, convertedOrderId: order.id, orderNumber: order.orderNumber },
        ...getRequestMeta(req),
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'ORDER_CREATED_FROM_QUOTATION', resource: 'order', resourceId: order.id,
        description: `Order ${order.orderNumber} created from approved quotation ${quotation.orderNumber}`,
        metadata: { quotationId: quotation.id, quotationNumber: quotation.orderNumber, source: 'QUOTATION', initialStatus: 'PICKED_UP' },
        ...getRequestMeta(req),
      });
      await enqueueOutboxEvent(tx, {
        eventType: OUTBOX_EVENT.ORDER_STATUS,
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { status: 'PICKED_UP' },
        dedupeKey: `quotation-conversion-order:${quotation.id}:${order.id}`,
      });

      return order;
    }, { isolationLevel: 'Serializable' });

    return success(res, { order: createdOrder }, `Quotation converted to order ${createdOrder.orderNumber}`);
  } catch (err) {
    console.error('convertQuotation error:', err);
    if (err.code === 'QUOTATION_NOT_FOUND') return notFound(res, err.message);
    if (['ALREADY_CONVERTED', 'NOT_APPROVED', 'EXPIRED_QUOTATION', 'EMPTY_QUOTATION'].includes(err.code)) return badRequest(res, err.message);
    if (err.code === 'CONVERSION_CONFLICT' || err.code === 'P2034') return res.status(409).json({ success: false, message: 'Quotation conversion conflicted with another request; retry with the same idempotency key' });
    return error(res, 'Failed to convert quotation');
  }
};

const getQuotationPDF = async (req, res) => {
  try {
    const quotation = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      include: includeQuotation,
    });
    if (!quotation) return notFound(res, 'Quotation not found');

    const hydratedQuotation = hydrateQuotationPricing(quotation);
    const html = await generateQuotationHTML(hydratedQuotation);
    const itemCount = Array.isArray(hydratedQuotation.items) ? hydratedQuotation.items.length : 0;
    const noteLength = String(hydratedQuotation.notes || '').trim().length;
    const scale = itemCount > 8 || noteLength > 220
      ? 0.92
      : itemCount > 5 || noteLength > 120
        ? 0.96
        : 1;
    const pdf = await htmlToPDF(html, {
      margin: { top: '3mm', bottom: '3mm', left: '3mm', right: '3mm' },
      scale,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${quotation.orderNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('getQuotationPDF error:', err);
    return error(res, 'Failed to generate quotation PDF');
  }
};

const createQuotationShare = async (req, res) => {
  try {
    const quotation = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      select: { id: true, orderNumber: true },
    });
    if (!quotation) return notFound(res, 'Quotation not found');

    const slug = await createPublicShareToken({
      resourceType: 'QUOTATION',
      resourceId: quotation.id,
      purpose: 'QUOTATION_VIEW',
      ttlDays: 30,
    });
    if (!slug) return error(res, 'Failed to create quotation share link');

    return success(res, {
      quotationId: quotation.id,
      orderNumber: quotation.orderNumber,
      slug,
      shareUrl: buildPublicQuotationUrl(req, slug),
      expiresInDays: 30,
    });
  } catch (err) {
    console.error('createQuotationShare error:', err);
    return error(res, 'Failed to create quotation share link');
  }
};

module.exports = {
  listQuotations,
  getQuotation,
  getQuotationPDF,
  createQuotationShare,
  createQuotation,
  updateQuotation,
  updateQuotationStatus,
  convertQuotation,
};
