const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { log, getRequestMeta } = require('../services/activity.service');
const { generateOrderNumber } = require('../utils/order-number');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { generateQuotationHTML } = require('../services/quotation.pdf.service');
const { htmlToPDF } = require('../services/pdf-render.service');

const VALID_QUOTATION_STATUSES = new Set(['DRAFT', 'SENT', 'APPROVED', 'EXPIRED', 'CONVERTED']);
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

const normalizeQuotationItems = async (items) => {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('At least one item is required');
  }

  const normalized = items.map((item) => normalizeOrderItem(item, { defaultServiceName: '' }));

  if (normalized.some((item) => !item.serviceName)) {
    throw new Error('Each item must include a serviceName');
  }

  return normalized;
};

const buildQuotationPayload = async (body) => {
  const items = await normalizeQuotationItems(body.items);
  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const discount = Math.max(0, Number.parseFloat(body.discount) || 0);
  const totalAmount = Math.max(0, Number((subtotal - discount).toFixed(2)));
  const quotationStatus = VALID_QUOTATION_STATUSES.has(body.quotationStatus) ? body.quotationStatus : 'DRAFT';
  const validUntil = parseDate(body.validUntil, 'validUntil');

  return {
    items,
    subtotal,
    discount,
    totalAmount,
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
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true } });
    if (!customer) return notFound(res, 'Customer not found');

    const payload = await buildQuotationPayload(req.body);
    const orderNumber = await generateOrderNumber({ documentType: 'QUOTATION' });

    const quotation = await prisma.order.create({
      data: {
        orderNumber,
        documentType: 'QUOTATION',
        customerId,
        status: 'PENDING',
        source: payload.source,
        quotationStatus: payload.quotationStatus,
        validUntil: payload.validUntil,
        subtotal: payload.subtotal,
        discount: payload.discount,
        totalAmount: payload.totalAmount,
        paidAmount: 0,
        paymentStatus: 'UNPAID',
        notes: payload.notes,
        assignedToId: req.staff?.id || null,
        items: {
          create: payload.items.map((item) => ({
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
          })),
        },
        stages: {
          create: {
            stage: 'QUOTATION_CREATED',
            notes: `Quotation created with status ${payload.quotationStatus}`,
            changedById: req.staff?.id || null,
          },
        },
      },
      include: includeQuotation,
    });

    await log({
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'QUOTATION_CREATED',
      resource: 'quotation',
      resourceId: quotation.id,
      description: `Quotation ${quotation.orderNumber} created for ${customer.name || customer.phone}`,
      metadata: { customerId, orderNumber: quotation.orderNumber, totalAmount: quotation.totalAmount },
      ...getRequestMeta(req),
    });

    return success(res, { quotation }, `Quotation ${quotation.orderNumber} created successfully`, 201);
  } catch (err) {
    console.error('createQuotation error:', err);
    if (err.message?.includes('required') || err.message?.includes('valid')) {
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to create quotation');
  }
};

const updateQuotation = async (req, res) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      select: { id: true, orderNumber: true, customerId: true, quotationStatus: true },
    });
    if (!existing) return notFound(res, 'Quotation not found');
    if (existing.quotationStatus === 'CONVERTED') return badRequest(res, 'Converted quotations cannot be edited');

    const payload = await buildQuotationPayload(req.body);

    const quotation = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });

      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          quotationStatus: payload.quotationStatus,
          validUntil: payload.validUntil,
          subtotal: payload.subtotal,
          discount: payload.discount,
          totalAmount: payload.totalAmount,
          notes: payload.notes,
          items: {
            create: payload.items.map((item) => ({
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
            })),
          },
        },
        include: includeQuotation,
      });

      await tx.orderStage.create({
        data: {
          orderId: existing.id,
          stage: 'QUOTATION_UPDATED',
          notes: `Quotation updated. Status: ${payload.quotationStatus}`,
          changedById: req.staff?.id || null,
        },
      });

      return updated;
    });

    return success(res, { quotation }, `Quotation ${quotation.orderNumber} updated successfully`);
  } catch (err) {
    console.error('updateQuotation error:', err);
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

  try {
    const quotation = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      select: { id: true, orderNumber: true, quotationStatus: true },
    });
    if (!quotation) return notFound(res, 'Quotation not found');
    if (quotation.quotationStatus === 'CONVERTED') return badRequest(res, 'Converted quotations cannot change status');

    const updated = await prisma.$transaction(async (tx) => {
      const nextQuotation = await tx.order.update({
        where: { id: quotation.id },
        data: { quotationStatus: nextStatus },
        include: includeQuotation,
      });
      await tx.orderStage.create({
        data: {
          orderId: quotation.id,
          stage: 'QUOTATION_STATUS_UPDATED',
          notes: `Quotation status changed from ${quotation.quotationStatus || 'DRAFT'} to ${nextStatus}`,
          changedById: req.staff?.id || null,
        },
      });
      return nextQuotation;
    });

    return success(res, { quotation: updated }, `Quotation marked as ${nextStatus}`);
  } catch (err) {
    console.error('updateQuotationStatus error:', err);
    return error(res, 'Failed to update quotation status');
  }
};

const convertQuotation = async (req, res) => {
  try {
    const quotation = await prisma.order.findFirst({
      where: { id: req.params.id, ...QUOTATION_WHERE },
      include: { customer: { select: { id: true, name: true, phone: true } }, items: true },
    });
    if (!quotation) return notFound(res, 'Quotation not found');
    const hydratedQuotation = hydrateQuotationPricing(quotation);
    if (quotation.quotationStatus === 'CONVERTED' || quotation.convertedOrderId) {
      return badRequest(res, 'Quotation has already been converted');
    }
    if (!hydratedQuotation.items.length) {
      return badRequest(res, 'Quotation must have at least one item before conversion');
    }

    const orderNumber = await generateOrderNumber({ documentType: 'ORDER' });

    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId: quotation.customerId,
          status: 'PENDING',
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
              notes: `Order created from quotation ${quotation.orderNumber}`,
              changedById: req.staff?.id || null,
            },
          },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
        },
      });

      await tx.order.update({
        where: { id: quotation.id },
        data: {
          quotationStatus: 'CONVERTED',
          convertedOrderId: order.id,
        },
      });

      await tx.orderStage.create({
        data: {
          orderId: quotation.id,
          stage: 'QUOTATION_CONVERTED',
          notes: `Converted to order ${order.orderNumber}`,
          changedById: req.staff?.id || null,
        },
      });

      return order;
    });

    await log({
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'QUOTATION_CONVERTED',
      resource: 'quotation',
      resourceId: quotation.id,
      description: `Quotation ${quotation.orderNumber} converted to order ${createdOrder.orderNumber}`,
      metadata: { quotationId: quotation.id, convertedOrderId: createdOrder.id },
      ...getRequestMeta(req),
    });

    return success(res, { order: createdOrder }, `Quotation converted to order ${createdOrder.orderNumber}`);
  } catch (err) {
    console.error('convertQuotation error:', err);
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

module.exports = {
  listQuotations,
  getQuotation,
  getQuotationPDF,
  createQuotation,
  updateQuotation,
  updateQuotationStatus,
  convertQuotation,
};
