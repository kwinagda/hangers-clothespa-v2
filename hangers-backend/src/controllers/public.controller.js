const prisma = require('../config/database');
const { success, notFound, error, badRequest, created, forbidden } = require('../utils/response');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { compareServiceDisplay } = require('../utils/service-sort');
const { resolvePublicShareToken } = require('../services/publicShare.service');
const { getLegalTerms, getServiceCategoryUi, getWebsitePickupRequestStatuses, getWebsitePickupTimeSlots } = require('../services/masterData.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { enqueueOutboxEvent, OUTBOX_EVENT } = require('../services/outbox.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { normalizeCustomerName, normalizeCustomerPhone, normalizeNullableText } = require('../utils/customer-normalization');
const { createAuthChallenge, verifyAuthChallengeAndIssueToken, consumeAuthChallengeToken, AUTH_CHALLENGE_PURPOSE } = require('../services/authChallenge.service');
const { sendPickupRequestOtp } = require('../services/whatomate.service');
const { pickupOtpSendSchema, pickupOtpVerifySchema, publicPickupRequestSchema, queuedPickupRequestSchema } = require('../validation/public.schemas');
const { randomInt } = require('crypto');

const PUBLIC_SITE_PROFILE_KEY = 'public_site_profile';

const getPublicSiteProfile = async (_req, res) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: PUBLIC_SITE_PROFILE_KEY } });
    if (!setting) return notFound(res, 'Public site profile is not configured');
    const [profile, pickupTimeSlots] = await Promise.all([Promise.resolve(JSON.parse(setting.value)), getWebsitePickupTimeSlots()]);
    return success(res, { profile: { ...profile, pickupTimeSlots } });
  } catch {
    return error(res, 'Failed to fetch public site profile');
  }
};

