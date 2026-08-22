const prisma = require('../config/database');
const { success, badRequest, notFound, error } = require('../utils/response');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { getWebsitePickupRequestStatuses, getWebsitePickupTimeSlots, getWebsitePickupContactMethods } = require('../services/masterData.service');
const { OUTBOX_EVENT } = require('../services/outbox.service');

const RETRYABLE_PICKUP_NOTIFICATION_TYPES = new Set([
  OUTBOX_EVENT.PICKUP_REQUEST_CREATED,
  OUTBOX_EVENT.PICKUP_REQUEST_CUSTOMER_CONFIRMATION,
]);

const getPickupTimeline = async (requestId) => {
  const entries = await prisma.activityLog.findMany({
    where: { resource: 'website_pickup_request', resourceId: requestId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, actorType: true, actorName: true, action: true, description: true, metadata: true, createdAt: true },
  });
  const outboxIds = [...new Set(entries.map((entry) => entry.metadata?.outboxEventId).filter(Boolean))];
  const outboxEvents = outboxIds.length
    ? await prisma.outboxEvent.findMany({
      where: { id: { in: outboxIds } },
      select: { id: true, status: true, attempts: true, lastError: true, processedAt: true },
    })
    : [];
  const outboxById = new Map(outboxEvents.map((event) => [event.id, event]));

  return entries.map((entry) => {
    const outboxEventId = entry.metadata?.outboxEventId;
    const outbox = outboxEventId ? outboxById.get(outboxEventId) : null;
    if (!outbox) return entry;
    return {
      ...entry,
      notification: {
        outboxEventId,
        status: outbox.status,
        attempts: outbox.attempts,
        lastError: outbox.lastError,
        processedAt: outbox.processedAt,
        canRetry: entry.action === 'PICKUP_REQUEST_WHATSAPP_FAILED' && ['FAILED', 'DEAD'].includes(outbox.status),
        resolved: outbox.status === 'PROCESSED',
      },
    };
  });
};

const pickupSelect = {
  id: true, requestNumber: true, name: true, phone: true, address: true,
  addressLine1: true, addressLine2: true, landmark: true, city: true, pincode: true,
  items: true, itemsSummary: true, preferredDate: true, serviceNeeded: true, preferredSlot: true,
  notes: true, status: true, customerId: true, orderId: true, handledById: true,
  handledAt: true, cancelledReason: true, verifiedAt: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
  handledBy: { select: { id: true, name: true } },
};

