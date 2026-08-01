const prisma = require('../config/database');
const { success, created, error, badRequest, notFound, forbidden } = require('../utils/response');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { BillingRuleError, ensureServiceAppointmentInvoice } = require('../services/billing.service');
const { PaymentRuleError, recordInvoiceSettlement, reverseInvoicePaymentCorrection } = require('../services/payment.service');
const { getCorePaymentMethods, getFieldServiceWorkflow } = require('../services/masterData.service');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { calculateLineDiscountAmount, normalizeLineDiscountType, roundMoney } = require('../utils/line-pricing');

const FIELD_SERVICE_CATEGORY = 'SOFA CLEANING';

const addressSnapshot = (address) => address ? {
  id: address.id,
  label: address.label,
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2,
  landmark: address.landmark,
  city: address.city,
  pincode: address.pincode,
  isDefault: address.isDefault,
  formatted: [address.addressLine1, address.addressLine2, address.landmark, address.city, address.pincode].filter(Boolean).join(', '),
} : null;

const includeAppointment = {
  customer: { select: { id: true, name: true, phone: true } },
  serviceAddress: true,
  service: { select: { id: true, name: true, category: true, basePrice: true } },
  lines: { orderBy: { createdAt: 'asc' }, include: { service: { select: { id: true, name: true, category: true, basePrice: true } } } },
  assignedTo: { select: { id: true, name: true, phone: true } },
  invoice: {
    include: {
      allocations: {
        include: { payment: true },
        orderBy: { createdAt: 'asc' },
      },
      financialAdjustments: { orderBy: { createdAt: 'asc' } },
    },
  },
  events: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { id: true, name: true } } } },
};

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const parseMoney = (value, fallback = 0) => {
  const source = value === undefined || value === null || value === '' ? fallback : value;
  const amount = Number(source);
  if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new PaymentRuleError('INVALID_AMOUNT', 'Money values must be valid numbers with at most two decimals');
  }
  return roundMoney(amount);
};

const parseQuantity = (value, fallback = 1) => {
  const source = value === undefined || value === null || value === '' ? fallback : value;
  const quantity = Number(source);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    throw new PaymentRuleError('INVALID_QUANTITY', 'Quantity must be a positive whole number');
  }
  return quantity;
};