const sendPublicPickupOtp = async (req, res) => {
  const parsed = pickupOtpSendSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Enter a valid mobile number');
  const phone = normalizeCustomerPhone(parsed.data.phone);
  const code = process.env.DEV_MODE === 'true' ? '123456' : String(randomInt(100000, 1000000));
  try {
    const activeVerification = await prisma.authChallenge.findFirst({
      where: {
        subjectType: 'website_pickup',
        subjectKey: phone,
        purpose: AUTH_CHALLENGE_PURPOSE.WEBSITE_PICKUP_REQUEST,
        status: 'VERIFIED',
        verificationTokenHash: { not: null },
        verificationTokenConsumedAt: null,
        verificationTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (activeVerification) return badRequest(res, 'This mobile number is already verified for the current pickup request.');

    const challenge = await createAuthChallenge({
      subjectType: 'website_pickup', subjectKey: phone, purpose: AUTH_CHALLENGE_PURPOSE.WEBSITE_PICKUP_REQUEST,
      code, ttlMs: 10 * 60 * 1000, maxAttempts: 5, cooldownMs: 60 * 1000,
      metadata: { channel: 'WHATSAPP' },
    });
    try {
      await sendPickupRequestOtp({ phone, code, throwOnFailure: true });
    } catch (providerError) {
      await prisma.authChallenge.update({ where: { id: challenge.id }, data: { status: 'CANCELLED' } }).catch(() => {});
      throw providerError;
    }
    await logPickupOtpEvent(req, {
      actorId: null, phone, action: 'WEBSITE_PICKUP_OTP_SENT', status: 'SUCCESS',
      description: `Pickup verification code sent to mobile ending ${phone.slice(-4)}`,
      metadata: { challengeId: challenge.id, expiresAt: challenge.expiresAt },
    });
    return success(res, {
      expiresIn: 600,
      cooldownSeconds: 60,
      ...(process.env.DEV_MODE === 'true' ? { devOtp: code } : {}),
    }, 'Verification code sent on WhatsApp');
  } catch (err) {
    if (err.code === 'OTP_COOLDOWN') return badRequest(res, `Please wait ${err.secondsLeft} seconds before requesting another code`);
    console.error('sendPublicPickupOtp error:', err);
    await logPickupOtpEvent(req, {
      actorId: null, phone, action: 'WEBSITE_PICKUP_OTP_FAILED', status: 'FAILURE',
      description: 'Pickup verification code could not be sent', metadata: { error: String(err.message || err).slice(0, 300) },
    });
    return error(res, 'Verification code could not be sent. Please try again.');
  }
};

const logPickupOtpEvent = (req, event) => prisma.$transaction((tx) => writeAuditEvent(tx, {
  actorType: 'customer', resource: 'website_pickup_verification', resourceId: event.metadata?.challengeId || event.phone,
  actorId: event.actorId, actorName: null, action: event.action, status: event.status,
  description: event.description, metadata: { phoneLastFour: event.phone.slice(-4), ...event.metadata }, ...getRequestMeta(req),
})).catch((auditError) => console.error('Pickup OTP audit error:', auditError.message));

const verifyPublicPickupOtp = async (req, res) => {
  const parsed = pickupOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Enter the complete 6-digit code');
  const phone = normalizeCustomerPhone(parsed.data.phone);

  try {
    const verification = await verifyAuthChallengeAndIssueToken({
      subjectType: 'website_pickup', subjectKey: phone, purpose: AUTH_CHALLENGE_PURPOSE.WEBSITE_PICKUP_REQUEST,
      code: parsed.data.otp, tokenTtlMs: 10 * 60 * 1000,
    });
    if (!verification.ok) {
      const remaining = verification.remainingAttempts;
      const message = verification.reason === 'LOCKED'
        ? 'Too many incorrect attempts. Request a new code.'
        : verification.reason === 'INVALID'
          ? `Incorrect code${Number.isInteger(remaining) ? `. ${remaining} attempts remaining.` : '.'}`
          : 'This code has expired. Request a new code.';
      return badRequest(res, message);
    }

    await logPickupOtpEvent(req, {
      actorId: null, phone, action: 'WEBSITE_PICKUP_OTP_VERIFIED', status: 'SUCCESS',
      description: `Mobile ending ${phone.slice(-4)} verified for a pickup request`,
      metadata: { challengeId: verification.challenge.id, tokenExpiresAt: verification.tokenExpiresAt },
    });
    return success(res, {
      verificationToken: verification.verificationToken,
      expiresAt: verification.tokenExpiresAt,
    }, 'Mobile number verified');
  } catch (err) {
    console.error('verifyPublicPickupOtp error:', err);
    await logPickupOtpEvent(req, {
      actorId: null, phone, action: 'WEBSITE_PICKUP_OTP_VERIFICATION_FAILED', status: 'FAILURE',
      description: 'Pickup mobile verification failed', metadata: { error: String(err.message || err).slice(0, 300) },
    });
    return error(res, 'Mobile verification could not be completed. Please request a new code.');
  }
};

class PublicPickupInputError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const loadPickupRequestConfig = async () => {
  const [profileSetting, statuses, slots] = await Promise.all([
    prisma.setting.findUnique({ where: { key: PUBLIC_SITE_PROFILE_KEY }, select: { value: true } }),
    getWebsitePickupRequestStatuses(),
    getWebsitePickupTimeSlots(),
  ]);
  return {
    siteProfile: JSON.parse(profileSetting?.value || '{}'),
    pickupStatuses: statuses,
    pickupTimeSlots: slots,
  };
};

const preparePickupRequestData = ({ input, siteProfile, pickupStatuses, pickupTimeSlots }) => {
  const name = normalizeCustomerName(input.name);
  const phone = normalizeCustomerPhone(input.phone);
  const preferredDate = input.preferredDate ? new Date(`${input.preferredDate}T12:00:00+05:30`) : null;
  const preferredSlot = normalizeNullableText(input.preferredSlot);
  const notes = normalizeNullableText(input.notes);
  const initialStatus = pickupStatuses.find((item) => item.initial)?.value;
  const allowedSlots = new Set(pickupTimeSlots.map((item) => item.value));
  if (!initialStatus) throw new PublicPickupInputError('Pickup request workflow is not configured. Please call or WhatsApp the store.', 500);
  if (!name || !phone) throw new PublicPickupInputError('Please enter a valid name and 10-digit Indian mobile number');
  if (preferredSlot && !allowedSlots.has(preferredSlot)) throw new PublicPickupInputError('Select a valid pickup time');
  if (preferredDate && preferredDate < new Date(new Date().toDateString())) throw new PublicPickupInputError('Pickup date cannot be in the past');
  const services = new Map((siteProfile.featuredServices || []).map((service) => [service.key, service]));
  const items = input.items.map((item) => ({ serviceKey: item.serviceKey, serviceName: services.get(item.serviceKey)?.name, quantity: item.quantity }));
  if (items.some((item) => !item.serviceName)) throw new PublicPickupInputError('One or more selected pickup services are unavailable');
  const itemsSummary = items.map((item) => `${item.serviceName}: ${item.quantity} pcs`).join(', ');
  const addressParts = [input.addressLine1, input.addressLine2, input.landmark, input.city, input.pincode].map(normalizeNullableText).filter(Boolean);
  const address = addressParts.join(', ');
  return { name, phone, preferredDate, preferredSlot, notes, initialStatus, items, itemsSummary, address };
};

const persistVerifiedPickupRequest = async ({ tx, req, input, prepared, verificationChallengeId = null, verifiedAt = new Date(), externalSource = null, externalRequestId = null, requestNumber: preAssignedRequestNumber = null, queuedAt = null, enqueueNotifications = true }) => {
  if (externalSource && externalRequestId) {
    const existing = await tx.websitePickupRequest.findFirst({
      where: { externalSource, externalRequestId },
    });
    if (existing) return { request: existing, duplicate: true };
  }

  let customer = await tx.customer.findUnique({ where: { phone: prepared.phone } });
      const customerWasCreated = !customer;
      if (!customer) {
    customer = await tx.customer.create({ data: { phone: prepared.phone, name: prepared.name } });
      } else if (!customer.name) {
    customer = await tx.customer.update({ where: { id: customer.id }, data: { name: prepared.name } });
      }
      const normalizedAddressLine2 = normalizeNullableText(input.addressLine2);
      const normalizedLandmark = normalizeNullableText(input.landmark);
      let addressRecord = await tx.address.findFirst({
        where: { customerId: customer.id, addressLine1: input.addressLine1, addressLine2: normalizedAddressLine2, landmark: normalizedLandmark, city: input.city, pincode: input.pincode },
      });
      const addressWasCreated = !addressRecord;
      if (!addressRecord) {
        const addressCount = await tx.address.count({ where: { customerId: customer.id } });
        addressRecord = await tx.address.create({ data: {
          customerId: customer.id, label: 'Home', addressLine1: input.addressLine1,
          addressLine2: normalizedAddressLine2, landmark: normalizedLandmark,
          city: input.city, pincode: input.pincode, isDefault: addressCount === 0,
        } });
      }
      const requestNumber = preAssignedRequestNumber
        || await nextDocumentNumber({ tx, documentType: 'WEBSITE_PICKUP_REQUEST', prefix: 'PR-', padding: 3 });
      const createdRequest = await tx.websitePickupRequest.create({
        data: {
      requestNumber, name: prepared.name, phone: prepared.phone, address: prepared.address, addressLine1: input.addressLine1,
          addressLine2: normalizeNullableText(input.addressLine2), landmark: normalizeNullableText(input.landmark),
      city: input.city, pincode: input.pincode, items: prepared.items, itemsSummary: prepared.itemsSummary, preferredDate: prepared.preferredDate, preferredSlot: prepared.preferredSlot, notes: prepared.notes,
      status: prepared.initialStatus, customerId: customer.id, verificationChallengeId, verifiedAt, externalSource, externalRequestId, queuedAt,
        },
      });
      await writeAuditEvent(tx, {
    actorType: 'customer', actorId: customer.id, actorName: prepared.name, action: 'WEBSITE_PICKUP_REQUEST_CREATED',
        resource: 'website_pickup_request', resourceId: createdRequest.id,
        description: `${requestNumber} verified and submitted from the website`,
    metadata: { requestNumber, customerId: customer.id, verificationChallengeId, externalSource, externalRequestId, items: prepared.items, preferredDate: prepared.preferredDate, preferredSlot: prepared.preferredSlot },
        ...getRequestMeta(req),
      });
      await writeAuditEvent(tx, {
        actorType: 'system', actorName: 'Website verification', action: 'WEBSITE_PICKUP_OTP_VERIFIED',
        resource: 'website_pickup_request', resourceId: createdRequest.id,
    description: `Mobile ending ${prepared.phone.slice(-4)} verified by WhatsApp code`,
    metadata: { challengeId: verificationChallengeId, externalSource, externalRequestId }, ...getRequestMeta(req),
      });
      await writeAuditEvent(tx, {
        actorType: 'system', actorName: 'Customer records', action: customerWasCreated ? 'WEBSITE_PICKUP_CUSTOMER_CREATED' : 'WEBSITE_PICKUP_CUSTOMER_LINKED',
        resource: 'website_pickup_request', resourceId: createdRequest.id,
        description: customerWasCreated ? 'New CRM customer created from verified pickup request' : 'Pickup request linked to existing CRM customer',
        metadata: { customerId: customer.id }, ...getRequestMeta(req),
      });
      await writeAuditEvent(tx, {
        actorType: 'system', actorName: 'Customer records', action: addressWasCreated ? 'WEBSITE_PICKUP_ADDRESS_CREATED' : 'WEBSITE_PICKUP_ADDRESS_LINKED',
        resource: 'website_pickup_request', resourceId: createdRequest.id,
        description: addressWasCreated ? 'Pickup address added to the customer address book' : 'Pickup address matched to the customer address book',
        metadata: { customerId: customer.id, addressId: addressRecord.id }, ...getRequestMeta(req),
      });
  if (enqueueNotifications) {
    for (const eventType of [OUTBOX_EVENT.PICKUP_REQUEST_CREATED, OUTBOX_EVENT.PICKUP_REQUEST_CUSTOMER_CONFIRMATION]) {
      await enqueueOutboxEvent(tx, {
        eventType, aggregateType: 'website_pickup_request', aggregateId: createdRequest.id,
        payload: {}, dedupeKey: `${eventType.toLowerCase()}:${createdRequest.id}`,
      });
    }
  } else {
    await writeAuditEvent(tx, {
      actorType: 'system', actorName: 'Public pickup intake', action: 'PICKUP_REQUEST_WHATSAPP_SENT',
      resource: 'website_pickup_request', resourceId: createdRequest.id,
      description: 'Customer confirmation and business alert were sent before CRM import',
      metadata: { channel: 'WHATSAPP', provider: 'WHATOMATE', outcome: 'SENT_BEFORE_IMPORT', externalSource, externalRequestId },
      ...getRequestMeta(req),
    });
  }
  return { request: createdRequest, customer };
};

const createPublicPickupRequest = async (req, res) => {
  const parsed = publicPickupRequestSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Please complete all required pickup details');
  const input = parsed.data;

  let prepared;
  try {
    const config = await loadPickupRequestConfig();
    prepared = preparePickupRequestData({ input, ...config });
  } catch (err) {
    if (err instanceof PublicPickupInputError) return error(res, err.message, err.statusCode);
    console.error('createPublicPickupRequest master data error:', err);
    return error(res, 'Pickup request settings are temporarily unavailable. Please call or WhatsApp the store.');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const verification = await consumeAuthChallengeToken({
        subjectType: 'website_pickup', subjectKey: prepared.phone, purpose: AUTH_CHALLENGE_PURPOSE.WEBSITE_PICKUP_REQUEST,
        token: input.verificationToken, tx,
      });
      if (!verification.ok) return { verificationError: verification };
      return persistVerifiedPickupRequest({
        tx,
        req,
        input,
        prepared,
        verificationChallengeId: verification.challenge.id,
        verifiedAt: new Date(),
      });
    });
    if (result.verificationError) {
      return badRequest(res, 'Mobile verification expired or was already used. Please request a new code.');
    }
    return created(res, result, 'Pickup request confirmed. Our team will contact you for the final collection time.');
  } catch (err) {
    console.error('createPublicPickupRequest error:', err);
    return error(res, 'We could not save the pickup request. Please call or WhatsApp the store.');
  }
};

const ingestQueuedPickupRequest = async (req, res) => {
  const expectedSecret = process.env.PICKUP_QUEUE_INGEST_SECRET;
  if (!expectedSecret || req.get('x-pickup-ingest-secret') !== expectedSecret) {
    return forbidden(res, 'Pickup queue ingest is not allowed');
  }
  const parsed = queuedPickupRequestSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Please complete all required pickup details');
  const input = parsed.data;

  let prepared;
  try {
    const config = await loadPickupRequestConfig();
    prepared = preparePickupRequestData({ input, ...config });
  } catch (err) {
    if (err instanceof PublicPickupInputError) return error(res, err.message, err.statusCode);
    console.error('ingestQueuedPickupRequest master data error:', err);
    return error(res, 'Pickup request settings are temporarily unavailable');
  }

  try {
    const result = await prisma.$transaction((tx) => persistVerifiedPickupRequest({
      tx,
      req,
      input,
      prepared,
      verifiedAt: input.verifiedAt ? new Date(input.verifiedAt) : new Date(),
      externalSource: input.externalSource,
      externalRequestId: input.externalRequestId,
      requestNumber: input.requestNumber,
      queuedAt: new Date(),
      enqueueNotifications: false,
    }));
    return success(res, result, result.duplicate ? 'Pickup request already imported' : 'Queued pickup request imported');
  } catch (err) {
    console.error('ingestQueuedPickupRequest error:', err);
    return error(res, 'Queued pickup request could not be imported');
  }
};

const publicQuotationSelect = {
  id: true,
  orderNumber: true,
  quotationStatus: true,
  subtotal: true,
  discount: true,
  totalAmount: true,
  validUntil: true,
  notes: true,
  createdAt: true,
  customer: {
    select: {
      name: true,
    },
  },
  items: {
    select: {
      serviceName: true,
      garmentType: true,
      variant: true,
      quantity: true,
      unitPrice: true,
      lineDiscountAmount: true,
      subtotal: true,
      notes: true,
    },
    orderBy: { createdAt: 'asc' },
  },
};

const normalizePublicQuotation = (quotation) => {
  const items = Array.isArray(quotation?.items)
    ? quotation.items.map((item) => normalizeOrderItem(item, { defaultServiceName: item.serviceName || 'Service' }))
    : [];
  const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const discount = Math.max(0, Number.parseFloat(String(quotation?.discount ?? 0)) || 0);
  const totalAmount = roundMoney(Math.max(0, subtotal - discount));
  return {
    ...quotation,
    items,
    subtotal,
    discount,
    totalAmount,
  };
};

const normalizeCategoryDisplay = (category, categoryUi = {}) => {
  const fallbackLabel = String(category || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const meta = categoryUi?.[category] || {};
  return {
    id: meta.id || String(category || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    key: category,
    label: meta.label || fallbackLabel || 'Services',
    color: meta.color || '#023c62',
    lightColor: meta.lightColor || '#E8F0F7',
  };
};

const canonicalInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  sourceType: true,
  status: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  totalAmount: true,
  paidAmount: true,
  balanceDue: true,
  customer: { select: { name: true, phone: true } },
  order: {
    select: {
      orderNumber: true,
      status: true,
      pickupDate: true,
      deliveryDate: true,
      deliveredAt: true,
    },
  },
  ironBill: {
    select: {
      billNumber: true,
      status: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
      paidAt: true,
    },
  },
  serviceAppointment: {
    select: {
      appointmentNumber: true,
      status: true,
      scheduledAt: true,
      completedAt: true,
      addressSnapshot: true,
      address: true,
    },
  },
  lines: {
    select: {
      lineType: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      lineTotal: true,
      metadata: true,
    },
    orderBy: { createdAt: 'asc' },
  },
};

const normalizeCanonicalInvoice = (invoice) => {
  const source = invoice.order || invoice.ironBill || invoice.serviceAppointment || {};
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.sourceType,
    orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.serviceAppointment?.appointmentNumber || invoice.invoiceNumber,
    status: source.status || invoice.status,
    subtotal: invoice.subtotal,
    discount: invoice.discountAmount,
    couponDiscount: 0,
    upcharge: 0,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    writeOffAmount: Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0) - Number(invoice.balanceDue || 0)),
    paymentStatus: invoice.status === 'PAID' ? 'PAID' : Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
    pickupDate: invoice.order?.pickupDate || invoice.ironBill?.billingPeriodStart || invoice.serviceAppointment?.scheduledAt || invoice.issueDate,
    deliveryDate: invoice.order?.deliveryDate || invoice.ironBill?.billingPeriodEnd || invoice.serviceAppointment?.completedAt || invoice.dueDate,
    deliveredAt: invoice.order?.deliveredAt || invoice.ironBill?.paidAt || invoice.serviceAppointment?.completedAt || null,
    createdAt: invoice.issueDate,
    dueDate: invoice.dueDate,
    customer: invoice.customer,
    items: invoice.lines.map((line) => ({
      serviceName: line.description,
      garmentType: line.lineType,
      variant: null,
      quantity: Number(line.quantity || 0),
      unitPrice: line.unitPrice,
      lineDiscountAmount: line.discountAmount,
      subtotal: line.lineTotal,
    })),
    balanceDue: invoice.balanceDue,
  };
};