const listPickupRequests = async (req, res) => {
  const status = String(req.query.status || '').toUpperCase();
  const search = String(req.query.search || '').trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
  try {
    const [statusConfig, contactMethods, pickupTimeSlots] = await Promise.all([
      getWebsitePickupRequestStatuses(), getWebsitePickupContactMethods(), getWebsitePickupTimeSlots(),
    ]);
    const statusValues = statusConfig.map((item) => item.value);
    if (status && !statusValues.includes(status)) return badRequest(res, 'Invalid pickup request status');
    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { requestNumber: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search.replace(/\D/g, '') } },
          { address: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [requests, total, grouped] = await Promise.all([
      prisma.websitePickupRequest.findMany({ where, select: pickupSelect, orderBy: [{ createdAt: 'desc' }, { requestNumber: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.websitePickupRequest.count({ where }),
      prisma.websitePickupRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return success(res, {
      requests,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      counts: Object.fromEntries(statusValues.map((key) => [key, grouped.find((row) => row.status === key)?._count?._all || 0])),
      statuses: statusConfig,
      contactMethods,
      pickupTimeSlots,
    });
  } catch (err) {
    console.error('listPickupRequests error:', err);
    return error(res, 'Failed to load pickup requests');
  }
};

const getPickupRequest = async (req, res) => {
  try {
    const request = await prisma.websitePickupRequest.findUnique({ where: { id: req.params.id }, select: pickupSelect });
    if (!request) return notFound(res, 'Pickup request not found');
    const timeline = await getPickupTimeline(request.id);
    return success(res, { request, timeline });
  } catch (err) {
    console.error('getPickupRequest error:', err);
    return error(res, 'Failed to load pickup request');
  }
};

const updatePickupRequestStatus = async (req, res) => {
  const status = String(req.body?.status || '').toUpperCase();
  const reason = String(req.body?.reason || '').trim();
  const note = String(req.body?.note || '').trim();
  const contactMethod = String(req.body?.contactMethod || '').toUpperCase();
  const requestedDate = String(req.body?.preferredDate || '').trim();
  const preferredSlot = String(req.body?.preferredSlot || '').trim();
  try {
    const [statusConfig, contactMethods, pickupTimeSlots] = await Promise.all([
      getWebsitePickupRequestStatuses(), getWebsitePickupContactMethods(), getWebsitePickupTimeSlots(),
    ]);
    const target = statusConfig.find((item) => item.value === status);
    if (!target || target.value === 'CONVERTED') return badRequest(res, 'Invalid manual pickup request status');
    if (target.value === 'CANCELLED' && reason.length < 3) return badRequest(res, 'Enter a cancellation reason');
    const contact = contactMethods.find((item) => item.value === contactMethod);
    if (target.requiresContactMethod && !contact) return badRequest(res, 'Select how the customer was contacted');
    const slot = pickupTimeSlots.find((item) => item.value === preferredSlot);
    const confirmedDate = requestedDate ? new Date(`${requestedDate}T12:00:00+05:30`) : null;
    if (target.requiresSchedule && (!confirmedDate || Number.isNaN(confirmedDate.getTime()) || !slot)) {
      return badRequest(res, 'Select the confirmed pickup date and time');
    }
    if (confirmedDate && confirmedDate < new Date(new Date().toDateString())) return badRequest(res, 'Pickup date cannot be in the past');
    if (note.length > 500) return badRequest(res, 'Note must be 500 characters or fewer');
    const request = await prisma.$transaction(async (tx) => {
      const current = await tx.websitePickupRequest.findUnique({ where: { id: req.params.id } });
      if (!current) return null;
      const currentConfig = statusConfig.find((item) => item.value === current.status);
      if (!currentConfig?.allowedTransitions?.includes(status)) throw new Error(`TRANSITION:${current.status}:${status}`);
      const updated = await tx.websitePickupRequest.update({
        where: { id: current.id },
        data: {
          status,
          handledById: req.staff.id,
          handledAt: new Date(),
          cancelledReason: status === 'CANCELLED' ? reason : null,
          ...(target.requiresSchedule && { preferredDate: confirmedDate, preferredSlot }),
        },
        select: pickupSelect,
      });
      const description = target.value === 'CONTACTED'
        ? `Customer contacted by ${contact.label}`
        : target.value === 'CONFIRMED'
          ? `Pickup confirmed for ${confirmedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}, ${slot.label}`
          : target.value === 'CANCELLED'
            ? `Pickup request cancelled: ${reason}`
            : `${current.requestNumber} changed from ${current.status} to ${status}`;
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'WEBSITE_PICKUP_REQUEST_STATUS_UPDATED', resource: 'website_pickup_request', resourceId: current.id,
        description,
        metadata: { from: current.status, to: status, reason: reason || null, note: note || null, contactMethod: contact?.value || null, preferredDate: confirmedDate, preferredSlot: slot?.value || null }, ...getRequestMeta(req),
      });
      return updated;
    });
    if (!request) return notFound(res, 'Pickup request not found');
    const timeline = await getPickupTimeline(request.id);
    return success(res, { request, timeline }, `Pickup request marked ${status.replace(/_/g, ' ').toLowerCase()}`);
  } catch (err) {
    if (String(err.message).startsWith('TRANSITION:')) return badRequest(res, 'This status change is not allowed by the pickup request workflow');
    console.error('updatePickupRequestStatus error:', err);
    return error(res, 'Failed to update pickup request');
  }
};

const retryPickupWhatsApp = async (req, res) => {
  try {
    const request = await prisma.websitePickupRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, requestNumber: true },
    });
    if (!request) return notFound(res, 'Pickup request not found');

    const failure = await prisma.activityLog.findFirst({
      where: {
        id: req.params.activityId,
        resource: 'website_pickup_request',
        resourceId: request.id,
        action: 'PICKUP_REQUEST_WHATSAPP_FAILED',
      },
      select: { id: true, metadata: true },
    });
    if (!failure) return notFound(res, 'WhatsApp failure entry not found');

    const metadata = failure.metadata && typeof failure.metadata === 'object' ? failure.metadata : {};
    const outboxEventId = String(metadata.outboxEventId || '');
    if (!outboxEventId) return badRequest(res, 'This failure has no notification reference');

    const event = await prisma.outboxEvent.findFirst({
      where: { id: outboxEventId, aggregateId: request.id },
      select: { id: true, eventType: true, status: true },
    });
    if (!event || !RETRYABLE_PICKUP_NOTIFICATION_TYPES.has(event.eventType)) {
      return badRequest(res, 'This pickup notification cannot be retried');
    }
    if (event.status === 'PROCESSED') return badRequest(res, 'This WhatsApp message was already sent');
    if (['PENDING', 'PROCESSING'].includes(event.status)) return badRequest(res, 'This WhatsApp retry is already queued');
    if (!['FAILED', 'DEAD'].includes(event.status)) return badRequest(res, 'This WhatsApp failure is not retryable');

    const queuedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const queued = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: { in: ['FAILED', 'DEAD'] } },
        data: {
          status: 'PENDING', attempts: 0, nextAttemptAt: queuedAt,
          lockedAt: null, processedAt: null, lastError: null,
        },
      });
      if (queued.count !== 1) throw new Error('RETRY_ALREADY_QUEUED');
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PICKUP_REQUEST_WHATSAPP_RETRY_QUEUED', resource: 'website_pickup_request', resourceId: request.id,
        description: `WhatsApp retry queued for ${request.requestNumber}`,
        metadata: { channel: 'WHATSAPP', provider: 'WHATOMATE', outcome: 'PENDING', outboxEventId: event.id, retryOfActivityId: failure.id },
        ...getRequestMeta(req),
      });
    });

    return success(res, {
      queued: true,
      outboxEventId: event.id,
      queuedAt: queuedAt.toISOString(),
      timeline: await getPickupTimeline(request.id),
    }, 'WhatsApp retry queued');
  } catch (err) {
    if (err.message === 'RETRY_ALREADY_QUEUED') return badRequest(res, 'This WhatsApp retry is already queued');
    console.error('retryPickupWhatsApp error:', err);
    return error(res, 'Failed to retry WhatsApp message');
  }
};