const normalizeAppointmentLines = async (tx, { items = [], serviceId, subtotal, discountAmount = 0, totalAmount }) => {
  const inputItems = Array.isArray(items) ? items : [];
  if (!inputItems.length) {
    const service = serviceId
      ? await tx.service.findUnique({ where: { id: serviceId } })
      : await tx.service.findFirst({ where: { category: FIELD_SERVICE_CATEGORY, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!service || service.category !== FIELD_SERVICE_CATEGORY || !service.isActive) {
      throw new PaymentRuleError('INVALID_FIELD_SERVICE', 'Choose an active Sofa Cleaning service item');
    }
    const unitPrice = parseMoney(subtotal, service.basePrice);
    const discount = parseMoney(discountAmount, 0);
    const lineTotal = totalAmount !== undefined
      ? parseMoney(totalAmount, 0)
      : roundMoney(Math.max(0, unitPrice - discount));
    return [{
      service,
      serviceId: service.id,
      description: service.name,
      quantity: 1,
      unitPrice,
      lineDiscountType: null,
      lineDiscountValue: 0,
      discountAmount: discount,
      lineTotal,
      notes: null,
      metadata: { source: 'FIELD_SERVICE_APPOINTMENT' },
    }];
  }

  const serviceIds = [...new Set(inputItems.map((item) => item?.serviceId).filter(Boolean))];
  const services = serviceIds.length
    ? await tx.service.findMany({ where: { id: { in: serviceIds }, isActive: true } })
    : [];
  const serviceById = new Map(services.map((service) => [service.id, service]));

  return inputItems.map((item, index) => {
    const service = item.serviceId ? serviceById.get(item.serviceId) : null;
    if (item.serviceId && (!service || service.category !== FIELD_SERVICE_CATEGORY)) {
      throw new PaymentRuleError('INVALID_FIELD_SERVICE', `Line ${index + 1}: choose an active Sofa Cleaning service item`);
    }
    const description = String(service ? service.name : (item.description || item.name || '')).trim();
    if (!description) throw new PaymentRuleError('INVALID_FIELD_SERVICE_LINE', `Line ${index + 1}: description is required`);
    const quantity = parseQuantity(item.quantity, 1);
    if (!(quantity > 0)) throw new PaymentRuleError('INVALID_FIELD_SERVICE_LINE', `Line ${index + 1}: quantity must be greater than zero`);
    const unitPrice = parseMoney(item.unitPrice, service?.basePrice || 0);
    const lineGross = roundMoney(quantity * unitPrice);
    const lineDiscountType = normalizeLineDiscountType(item.lineDiscountType);
    const lineDiscountValue = lineDiscountType ? parseMoney(item.lineDiscountValue, 0) : 0;
    const lineDiscount = calculateLineDiscountAmount({
      lineTotal: lineGross,
      quantity,
      lineDiscountType,
      lineDiscountValue,
      explicitAmount: item.discountAmount,
    });
    const lineTotal = roundMoney(Math.max(0, lineGross - lineDiscount));
    return {
      service,
      serviceId: service?.id || null,
      description,
      quantity,
      unitPrice,
      lineDiscountType,
      lineDiscountValue,
      discountAmount: lineDiscount,
      lineTotal,
      notes: item.notes ? String(item.notes).trim() : null,
      metadata: {
        source: service ? 'FIELD_SERVICE_CATALOG_LINE' : 'FIELD_SERVICE_CUSTOM_LINE',
        catalogRate: service ? Number(service.basePrice || 0) : null,
      },
    };
  });
};

const logAppointmentEvent = (tx, appointment, {
  eventType,
  fromStatus = null,
  toStatus = null,
  notes = null,
  metadata = {},
  staffId = null,
}) => tx.serviceAppointmentEvent.create({
  data: {
    appointmentId: appointment.id,
    eventType,
    fromStatus,
    toStatus,
    notes,
    metadata,
    changedById: staffId,
  },
});

const getAppointments = async (req, res) => {
  try {
    const where = {};
    if (req.query.status && req.query.status !== 'ALL') where.status = req.query.status;
    if (req.query.customerId) where.customerId = req.query.customerId;
    const appointments = await prisma.serviceAppointment.findMany({
      where,
      include: includeAppointment,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Number(req.query.limit || 100), 200),
    });
    return success(res, { appointments });
  } catch (err) {
    console.error('getAppointments error:', err);
    return error(res, 'Failed to load service appointments');
  }
};

const createAppointment = async (req, res) => {
  const {
    customerId,
    serviceId,
    scheduledAt,
    assignedToId,
    addressId,
    address,
    notes,
    internalNotes,
    subtotal,
    discountAmount = 0,
    totalAmount,
    items = [],
  } = req.body || {};
  const scheduledDate = toDate(scheduledAt);
  if (!customerId) return badRequest(res, 'customerId is required');
  if (!scheduledDate) return badRequest(res, 'scheduledAt is required');

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new PaymentRuleError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
      const selectedAddress = addressId
        ? await tx.address.findFirst({ where: { id: addressId, customerId } })
        : null;
      if (addressId && !selectedAddress) throw new PaymentRuleError('ADDRESS_NOT_FOUND', 'Selected address does not belong to this customer', 404);
      if (!selectedAddress && address) throw new PaymentRuleError('ADDRESS_REQUIRED', 'Save and select a customer address before scheduling service');
      const selectedAddressSnapshot = addressSnapshot(selectedAddress);
      if (assignedToId) {
        const assignee = await tx.staff.findFirst({ where: { id: assignedToId, isActive: true }, select: { id: true } });
        if (!assignee) throw new PaymentRuleError('ASSIGNEE_NOT_FOUND', 'Selected staff member is not active');
      }
      const lines = await normalizeAppointmentLines(tx, { items, serviceId, subtotal, discountAmount, totalAmount });
      const primaryLine = lines[0];
      const service = primaryLine.service;
      const workflow = await getFieldServiceWorkflow();
      const baseAmount = roundMoney(lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0));
      const discount = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0));
      const finalAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
      if (!(finalAmount >= 0)) throw new PaymentRuleError('INVALID_AMOUNT', 'totalAmount must be valid');
      const nextNumber = await nextDocumentNumber({
        tx,
        documentType: 'SERVICE_APPOINTMENT',
        prefix: 'SA-',
        padding: 3,
      });
      const row = await tx.serviceAppointment.create({
        data: {
          appointmentNumber: nextNumber,
          customerId,
          serviceId: service?.id || null,
          serviceName: lines.length === 1 ? primaryLine.description : `${primaryLine.description} + ${lines.length - 1} more`,
          scheduledAt: scheduledDate,
          assignedToId: assignedToId || null,
          addressId: selectedAddress?.id || null,
          address: selectedAddressSnapshot?.formatted || null,
          addressSnapshot: selectedAddressSnapshot,
          notes: notes || null,
          internalNotes: internalNotes || null,
          subtotal: baseAmount,
          discountAmount: discount,
          totalAmount: finalAmount,
          pricingSnapshot: {
            subtotal: baseAmount,
            discountAmount: discount,
            totalAmount: finalAmount,
            source: 'FIELD_SERVICE_APPOINTMENT',
            lines: lines.map((line) => ({
              serviceId: line.serviceId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineDiscountType: line.lineDiscountType,
              lineDiscountValue: line.lineDiscountValue,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              metadata: line.metadata,
            })),
          },
          status: assignedToId ? workflow.assignedInitialStatus : workflow.initialStatus,
          createdById: req.staff?.id || null,
          lines: {
            create: lines.map((line) => ({
              serviceId: line.serviceId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineDiscountType: line.lineDiscountType,
              lineDiscountValue: line.lineDiscountValue,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              notes: line.notes,
              metadata: line.metadata,
            })),
          },
        },
      });
      await logAppointmentEvent(tx, row, {
        eventType: 'FIELD_SERVICE_SCHEDULED',
        toStatus: row.status,
        notes: `Scheduled for ${scheduledDate.toISOString()}`,
        metadata: { assignedToId: assignedToId || null },
        staffId: req.staff?.id || null,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'FIELD_SERVICE_SCHEDULED',
        resource: 'service_appointment',
        resourceId: row.id,
        description: `${row.appointmentNumber} scheduled`,
        metadata: { customerId, serviceId: service?.id || null, itemCount: lines.length, scheduledAt: scheduledDate },
        ...getRequestMeta(req),
      });
      return row;
    });
    const full = await prisma.serviceAppointment.findUnique({ where: { id: appointment.id }, include: includeAppointment });
    return created(res, { appointment: full }, 'Service appointment scheduled');
  } catch (err) {
    console.error('createAppointment error:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to schedule service appointment');
  }
};