const getPublicPaymentSummary = async (customerId, legalTerms) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId,
      status: { not: 'VOID' },
      balanceDue: { gt: 0 },
    },
    select: canonicalInvoiceSelect,
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
  });
  const receivables = invoices.map(normalizeCanonicalInvoice);
  const customer = receivables[0]?.customer || await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, phone: true },
  });
  const totals = receivables.reduce((acc, invoice) => {
    acc.totalAmount += Number(invoice.totalAmount || 0);
    acc.paidAmount += Number(invoice.paidAmount || 0);
    acc.balanceDue += Number(invoice.balanceDue || 0);
    return acc;
  }, { totalAmount: 0, paidAmount: 0, balanceDue: 0 });
  return {
    customer,
    legalTerms,
    generatedAt: new Date(),
    invoiceCount: receivables.length,
    totals: {
      totalAmount: roundMoney(totals.totalAmount),
      paidAmount: roundMoney(totals.paidAmount),
      balanceDue: roundMoney(totals.balanceDue),
    },
    receivables: receivables.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sourceType: invoice.invoiceType,
      sourceNumber: invoice.orderNumber,
      status: invoice.status,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      items: invoice.items,
    })),
  };
};

const startOfMonth = (value) => new Date(value.getFullYear(), value.getMonth(), 1);