const preparePickupOrder = async (req, res) => {
  try {
    const statusConfig = await getWebsitePickupRequestStatuses();
    const orderStartStatus = statusConfig.find((item) => item.orderStartTarget)?.value;
    if (!orderStartStatus) throw new Error('ORDER_START_STATUS_MISSING');
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.websitePickupRequest.findUnique({ where: { id: req.params.id } });
      if (!request) return null;
      const currentConfig = statusConfig.find((item) => item.value === request.status);
      if (request.orderId || request.status === 'CONVERTED') throw new Error('ALREADY_CONVERTED');
      if (!currentConfig?.canCreateOrder) throw new Error('ORDER_NOT_ALLOWED');
      if (!request.customerId) throw new Error('CUSTOMER_NOT_LINKED');
      const customer = await tx.customer.findUnique({ where: { id: request.customerId }, select: { id: true, name: true, phone: true } });
      if (!customer) throw new Error('CUSTOMER_NOT_LINKED');
      const updated = await tx.websitePickupRequest.update({
        where: { id: request.id },
        data: { customerId: customer.id, status: orderStartStatus, handledById: req.staff.id, handledAt: new Date() },
        select: pickupSelect,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'WEBSITE_PICKUP_ORDER_STARTED', resource: 'website_pickup_request', resourceId: request.id,
        description: `Order creation started for ${request.requestNumber}`,
        metadata: { customerId: customer.id }, ...getRequestMeta(req),
      });
      return { request: updated, customer };
    });
    if (!result) return notFound(res, 'Pickup request not found');
    return success(res, result, 'Pickup details are ready for order creation');
  } catch (err) {
    if (err.message === 'ALREADY_CONVERTED') return badRequest(res, 'This pickup request already has an order');
    if (err.message === 'ORDER_NOT_ALLOWED') return badRequest(res, 'This request status does not allow order creation');
    if (err.message === 'CUSTOMER_NOT_LINKED') return badRequest(res, 'This pickup request is not linked to a verified customer');
    console.error('preparePickupOrder error:', err);
    return error(res, 'Failed to prepare pickup order');
  }
};

module.exports = { listPickupRequests, getPickupRequest, updatePickupRequestStatus, preparePickupOrder, retryPickupWhatsApp };