const updateStatus = async (req, res) => {
  const { status, notes, assignedToId } = req.body || {};
  if (!status) return badRequest(res, 'status is required');
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "service_appointments" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const current = await tx.serviceAppointment.findUnique({ where: { id: req.params.id } });
      if (!current) throw new PaymentRuleError('SERVICE_APPOINTMENT_NOT_FOUND', 'Service appointment not found', 404);
      const workflow = await getFieldServiceWorkflow();
      const terminalStatuses = workflow.terminalStatuses || [];
      const activeStatuses = workflow.activeStatuses || [];
      const allowedForward = workflow.allowedForward || {};
      if (terminalStatuses.includes(current.status) && current.status !== status) {
        throw new PaymentRuleError('APPOINTMENT_LOCKED', `A ${current.status.toLowerCase()} appointment cannot be moved`);
      }
      if (!activeStatuses.includes(status) && status !== 'CANCELLED') {
        throw new PaymentRuleError('INVALID_STATUS', 'Invalid field service status');
      }
      const allowedTargets = allowedForward[current.status] || [];
      if (current.status !== status && !allowedTargets.includes(status)) {
        throw new PaymentRuleError('INVALID_STATUS_TRANSITION', 'That field service status change is not allowed');
      }
      const now = new Date();
      const nextAssignedToId = assignedToId !== undefined ? assignedToId : current.assignedToId;
      if ((status === 'ASSIGNED' || status === 'IN_PROGRESS') && !nextAssignedToId) {
        throw new PaymentRuleError('ASSIGNEE_REQUIRED', 'Choose a staff member before assigning or starting service');
      }
      if (nextAssignedToId) {
        const assignee = await tx.staff.findFirst({ where: { id: nextAssignedToId, isActive: true }, select: { id: true } });
        if (!assignee) throw new PaymentRuleError('ASSIGNEE_NOT_FOUND', 'Selected staff member is not active');
      }
      const data = {
        status,
        assignedToId: nextAssignedToId,
      };
      if (status === 'IN_PROGRESS' && !current.startedAt) data.startedAt = now;
      if (status === 'SERVICE_DONE' && !current.completedAt) {
        data.completedAt = now;
        data.completedById = req.staff?.id || null;
      }
      if (status === 'CANCELLED') {
        data.cancelledAt = now;
        data.cancelReason = notes || 'Cancelled';
      }
      const updated = await tx.serviceAppointment.update({ where: { id: current.id }, data });
      await logAppointmentEvent(tx, updated, {
        eventType: status === 'CANCELLED' ? 'FIELD_SERVICE_CANCELLED' : 'FIELD_SERVICE_STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: status,
        notes: notes || null,
        metadata: { assignedToId: data.assignedToId || null },
        staffId: req.staff?.id || null,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'FIELD_SERVICE_STATUS_CHANGED',
        resource: 'service_appointment',
        resourceId: updated.id,
        description: `${updated.appointmentNumber}: ${current.status} to ${status}`,
        metadata: { fromStatus: current.status, toStatus: status },
        ...getRequestMeta(req),
      });
      return updated;
    });
    const full = await prisma.serviceAppointment.findUnique({ where: { id: result.id }, include: includeAppointment });
    return success(res, { appointment: full }, 'Service appointment updated');
  } catch (err) {
    console.error('updateStatus error:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to update service appointment');
  }
};