const endOfMonth = (value) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getPublicDailyIronLogs = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Daily Iron account not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'DAILY_IRON_LOGS' });
    if (!share || share.resourceType !== 'IRON_SUBSCRIPTION') return notFound(res, 'Daily Iron account not found');

    const subscription = await prisma.ironSubscription.findFirst({
      where: { id: share.resourceId },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!subscription) return notFound(res, 'Daily Iron account not found');

    const requestedMonth = Number(req.query.month);
    const requestedYear = Number(req.query.year);
    const hasRequestedPeriod = Number.isInteger(requestedMonth)
      && requestedMonth >= 1
      && requestedMonth <= 12
      && Number.isInteger(requestedYear)
      && requestedYear >= 2000
      && requestedYear <= 2100;
    let periodStart;
    if (hasRequestedPeriod) {
      periodStart = new Date(requestedYear, requestedMonth - 1, 1);
    } else {
      const latestLog = await prisma.ironLog.findFirst({
        where: { customerId: subscription.customerId, status: 'ACTIVE' },
        select: { date: true },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
      periodStart = startOfMonth(latestLog?.date || new Date());
    }
    if (Number.isNaN(periodStart.getTime())) return notFound(res, 'Daily Iron account not found');
    const periodEnd = endOfMonth(periodStart);

    const [logs, bills] = await Promise.all([
      prisma.ironLog.findMany({
        where: {
          customerId: subscription.customerId,
          status: 'ACTIVE',
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          serviceName: true,
          date: true,
          pieces: true,
          ratePerPiece: true,
          amount: true,
          notes: true,
          bill: { select: { id: true, billNumber: true, status: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.ironBill.findMany({
        where: {
          customerId: subscription.customerId,
          status: { not: 'VOID' },
        },
        select: {
          id: true,
          billNumber: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          totalPieces: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
        },
        orderBy: [{ billingPeriodStart: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      }),
    ]);

    const totals = logs.reduce((acc, log) => {
      acc.pieces += Number(log.pieces || 0);
      acc.amount += Number(log.amount || 0);
      return acc;
    }, { pieces: 0, amount: 0 });

    return success(res, {
      dailyIron: {
        subscription: {
          id: subscription.id,
          status: subscription.applicationStatus,
          appliedAt: subscription.appliedAt,
          confirmedAt: subscription.confirmedAt,
        },
        customer: subscription.customer,
        period: {
          start: periodStart,
          end: periodEnd,
          month: periodStart.getMonth() + 1,
          year: periodStart.getFullYear(),
        },
        logs,
        totals: {
          pieces: totals.pieces,
          amount: Number(totals.amount.toFixed(2)),
        },
        bills,
      },
    });
  } catch (err) {
    console.error('getPublicDailyIronLogs error:', err);
    return error(res, 'Failed to load Daily Iron logs');
  }
};

const getPublicInvoice = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Invoice not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'INVOICE_VIEW' });
    if (!share) return notFound(res, 'Invoice not found');

    if (share.resourceType === 'CUSTOMER') {
      const paymentSummary = await getPublicPaymentSummary(share.resourceId, await getLegalTerms());
      if (!paymentSummary.customer) return notFound(res, 'Payment summary not found');
      return success(res, { paymentSummary });
    }

    const where = share.resourceType === 'INVOICE'
      ? { id: share.resourceId }
      : share.resourceType === 'IRON_BILL'
        ? { ironBillId: share.resourceId }
        : share.resourceType === 'ORDER'
          ? { orderId: share.resourceId }
          : null;
    if (!where) return notFound(res, 'Invoice not found');

    const invoice = await prisma.invoice.findFirst({ where, select: canonicalInvoiceSelect });
    if (!invoice || invoice.status === 'VOID') return notFound(res, 'Invoice not found');
    return success(res, { invoice: { ...normalizeCanonicalInvoice(invoice), legalTerms: await getLegalTerms() } });
  } catch (err) {
    console.error('getPublicInvoice error:', err);
    return error(res, 'Failed to load invoice');
  }
};

const getPublicQuotation = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return notFound(res, 'Quotation not found');
    const share = await resolvePublicShareToken({ token: slug, purpose: 'QUOTATION_VIEW' });
    if (!share || share.resourceType !== 'QUOTATION') return notFound(res, 'Quotation not found');

    const quotation = await prisma.order.findFirst({
      where: {
        id: share.resourceId,
        documentType: 'QUOTATION',
      },
      select: publicQuotationSelect,
    });
    if (!quotation) return notFound(res, 'Quotation not found');

    return success(res, { quotation: { ...normalizePublicQuotation(quotation), legalTerms: await getLegalTerms() } });
  } catch (err) {
    console.error('getPublicQuotation error:', err);
    return error(res, 'Failed to load quotation');
  }
};

const getPublicRateChart = async (_req, res) => {
  try {
    const [services, categoryUi] = await Promise.all([
      prisma.service.findMany({
        where: {
          isActive: true,
          basePrice: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          category: true,
          basePrice: true,
          sortOrder: true,
        },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      getServiceCategoryUi(),
    ]);

    const categoryRank = new Map(Object.keys(categoryUi || {}).map((category, index) => [category, index]));
    const grouped = new Map();
    services.forEach((service) => {
      if (!grouped.has(service.category)) grouped.set(service.category, []);
      grouped.get(service.category).push({
        id: service.id,
        name: service.name,
        price: Number(service.basePrice || 0),
        sortOrder: service.sortOrder,
      });
    });

    const categories = Array.from(grouped.entries())
      .map(([category, items]) => ({
        ...normalizeCategoryDisplay(category, categoryUi),
        items: [...items].sort(compareServiceDisplay),
      }))
      .sort((a, b) => {
        const aRank = categoryRank.has(a.key) ? categoryRank.get(a.key) : Number.MAX_SAFE_INTEGER;
        const bRank = categoryRank.has(b.key) ? categoryRank.get(b.key) : Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.label.localeCompare(b.label);
      });

    return success(res, {
      rateChart: {
        generatedAt: new Date(),
        categories,
        totalItems: services.length,
      },
    });
  } catch (err) {
    console.error('getPublicRateChart error:', err);
    return error(res, 'Failed to load rate chart');
  }
};

module.exports = {
  createPublicPickupRequest,
  ingestQueuedPickupRequest,
  sendPublicPickupOtp,
  verifyPublicPickupOtp,
  getPublicSiteProfile,
  getPublicInvoice,
  getPublicDailyIronLogs,
  getPublicQuotation,
  getPublicRateChart,
};