const invoiceAppointment = async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await ensureServiceAppointmentInvoice(tx, req.params.id, req.staff?.id);
      const appointment = await tx.serviceAppointment.findUnique({ where: { id: req.params.id } });
      await logAppointmentEvent(tx, appointment, {
        eventType: 'FIELD_SERVICE_INVOICED',
        fromStatus: appointment.status,
        toStatus: 'INVOICED',
        notes: `${invoice.invoiceNumber} generated`,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
        staffId: req.staff?.id || null,
      });
      return { invoice, appointment };
    }, { isolationLevel: 'Serializable' });
    const full = await prisma.serviceAppointment.findUnique({ where: { id: req.params.id }, include: includeAppointment });
    return success(res, { appointment: full, invoice: result.invoice }, 'Field service invoice generated');
  } catch (err) {
    console.error('invoiceAppointment error:', err);
    if (err instanceof BillingRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to generate field service invoice');
  }
};

const recordAppointmentPayment = async (req, res) => {
  const { amount = 0, paymentMethod, reference, notes, writeOffAmount = 0, writeOffReason, effectiveAt } = req.body || {};
  const paymentAmount = Number(amount || 0);
  const writeOff = Number(writeOffAmount || 0);
  if (!(paymentAmount > 0 || writeOff > 0)) return badRequest(res, 'payment or write-off amount is required');
  const normalizedMethod = paymentAmount > 0 ? normalizePaymentMethod(paymentMethod || 'CASH') : null;
  const corePaymentMethods = await getCorePaymentMethods();
  if (paymentAmount > 0 && !corePaymentMethods.includes(normalizedMethod)) {
    return badRequest(res, `paymentMethod must be one of: ${corePaymentMethods.join(', ')}`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await ensureServiceAppointmentInvoice(tx, req.params.id, req.staff?.id);
      const settlement = await recordInvoiceSettlement(tx, {
        invoiceId: invoice.id,
        amount: paymentAmount,
        method: normalizedMethod,
        reference,
        notes,
        writeOffAmount: writeOff,
        writeOffReason,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
        effectiveAt: effectiveAt ? new Date(effectiveAt) : undefined,
      });
      const appointment = await tx.serviceAppointment.findUnique({ where: { id: req.params.id } });
      await logAppointmentEvent(tx, appointment, {
        eventType: paymentAmount > 0 ? 'FIELD_SERVICE_PAYMENT_RECORDED' : 'FIELD_SERVICE_WRITE_OFF_RECORDED',
        notes: paymentAmount > 0 ? `Rs ${paymentAmount.toFixed(2)} collected` : `Rs ${writeOff.toFixed(2)} written off`,
        metadata: {
          invoiceId: invoice.id,
          paymentId: settlement.payment?.id || null,
          adjustmentId: settlement.adjustment?.id || null,
          balanceDue: settlement.balanceDue,
        },
        staffId: req.staff?.id || null,
      });
      return { settlement, appointment };
    }, { isolationLevel: 'Serializable' });
    const full = await prisma.serviceAppointment.findUnique({ where: { id: req.params.id }, include: includeAppointment });
    return success(res, { appointment: full, settlement: result.settlement }, 'Field service payment recorded');
  } catch (err) {
    console.error('recordAppointmentPayment error:', err);
    if (err instanceof BillingRuleError || err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to record field service payment');
  }
};

const reverseAppointmentPayment = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return badRequest(res, 'A correction reason is required');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.serviceAppointment.findUnique({ where: { id: req.params.id }, include: { invoice: true } });
      if (!appointment) throw new PaymentRuleError('SERVICE_APPOINTMENT_NOT_FOUND', 'Service appointment not found', 404);
      if (!appointment.invoice) throw new PaymentRuleError('INVOICE_NOT_FOUND', 'Field service invoice not found', 404);
      const reversal = await reverseInvoicePaymentCorrection(tx, {
        invoiceId: appointment.invoice.id,
        paymentId: req.params.paymentId,
        reason,
        staff: req.staff,
      });
      await logAppointmentEvent(tx, appointment, {
        eventType: 'FIELD_SERVICE_PAYMENT_ENTRY_VOIDED',
        notes: `Payment entry voided: ${reason}`,
        metadata: { paymentId: req.params.paymentId, invoiceId: appointment.invoice.id },
        staffId: req.staff?.id || null,
      });
      return reversal;
    }, { isolationLevel: 'Serializable' });
    const full = await prisma.serviceAppointment.findUnique({ where: { id: req.params.id }, include: includeAppointment });
    return success(res, { appointment: full, payment: result.payment }, 'Payment entry voided');
  } catch (err) {
    console.error('reverseAppointmentPayment error:', err);
    if (err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to void payment entry');
  }
};

module.exports = {
  getAppointments,
  createAppointment,
  updateStatus,
  invoiceAppointment,
  recordAppointmentPayment,
  reverseAppointmentPayment,
};
