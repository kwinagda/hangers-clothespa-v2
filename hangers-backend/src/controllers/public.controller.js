const prisma = require('../config/database');
const { success, notFound, error, badRequest, created, forbidden } = require('../utils/response');
const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');
const { compareServiceDisplay } = require('../utils/service-sort');
const { findPublicShareToken, resolvePublicShareToken } = require('../services/publicShare.service');
const { getLegalTerms, getServiceCategoryUi, getWebsitePickupRequestStatuses, getWebsitePickupTimeSlots } = require('../services/masterData.service');
const { nextDocumentNumber } = require('../services/document-number.service');
const { enqueueOutboxEvent, OUTBOX_EVENT } = require('../services/outbox.service');
const { writeAuditEvent, getRequestMeta, log: logActivity } = require('../services/activity.service');
const { normalizeCustomerName, normalizeCustomerPhone, normalizeNullableText } = require('../utils/customer-normalization');
const { createAuthChallenge, verifyAuthChallengeAndIssueToken, consumeAuthChallengeToken, AUTH_CHALLENGE_PURPOSE } = require('../services/authChallenge.service');
const { sendPickupRequestOtp } = require('../services/whatomate.service');
const { pickupOtpSendSchema, pickupOtpVerifySchema, publicPickupRequestSchema, queuedPickupRequestSchema } = require('../validation/public.schemas');
const { randomInt } = require('crypto');
const { RazorpayCheckoutError, assertProviderCheckoutBinding, canResumeUnattemptedCheckout, canRetryFailedCheckout, createInvoiceCheckout, getMode, getProviderError, getProviderPaymentError, getRazorpay, markAttemptFailed, markAttemptPending, reconcileAmbiguousOrderCreation, safeProviderCode, safeProviderMessage, settleCapturedPayment } = require('../services/razorpay-invoice-checkout.service');
const { getRazorpayTestContact } = require('../utils/razorpay-test-contact');
const { ALLOWED_EVENTS: RAZORPAY_EXPERIMENT_EVENTS, EXPERIMENT_ID: RAZORPAY_EXPERIMENT_ID, assignVariant: assignRazorpayVariant, getExperimentConfig: getRazorpayExperimentConfig, hashVisitorId: hashRazorpayExperimentVisitor, normalizeVisitorId: normalizeRazorpayExperimentVisitor } = require('../utils/razorpay-checkout-experiment');
const { paymentApiError } = require('../utils/payment-api-error');
const { razorpayErrorSummary } = require('../utils/redact');
const { buildPublicRazorpayCallbackUrl, buildPublicInvoiceReturnUrl } = require('../utils/razorpay-public-callback');
const { assertCustomMode, getCustomCheckoutBootstrap, fetchCustomCardEligibility } = require('../services/razorpay-custom-capabilities.service');
const { getRazorpayDowntimeSnapshot, matchRazorpayDowntime } = require('../services/razorpay-downtime.service');
const { prepareRazorpayVirtualAccount } = require('../services/razorpay-bank-transfer.service');
const { openInvoiceWhere } = require('../services/receivables.service');

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
  creditAmount: true,
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
  const items = invoice.lines.map((line) => ({
    serviceName: line.description,
    garmentType: line.lineType,
    variant: null,
    quantity: Number(line.quantity || 0),
    unitPrice: line.unitPrice,
    lineDiscountAmount: line.discountAmount,
    subtotal: line.lineTotal,
  }));
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.sourceType,
    orderNumber: invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.serviceAppointment?.appointmentNumber || invoice.invoiceNumber,
    status: source.status || invoice.status,
    subtotal: invoice.subtotal,
    discount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    creditAmount: invoice.creditAmount,
    paymentStatus: invoice.status === 'PAID' ? 'PAID' : Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
    pickupDate: invoice.order?.pickupDate || invoice.ironBill?.billingPeriodStart || invoice.serviceAppointment?.scheduledAt || null,
    deliveryDate: invoice.order?.deliveryDate || null,
    serviceDate: invoice.serviceAppointment?.scheduledAt || null,
    deliveredAt: invoice.order?.deliveredAt || invoice.ironBill?.paidAt || invoice.serviceAppointment?.completedAt || null,
    createdAt: invoice.issueDate,
    dueDate: invoice.dueDate,
    customer: invoice.customer,
    totalPieces: items.reduce((total, item) => total + item.quantity, 0),
    items,
    balanceDue: invoice.balanceDue,
  };
};

const getPublicPaymentSummary = async (customerId, legalTerms) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId,
      ...openInvoiceWhere,
    },
    select: canonicalInvoiceSelect,
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { id: 'asc' }],
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
      totalPieces: invoice.totalPieces,
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

const getPublicInvoiceForPayment = async (slug, { countAccess = true, invoiceId = null } = {}) => {
  const share = await (countAccess ? resolvePublicShareToken : findPublicShareToken)({ token: slug, purpose: 'INVOICE_VIEW' });
  if (!share) return null;
  const where = share.resourceType === 'INVOICE'
    ? { id: share.resourceId }
    : share.resourceType === 'IRON_BILL'
      ? { ironBillId: share.resourceId }
      : share.resourceType === 'ORDER'
        ? { orderId: share.resourceId }
        : share.resourceType === 'CUSTOMER' && invoiceId
          ? { id: String(invoiceId), customerId: share.resourceId }
          : null;
  if (!where) return null;
  const scopedWhere = invoiceId && share.resourceType !== 'CUSTOMER'
    ? { AND: [where, { id: String(invoiceId) }] }
    : where;
  const invoice = await prisma.invoice.findFirst({ where: scopedWhere, select: { id: true, invoiceNumber: true, customerId: true, orderId: true, status: true, currency: true, balanceDue: true, totalAmount: true } });
  if (!invoice || invoice.status === 'VOID') return null;
  return { share, invoice };
};

const logRazorpayAction = (req, action, description, metadata = {}, status = 'SUCCESS') => logActivity({
  ...getRequestMeta(req),
  actorType: 'customer',
  action,
  resource: 'razorpay_payment',
  resourceId: metadata.paymentId || metadata.razorpayOrderId || metadata.invoiceId || null,
  description,
  status: status === 'FAILED' ? 'FAILURE' : status,
  metadata: {
    provider: 'RAZORPAY',
    ...metadata,
  },
});

const publicCheckoutRedirectOptions = (slug, invoiceId) => {
  try {
    buildPublicInvoiceReturnUrl({ slug, invoiceId });
    return {
      callbackUrl: buildPublicRazorpayCallbackUrl({ slug, invoiceId, apiUrl: process.env.PUBLIC_API_URL || process.env.CRM_URL || 'http://localhost:5002' }),
      redirectCheckoutAvailable: true,
    };
  } catch {
    return { redirectCheckoutAvailable: false };
  }
};

const isExperimentEventId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(value || '').toLowerCase());

const assignPublicRazorpayCheckoutExperiment = async (req, res) => {
  const config = getRazorpayExperimentConfig();
  if (!config.enabled) return notFound(res, 'Checkout presentation experiment is not enabled');
  const visitorId = normalizeRazorpayExperimentVisitor(req.body?.visitorId);
  const eventId = String(req.body?.eventId || '').toLowerCase();
  if (!visitorId || !isExperimentEventId(eventId)) return badRequest(res, 'A valid anonymous experiment session and event ID are required');
  try {
    if (!(await getPublicInvoiceForPayment(String(req.params.slug || ''), { countAccess: false, invoiceId: req.body?.invoiceId }))) return notFound(res, 'Invoice is not available');
    const visitorHash = hashRazorpayExperimentVisitor(visitorId, config.hashSecret);
    const variant = assignRazorpayVariant(visitorHash);
    const existing = await prisma.razorpayCheckoutExperimentEvent.findUnique({ where: { eventId } });
    if (existing && (existing.experimentId !== RAZORPAY_EXPERIMENT_ID || existing.visitorHash !== visitorHash || existing.eventType !== 'EXPOSURE' || existing.variant !== variant)) {
      return badRequest(res, 'Experiment event ID was already used for a different event');
    }
    if (!existing) await prisma.razorpayCheckoutExperimentEvent.create({
      data: { eventId, experimentId: RAZORPAY_EXPERIMENT_ID, visitorHash, variant, eventType: 'EXPOSURE', mode: 'TEST' },
    });
    return success(res, { experimentId: RAZORPAY_EXPERIMENT_ID, variant });
  } catch (err) {
    console.error('assignPublicRazorpayCheckoutExperiment failed:', err?.code || 'DB_ERROR');
    return error(res, 'Could not assign checkout presentation');
  }
};

const recordPublicRazorpayCheckoutExperimentEvent = async (req, res) => {
  const config = getRazorpayExperimentConfig();
  if (!config.enabled) return notFound(res, 'Checkout presentation experiment is not enabled');
  const visitorId = normalizeRazorpayExperimentVisitor(req.body?.visitorId);
  const eventId = String(req.body?.eventId || '').toLowerCase();
  const variant = String(req.body?.variant || '');
  const eventType = String(req.body?.eventType || '');
  const attemptId = req.body?.attemptId ? String(req.body.attemptId) : null;
  if (!visitorId || !isExperimentEventId(eventId) || !['A', 'B'].includes(variant)
    || !RAZORPAY_EXPERIMENT_EVENTS.has(eventType) || ['EXPOSURE', 'CRM_CAPTURED'].includes(eventType)
    || (attemptId && attemptId.length > 64)) return badRequest(res, 'Checkout experiment event is invalid');
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { countAccess: false, invoiceId: req.body?.invoiceId });
    if (!target) return notFound(res, 'Invoice is not available');
    const visitorHash = hashRazorpayExperimentVisitor(visitorId, config.hashSecret);
    if (assignRazorpayVariant(visitorHash) !== variant) return badRequest(res, 'Checkout experiment assignment does not match this session');
    const exposure = await prisma.razorpayCheckoutExperimentEvent.findFirst({
      where: { experimentId: RAZORPAY_EXPERIMENT_ID, visitorHash, variant, eventType: 'EXPOSURE', mode: 'TEST' },
      select: { id: true },
    });
    if (!exposure) return badRequest(res, 'Checkout experiment exposure was not recorded');
    if (['CHECKOUT_OPEN_REQUESTED', 'CHECKOUT_DISMISSED', 'CHECKOUT_HANDLER_RETURNED', 'PAYMENT_FAILED_CALLBACK'].includes(eventType) && !attemptId) {
      return badRequest(res, 'A checkout attempt is required for this event');
    }
    if (attemptId) {
      const attempt = await prisma.razorpayCheckoutAttempt.findFirst({
        where: { id: attemptId, invoiceId: target.invoice.id, mode: 'TEST', experimentId: RAZORPAY_EXPERIMENT_ID, experimentVariant: variant, experimentVisitorHash: visitorHash },
        select: { id: true },
      });
      if (!attempt) return badRequest(res, 'Checkout attempt does not match this experiment session');
    }
    const priorEvent = await prisma.razorpayCheckoutExperimentEvent.findUnique({ where: { eventId } });
    if (priorEvent) {
      const sameEvent = priorEvent.experimentId === RAZORPAY_EXPERIMENT_ID && priorEvent.visitorHash === visitorHash
        && priorEvent.variant === variant && priorEvent.eventType === eventType && priorEvent.attemptId === attemptId;
      if (!sameEvent) return badRequest(res, 'Experiment event ID was already used for a different event');
      return success(res, { accepted: true, duplicate: true });
    }
    await prisma.razorpayCheckoutExperimentEvent.create({
      data: { eventId, experimentId: RAZORPAY_EXPERIMENT_ID, visitorHash, variant, eventType, attemptId, mode: 'TEST' },
    });
    return success(res, { accepted: true, duplicate: false });
  } catch (err) {
    console.error('recordPublicRazorpayCheckoutExperimentEvent failed:', err?.code || 'DB_ERROR');
    return error(res, 'Could not record checkout experiment event');
  }
};

const customCheckoutFailure = (req, res, err) => paymentApiError(res, {
  statusCode: err instanceof RazorpayCheckoutError ? err.statusCode : 503,
  code: err instanceof RazorpayCheckoutError ? err.code : 'CUSTOM_CHECKOUT_UNAVAILABLE',
  message: err instanceof RazorpayCheckoutError ? err.message : 'Checkout details are temporarily unavailable.',
  requestId: req.id,
  details: err instanceof RazorpayCheckoutError ? err.details : undefined,
});

const getPublicCustomCapabilities = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.query.invoiceId });
    if (!target) return notFound(res, 'Invoice not found');
    return success(res, await getCustomCheckoutBootstrap());
  } catch (err) { return customCheckoutFailure(req, res, err); }
};

const getPublicCustomCardEligibility = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.body?.invoiceId });
    if (!target) return notFound(res, 'Invoice not found');
    return success(res, await fetchCustomCardEligibility(req.body?.iin));
  } catch (err) { return customCheckoutFailure(req, res, err); }
};

const getPublicCustomDowntime = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.query.invoiceId });
    if (!target) return notFound(res, 'Invoice not found');
    const mode = assertCustomMode();
    const snapshot = await getRazorpayDowntimeSnapshot({ mode });
    // Pass exact provider identifiers; do not infer PSPs from app names or handles.
    const selection = Object.fromEntries(['method', 'network', 'issuer', 'card_type', 'bank', 'flow', 'psp', 'vpa_handle'].flatMap((field) => (
      typeof req.query[field] === 'string' && req.query[field].length <= 80 ? [[field, req.query[field]]] : []
    )));
    return success(res, {
      ...snapshot,
      incidents: snapshot.incidents.map((incident) => ({
        ...incident,
        match: matchRazorpayDowntime(incident, selection, { stale: snapshot.status !== 'fresh' }),
      })),
    });
  } catch (err) { return customCheckoutFailure(req, res, err); }
};

const preparePublicCustomBankTransfer = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.body?.invoiceId });
    if (!target) return notFound(res, 'Invoice not found');
    if (typeof req.body?.attemptId !== 'string' || req.body.attemptId.length > 40) {
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_INVALID', 'Checkout attempt is required', 400);
    }
    const instructions = await prepareRazorpayVirtualAccount({
      attemptId: req.body.attemptId, invoiceId: target.invoice.id, shareId: target.share.id,
      virtualAccountId: req.body.virtualAccountId,
    });
    await logRazorpayAction(req, 'RAZORPAY_BANK_TRANSFER_INSTRUCTIONS', 'Bank transfer instructions prepared for the scoped checkout', {
      checkoutAttemptId: req.body.attemptId, invoiceId: target.invoice.id, virtualAccountId: instructions.virtualAccountId || null,
    });
    return success(res, instructions);
  } catch (err) { return customCheckoutFailure(req, res, err); }
};

const createPublicRazorpayOrder = async (req, res, _next, testHooks = {}) => {
  const startedAt = Date.now();
  let checkoutInvoiceId = null;
  try {
    const customCheckout = req.body?.checkoutIntegration === 'CUSTOM';
    if (customCheckout) assertCustomMode();
    const mode = String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
    const testContact = getRazorpayTestContact({
      mode,
      configuredContact: process.env.RAZORPAY_TEST_CONTACT_NUMBER,
    });
    if (mode === 'TEST' && !testContact) {
      await logRazorpayAction(req, 'RAZORPAY_TEST_CONTACT_REQUIRED', 'Test checkout blocked because the approved test contact is not configured', {
        code: 'TEST_CONTACT_NOT_CONFIGURED', requestId: req.id,
      }, 'FAILED');
      return paymentApiError(res, { statusCode: 503, code: 'TEST_CONTACT_NOT_CONFIGURED', message: 'Test checkout is unavailable until the approved test contact is configured.', requestId: req.id, retryable: false, action: 'CONTACT_SUPPORT' });
    }
    let experiment;
    if (req.body?.experiment) {
      const config = getRazorpayExperimentConfig();
      const visitorId = normalizeRazorpayExperimentVisitor(req.body.experiment?.visitorId);
      const variant = String(req.body.experiment?.variant || '');
      const eventId = String(req.body.experiment?.eventId || '').toLowerCase();
      if (!config.enabled || mode !== 'TEST' || !visitorId || !['A', 'B'].includes(variant) || !isExperimentEventId(eventId)) {
        return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_EXPERIMENT_INVALID', message: 'Checkout experiment assignment is invalid', requestId: req.id });
      }
      const visitorHash = hashRazorpayExperimentVisitor(visitorId, config.hashSecret);
      if (assignRazorpayVariant(visitorHash) !== variant) {
        return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_EXPERIMENT_INVALID', message: 'Checkout experiment assignment does not match this session', requestId: req.id });
      }
      const exposure = await prisma.razorpayCheckoutExperimentEvent.findUnique({ where: { eventId } });
      if (!exposure || exposure.experimentId !== RAZORPAY_EXPERIMENT_ID || exposure.visitorHash !== visitorHash
        || exposure.variant !== variant || exposure.eventType !== 'EXPOSURE' || exposure.mode !== 'TEST') {
        return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_EXPERIMENT_EXPOSURE_REQUIRED', message: 'Checkout experiment exposure must be recorded before payment starts', requestId: req.id });
      }
      experiment = { id: RAZORPAY_EXPERIMENT_ID, variant, visitorHash };
    }
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.body?.invoiceId });
    if (!target) return paymentApiError(res, { statusCode: 404, code: 'INVOICE_NOT_PAYABLE', message: 'Online payment is not available for this invoice', requestId: req.id });
    checkoutInvoiceId = target.invoice.id;
    let allocationPlan = null;
    if (target.share.resourceType === 'CUSTOMER' && req.body?.paymentScope !== 'CUSTOMER_OUTSTANDING') {
      return paymentApiError(res, { statusCode: 400, code: 'INVALID_PAYMENT_SCOPE', message: 'A customer payment link must pay the full outstanding balance', requestId: req.id });
    }
    if (req.body?.paymentScope === 'CUSTOMER_OUTSTANDING') {
      if (target.share.resourceType !== 'CUSTOMER') return paymentApiError(res, { statusCode: 400, code: 'INVALID_PAYMENT_SCOPE', message: 'Combined outstanding payment is available only from a customer payment link', requestId: req.id });
      const summary = await getPublicPaymentSummary(target.share.resourceId, null);
      if (!summary.receivables.length || summary.receivables[0].invoiceId !== target.invoice.id) {
        return paymentApiError(res, { statusCode: 409, code: 'CHECKOUT_ATTEMPT_STALE', message: 'The outstanding invoices changed. Refresh the payment link and try again.', requestId: req.id });
      }
      allocationPlan = summary.receivables.map((item) => ({ invoiceId: item.invoiceId, amount: Number(item.balanceDue) }));
    }
    await (testHooks.logRazorpayAction || logRazorpayAction)(req, 'RAZORPAY_CHECKOUT_INITIATED', 'Customer initiated Razorpay checkout', {
      invoiceId: target.invoice.id,
      invoiceNumber: target.invoice.invoiceNumber,
      orderId: target.invoice.orderId,
      requestId: req.id,
    });
    const result = await (testHooks.createInvoiceCheckout || createInvoiceCheckout)({
      invoice: target.invoice,
      shareId: target.share.id,
      idempotencyKey: req.get('Idempotency-Key'),
      requestId: req.id,
      experiment,
      allocationPlan,
      customCheckout,
      ...(testHooks.provider ? { provider: testHooks.provider } : {}),
    });
    await (testHooks.logRazorpayAction || logRazorpayAction)(req, 'RAZORPAY_ORDER_CREATED', 'Razorpay order created for invoice checkout', {
      checkoutAttemptId: result.attempt.id,
      invoiceId: target.invoice.id,
      invoiceNumber: target.invoice.invoiceNumber,
      ...(customCheckout ? { customCheckout: true, credCoinsDisabled: result.order.notes?.cred_coins_disabled === '1' } : {}),
      orderId: target.invoice.orderId,
      razorpayOrderId: result.order.id,
      amountPaise: result.order.amount,
      currency: result.order.currency,
      reused: result.reused,
      experimentId: result.attempt.experimentId || null,
      experimentVariant: result.attempt.experimentVariant || null,
      durationMs: Date.now() - startedAt,
    });
    return success(res, {
      checkoutAttemptId: result.attempt.id,
      razorpayOrderId: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
      mode: result.attempt.mode,
      ...(customCheckout ? { customCheckout: true, credCoinsDisabled: result.order.notes?.cred_coins_disabled === '1' } : {}),
      ...(result.attempt.mode === 'TEST' ? { testContact } : {}),
      key: process.env.RAZORPAY_KEY_ID,
      invoiceNumber: target.invoice.invoiceNumber,
      ...publicCheckoutRedirectOptions(req.params.slug, target.invoice.id),
      ...(experiment ? { experiment: { id: experiment.id, variant: experiment.variant } } : {}),
    });
  } catch (err) {
    await (testHooks.logRazorpayAction || logRazorpayAction)(req, 'RAZORPAY_ORDER_CREATE_FAILED', 'Razorpay order creation failed', {
      requestId: req.id || null,
      invoiceId: checkoutInvoiceId,
      applicationErrorCode: err instanceof RazorpayCheckoutError ? err.code : null,
      checkoutAttemptId: err instanceof RazorpayCheckoutError ? err.details?.checkoutAttemptId || null : null,
      code: safeProviderCode(err), error: safeProviderMessage(err), providerError: razorpayErrorSummary(err), durationMs: Date.now() - startedAt,
    }, 'FAILED');
    if (err instanceof RazorpayCheckoutError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id, details: err.details });
    console.error('createPublicRazorpayOrder failed:', safeProviderCode(err));
    return paymentApiError(res, { code: 'CHECKOUT_ORDER_CREATE_FAILED', message: 'Failed to start online payment', requestId: req.id });
  }
};

const verifyPublicRazorpayPayment = async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    await logRazorpayAction(req, 'RAZORPAY_CALLBACK_INVALID', 'Razorpay callback was missing verification fields', {
      orderIdPresent: Boolean(razorpayOrderId),
      paymentIdPresent: Boolean(razorpayPaymentId),
      signaturePresent: Boolean(razorpaySignature),
    }, 'FAILED');
    return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_CALLBACK_FIELDS_REQUIRED', message: 'Razorpay order, payment, and signature are required', requestId: req.id });
  }
  await logRazorpayAction(req, 'RAZORPAY_CALLBACK_RECEIVED', 'Razorpay checkout callback received', {
    providerOrderId: razorpayOrderId,
    providerPaymentId: razorpayPaymentId,
    signaturePresent: true,
  });
  try {
    const target = await getPublicInvoiceForPayment(String(req.params.slug || ''), { invoiceId: req.body?.invoiceId });
    if (!target) return paymentApiError(res, { statusCode: 404, code: 'INVOICE_NOT_PAYABLE', message: 'Online payment is not available for this invoice', requestId: req.id });
    const result = await settleCapturedPayment({
      paymentId: String(razorpayPaymentId),
      providerOrderId: String(razorpayOrderId),
      signature: String(razorpaySignature),
      source: 'PUBLIC_INVOICE',
      expectedInvoiceId: target.invoice.id,
    });
    if (result.pending) {
      await logRazorpayAction(req, 'RAZORPAY_PAYMENT_PENDING', 'Provider callback received; payment is not yet captured', {
        invoiceId: target.invoice.id, checkoutAttemptId: result.attempt.id, providerPaymentId: razorpayPaymentId, providerStatus: result.providerStatus,
      });
      return success(res, { status: 'PENDING', invoiceNumber: target.invoice.invoiceNumber, message: 'Payment is still processing. Do not retry yet; refresh this invoice shortly.' }, 'Payment processing');
    }
    if (result.failed) return paymentApiError(res, { statusCode: 409, code: 'RAZORPAY_PAYMENT_FAILED', message: 'Razorpay reports this payment failed. You can retry this invoice payment.', requestId: req.id, retryable: true, action: 'RETRY_CHECKOUT_SAME_ORDER' });
    await logRazorpayAction(req, 'RAZORPAY_PAYMENT_SETTLED', 'Razorpay payment verified and posted to CRM ledger', {
      invoiceId: target.invoice.id,
      invoiceNumber: target.invoice.invoiceNumber,
      checkoutAttemptId: result.attempt.id,
      orderId: result.order?.id || target.invoice.orderId,
      providerOrderId: razorpayOrderId,
      providerPaymentId: razorpayPaymentId,
      crmPaymentId: result.payment?.id,
      amount: result.payment?.amount,
      paymentStatus: result.paymentStatus,
      balanceDue: result.balanceDue,
      whatsappQueued: Boolean(result.payment && result.order),
      alreadyRecorded: Boolean(result.alreadyRecorded),
    });
    return success(res, {
      invoiceNumber: target.invoice.invoiceNumber,
      paymentId: result.payment?.id,
      amount: result.payment?.amount,
      balanceDue: result.invoice?.balanceDue ?? result.balanceDue,
      paymentStatus: result.invoice?.status || result.paymentStatus,
      order: result.order ? {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        paymentStatus: result.order.paymentStatus,
        paidAmount: result.order.paidAmount,
        balanceDue: result.balanceDue,
      } : null,
    }, 'Payment successful');
  } catch (err) {
    await logRazorpayAction(req, 'RAZORPAY_PAYMENT_FAILED', 'Razorpay payment verification or settlement failed', {
      razorpayOrderId,
      paymentId: razorpayPaymentId,
      errorCode: safeProviderCode(err),
      providerError: razorpayErrorSummary(err),
    }, 'FAILED');
    if (err instanceof RazorpayCheckoutError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id, retryable: err.statusCode >= 500, details: err.details });
    console.error('verifyPublicRazorpayPayment failed:', safeProviderCode(err));
    return paymentApiError(res, { code: 'CHECKOUT_VERIFICATION_FAILED', message: 'Payment verification failed', requestId: req.id });
  }
};

const publicCallbackDiagnostics = (body) => {
  let providerError = body?.error;
  if (typeof providerError === 'string') {
    if (providerError.length > 8192) return null;
    try { providerError = JSON.parse(providerError); } catch { return null; }
  }
  if (!providerError || typeof providerError !== 'object' || Array.isArray(providerError)) return null;
  // Apply instrument/identity redaction before the bounded audit sanitizer.
  const sanitized = getProviderError({ error: providerError }) || { metadata: providerError.metadata };
  const { order_id, payment_id, ...fields } = razorpayErrorSummary({ error: sanitized });
  if (!Object.keys(fields).length && !order_id && !payment_id) return null;
  return {
    origin: 'razorpay', ...fields,
    ...((order_id || payment_id) ? { metadata: {
      ...(order_id ? { order_id } : {}), ...(payment_id ? { payment_id } : {}),
    } } : {}),
  };
};

const handlePublicRazorpayCallback = async (req, res, _next, testHooks = {}) => {
  const resolveInvoice = testHooks.getPublicInvoiceForPayment || getPublicInvoiceForPayment;
  const settlePayment = testHooks.settleCapturedPayment || settleCapturedPayment;
  const logAction = testHooks.logRazorpayAction || logRazorpayAction;
  const slug = String(req.params.slug || '');
  const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : undefined;
  let destination;
  try {
    const target = await resolveInvoice(slug, { invoiceId, countAccess: false });
    if (!target) return notFound(res, 'Invoice not found');
    destination = buildPublicInvoiceReturnUrl({ slug, invoiceId: target.invoice.id });
    const body = req.body || {};
    const references = ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'];
    const complete = references.every((field) => typeof body[field] === 'string' && body[field].length > 0 && body[field].length <= 256);
    if (!complete) {
      const providerError = publicCallbackDiagnostics(body);
      const diagnostic = providerError ? {
        providerError, provenance: 'UNSIGNED_CALLBACK', requiresStatusCheck: true,
      } : null;
      if (diagnostic) {
        // Fragments are not sent to the invoice server or in HTTP referrers.
        const returnUrl = new URL(destination);
        returnUrl.hash = `razorpayCallback=${encodeURIComponent(JSON.stringify(diagnostic))}`;
        destination = returnUrl.toString();
      }
      await logAction(req, providerError ? 'RAZORPAY_REDIRECT_CALLBACK_FAILED' : 'RAZORPAY_CALLBACK_INVALID', 'Redirect callback did not confirm capture; invoice status must be checked', {
        invoiceId: target.invoice.id,
        publicShareId: target.share.id,
        ...(diagnostic || {}),
      }, 'FAILED');
    } else {
      const result = await settlePayment({
        providerOrderId: body.razorpay_order_id,
        paymentId: body.razorpay_payment_id,
        signature: body.razorpay_signature,
        source: 'PUBLIC_INVOICE',
        expectedInvoiceId: target.invoice.id,
      });
      await logAction(req, 'RAZORPAY_REDIRECT_CALLBACK_VERIFIED', 'Redirect callback verified; customer returned to invoice for current payment status', {
        invoiceId: target.invoice.id,
        razorpayOrderId: body.razorpay_order_id,
        paymentId: body.razorpay_payment_id,
        pending: Boolean(result.pending), failed: Boolean(result.failed),
        alreadyRecorded: Boolean(result.alreadyRecorded),
      });
    }
  } catch (err) {
    await logAction(req, 'RAZORPAY_REDIRECT_CALLBACK_FAILED', 'Redirect callback could not confirm payment; status recovery remains required', {
      errorCode: safeProviderCode(err), providerError: razorpayErrorSummary(err),
    }, 'FAILED');
    if (!destination) return error(res, 'Could not return to invoice');
  }
  res.set('Cache-Control', 'no-store');
  return res.redirect(303, destination);
};

const getPublicRazorpayCheckoutStatus = async (req, res, _next, testHooks = {}) => {
  const attemptId = String(req.query.attemptId || '').trim();
  if (attemptId.length > 40) return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_ATTEMPT_INVALID', message: 'The checkout attempt is invalid', requestId: req.id });
  const resolveInvoice = testHooks.getPublicInvoiceForPayment || getPublicInvoiceForPayment;
  const db = testHooks.prisma || prisma;
  const settlePayment = testHooks.settleCapturedPayment || settleCapturedPayment;
  const failAttempt = testHooks.markAttemptFailed || markAttemptFailed;
  const pendAttempt = testHooks.markAttemptPending || markAttemptPending;
  const logAction = testHooks.logRazorpayAction || logRazorpayAction;
  let checkoutInvoiceId = null;
  try {
    const customCheckout = req.query.checkoutIntegration === 'CUSTOM';
    const target = await resolveInvoice(String(req.params.slug || ''), { invoiceId: req.query.invoiceId });
    if (!target) return paymentApiError(res, { statusCode: 404, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found', requestId: req.id });
    checkoutInvoiceId = target.invoice.id;
    let attempt = await db.razorpayCheckoutAttempt.findFirst({
      where: { customerId: target.invoice.customerId, publicShareId: target.share.id,
        ...(target.share.resourceType === 'CUSTOMER'
          ? { customerId: target.share.resourceId, OR: [{ invoiceId: target.invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: target.invoice.id }] } }] }
          : { invoiceId: target.invoice.id }),
        ...(attemptId ? { id: attemptId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    let invoice = null;
    // Checkout creation guards active attempts invoice-wide. A replacement
    // share for this same invoice may inspect and recover its existing attempt;
    // provider order notes and payment evidence are still checked below.
    if (!attempt && !attemptId) {
      const activeAttempt = await db.razorpayCheckoutAttempt.findFirst({
        where: {
          customerId: target.invoice.customerId,
          OR: [{ invoiceId: target.invoice.id }, { allocationPlan: { array_contains: [{ invoiceId: target.invoice.id }] } }],
          status: { in: ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeAttempt) {
        if (activeAttempt.invoiceId === target.invoice.id && !activeAttempt.allocationPlan
          && target.share.resourceType === 'INVOICE') {
          attempt = activeAttempt;
        } else {
          const invoice = await db.invoice.findUnique({
            where: { id: target.invoice.id },
            select: { invoiceNumber: true, status: true, balanceDue: true, paidAmount: true },
          });
          return success(res, {
            attemptId: null,
            status: 'PENDING',
            canResumeCheckout: false,
            providerLookupUnavailable: false,
            observedAt: new Date().toISOString(),
            ...(customCheckout ? { providerError: null, retryPolicyGate: null } : {}),
            ...publicCheckoutRedirectOptions(req.params.slug, target.invoice.id),
            razorpayOrderId: activeAttempt.razorpayOrderId || null,
            razorpayPaymentId: activeAttempt.razorpayPaymentId || null,
            invoice,
            paymentId: null,
            capturedAmountPaise: null,
            currency: activeAttempt.currency || target.invoice.currency || 'INR',
            capturedAt: null,
            allocations: [],
          });
        }
      }
    }
    if (!attempt && !attemptId) {
      invoice = await db.invoice.findUnique({
        where: { id: target.invoice.id },
        select: { invoiceNumber: true, status: true, balanceDue: true, paidAmount: true },
      });
      if (invoice?.status === 'PAID' && Number(invoice.balanceDue || 0) <= 0 && Number(invoice.paidAmount || 0) > 0) {
        const allocation = await db.paymentAllocation.findFirst({
          where: {
            invoiceId: target.invoice.id,
            status: 'POSTED',
            reversedAt: null,
            payment: { is: {
              method: 'RAZORPAY', status: 'CAPTURED', mode: getMode(), reversedAt: null,
              OR: [{ razorpayPaymentId: { not: null } }, { razorpayOrderId: { not: null } }],
            } },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            amount: true,
            invoice: { select: { invoiceNumber: true } },
            payment: { select: { razorpayOrderId: true, razorpayPaymentId: true, createdAt: true } },
          },
        });
        if (allocation?.payment) {
          const allocatedAmountPaise = String(Math.round(Number(allocation.amount) * 100));
          return success(res, {
            attemptId: null,
            status: 'CAPTURED',
            canResumeCheckout: false,
            providerLookupUnavailable: false,
            observedAt: new Date().toISOString(),
            ...(customCheckout ? { providerError: null, retryPolicyGate: null } : {}),
            ...publicCheckoutRedirectOptions(req.params.slug, target.invoice.id),
            razorpayOrderId: allocation.payment.razorpayOrderId || null,
            razorpayPaymentId: allocation.payment.razorpayPaymentId || null,
            invoice,
            paymentId: allocation.payment.razorpayPaymentId || null,
            capturedAmountPaise: allocatedAmountPaise,
            currency: target.invoice.currency || 'INR',
            capturedAt: allocation.payment.createdAt || null,
            allocations: [{
              invoiceId: target.invoice.id,
              invoiceNumber: allocation.invoice?.invoiceNumber || invoice.invoiceNumber,
              amountPaise: allocatedAmountPaise,
            }],
          });
        }
      }
    }
    if (attempt && Boolean(attempt.allocationPlan) !== (target.share.resourceType === 'CUSTOMER')) {
      throw new RazorpayCheckoutError('CHECKOUT_ATTEMPT_BINDING_MISMATCH', 'Checkout attempt does not match this payment scope.', 409);
    }
    if (!attempt && attemptId) return paymentApiError(res, { statusCode: 404, code: 'CHECKOUT_ATTEMPT_NOT_FOUND', message: 'Checkout attempt not found', requestId: req.id });

    let canResumeCheckout = false;
    let providerLookupUnavailable = false;
    let providerError = null;
    if (attempt && attempt.mode !== getMode()) throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Attempt belongs to a different Razorpay mode; no provider lookup was performed.', 409);
    if (attempt && ['CREATED', 'AUTHORIZED', 'PENDING', 'FAILED'].includes(attempt.status) && attempt.razorpayOrderId) {
      try {
        const razorpay = (testHooks.getRazorpay || getRazorpay)();
        const providerPayments = await razorpay.orders.fetchPayments(attempt.razorpayOrderId);
        const providerOrder = await razorpay.orders.fetch(attempt.razorpayOrderId);
        assertProviderCheckoutBinding({ attempt, providerOrder, providerPayments });
        const captured = (providerPayments?.items || []).find((payment) => String(payment.status).toLowerCase() === 'captured');
        if (captured) {
          await settlePayment({
            paymentId: captured.id,
            providerOrderId: attempt.razorpayOrderId,
            source: 'STATUS_POLL',
            expectedInvoiceId: attempt.invoiceId,
            expectedShareId: attempt.publicShareId,
          });
          attempt = await db.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
        } else if ((providerPayments?.items || []).length) {
          const latestPayment = providerPayments.items.reduce((latest, payment) => (
            Number(payment.created_at || 0) > Number(latest?.created_at || 0) ? payment : latest
          ), null);
          providerError = getProviderPaymentError(latestPayment);
          if ((providerPayments.items || []).every((payment) => String(payment.status).toLowerCase() === 'failed')) {
            attempt = await failAttempt({
              attemptId: attempt.id,
              paymentId: latestPayment?.id || null,
              providerPayment: latestPayment || null,
              source: 'STATUS_POLL',
            });
            if (customCheckout) canResumeCheckout = attempt.invoiceId === target.invoice.id
              && Boolean(attempt.allocationPlan) === (target.share.resourceType === 'CUSTOMER')
              && canRetryFailedCheckout({ attempt, providerOrder, providerPayments });
          } else if (latestPayment) {
            attempt = await pendAttempt({
              attemptId: attempt.id,
              paymentId: latestPayment.id,
              providerPayment: latestPayment,
              source: 'STATUS_POLL',
            });
          }
        } else if (attempt.status === 'CREATED' && Array.isArray(providerPayments?.items) && providerPayments.items.length === 0) {
          canResumeCheckout = attempt.invoiceId === target.invoice.id
            && Boolean(attempt.allocationPlan) === (target.share.resourceType === 'CUSTOMER')
            && canResumeUnattemptedCheckout({ attempt, providerOrder, providerPayments });
          if (canResumeCheckout) await logAction(req, 'RAZORPAY_UNATTEMPTED_CHECKOUT_RESUMABLE', 'Provider confirms the existing order is still created with no payment attempts; the same checkout order can be resumed', {
            checkoutAttemptId: attempt.id,
            invoiceId: target.invoice.id,
            razorpayOrderId: attempt.razorpayOrderId,
            providerOrderStatus: providerOrder.status,
            providerAttemptCount: providerOrder.attempts,
          });
        }
      } catch (lookupError) {
        providerLookupUnavailable = true;
        // Status polling is a recovery path; preserve the pending attempt and let
        // the durable webhook/reconciliation worker retry on provider outages.
        if (lookupError instanceof RazorpayCheckoutError) throw lookupError;
        providerError = getProviderError(lookupError);
        await logAction(req, 'RAZORPAY_PAYMENT_STATUS_PROVIDER_LOOKUP_FAILED', 'Provider status lookup failed; checkout remains pending for recovery', {
          requestId: req.id,
          checkoutAttemptId: attempt.id,
          invoiceId: target.invoice.id,
          razorpayOrderId: attempt.razorpayOrderId,
          errorCode: safeProviderCode(lookupError),
          providerError: razorpayErrorSummary(lookupError),
        }, 'FAILED');
        const providerStatus = Number(lookupError?.statusCode || lookupError?.response?.status);
        const headers = lookupError?.response?.headers || lookupError?.headers;
        const retryAfter = typeof headers?.get === 'function'
          ? headers.get('Retry-After') : headers?.['retry-after'] || headers?.['Retry-After'];
        const validRetryAfter = typeof retryAfter === 'string' && retryAfter.length <= 128
          && !/[\r\n]/.test(retryAfter)
          && (/^\d+$/.test(retryAfter.trim()) || Number.isFinite(Date.parse(retryAfter)));
        // Use the existing transport backoff boundary; a success envelope would
        // hide throttling from checkoutRequest and allow immediate polling.
        if (providerStatus === 429 || validRetryAfter) {
          return paymentApiError(res, {
            statusCode: providerStatus === 429 ? 429 : 503,
            code: 'CHECKOUT_STATUS_CHECK_FAILED',
            message: 'Provider status is temporarily unavailable. Check this same attempt again later.',
            requestId: req.id,
            retryable: true,
            action: 'RETRY_SAME_REQUEST',
            details: {
              checkoutAttemptId: attempt.id,
              provider: providerError,
              providerLookupUnavailable: true,
              observedAt: new Date().toISOString(),
              ...(validRetryAfter ? { retryAfter: retryAfter.trim() } : {}),
            },
          });
        }
      }
    }

    invoice ||= await db.invoice.findUnique({
      where: { id: target.invoice.id },
      select: { invoiceNumber: true, status: true, balanceDue: true, paidAmount: true },
    });
    if (canResumeCheckout) {
      if (attempt.allocationPlan) {
        const summary = await getPublicPaymentSummary(target.share.resourceId, null);
        canResumeCheckout = summary.receivables.length === attempt.allocationPlan.length
          && summary.receivables.every((item, index) => item.invoiceId === attempt.allocationPlan[index].invoiceId
            && Math.round(Number(item.balanceDue) * 100) === Math.round(Number(attempt.allocationPlan[index].amount) * 100));
      } else {
        canResumeCheckout = invoice?.status !== 'VOID'
          && Math.round(Number(invoice?.balanceDue) * 100) === Number(attempt.amountPaise);
      }
    }
    return success(res, {
      attemptId: attempt?.id || null,
      status: attempt?.status || 'NONE',
      canResumeCheckout,
      providerLookupUnavailable,
      observedAt: new Date().toISOString(),
      ...(customCheckout ? { providerError, retryPolicyGate: null } : {}),
      ...publicCheckoutRedirectOptions(req.params.slug, target.invoice.id),
      razorpayOrderId: attempt?.razorpayOrderId || null,
      razorpayPaymentId: attempt?.razorpayPaymentId || null,
      invoice,
      paymentId: attempt?.status === 'CAPTURED' ? attempt.razorpayPaymentId : null,
      capturedAmountPaise: attempt?.status === 'CAPTURED' ? String(attempt.amountPaise) : null,
      currency: attempt?.currency || target.invoice.currency || 'INR',
      capturedAt: attempt?.status === 'CAPTURED' ? attempt.completedAt || null : null,
      allocations: attempt?.status === 'CAPTURED'
        ? (attempt.allocationPlan || [{ invoiceId: attempt.invoiceId, invoiceNumber: attempt.invoiceNumber, amount: Number(attempt.amountPaise) / 100 }])
          .map((item) => ({ invoiceId: item.invoiceId, invoiceNumber: item.invoiceNumber || null, amountPaise: String(Math.round(Number(item.amount) * 100)) }))
        : [],
    });
  } catch (err) {
    await logAction(req, 'RAZORPAY_PAYMENT_STATUS_CHECK_FAILED', 'Checkout status could not be completed by the CRM', {
      requestId: req.id || null,
      invoiceId: checkoutInvoiceId,
      errorClass: err instanceof RazorpayCheckoutError ? 'RazorpayCheckoutError' : err?.constructor?.name || 'Error',
      applicationErrorCode: err instanceof RazorpayCheckoutError ? err.code : typeof err?.code === 'string' ? err.code.slice(0, 80) : null,
      statusCode: err instanceof RazorpayCheckoutError ? err.statusCode : Number.isInteger(err?.statusCode) ? err.statusCode : null,
    }, 'FAILED');
    if (err instanceof RazorpayCheckoutError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id, retryable: err.statusCode >= 500, details: err.details });
    return paymentApiError(res, { code: 'CHECKOUT_STATUS_CHECK_FAILED', message: 'Could not check payment status', requestId: req.id, retryable: true });
  }
};

const reconcilePublicRazorpayCheckout = async (req, res, _next, testHooks = {}) => {
  const attemptId = String(req.body?.attemptId || '').trim();
  const invoiceId = req.body?.invoiceId ? String(req.body.invoiceId).trim() : undefined;
  if (!attemptId || attemptId.length > 40) return paymentApiError(res, { statusCode: 400, code: 'CHECKOUT_ATTEMPT_INVALID', message: 'The checkout attempt is invalid', requestId: req.id });
  try {
    const resolveInvoice = testHooks.getPublicInvoiceForPayment || getPublicInvoiceForPayment;
    const db = testHooks.prisma || prisma;
    const target = await resolveInvoice(String(req.params.slug || ''), { invoiceId });
    if (!target) return paymentApiError(res, { statusCode: 404, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found', requestId: req.id });
    const attempt = await db.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
    const belongsToInvoice = attempt && (attempt.invoiceId === target.invoice.id
      || (Array.isArray(attempt.allocationPlan) && attempt.allocationPlan.some((item) => item.invoiceId === target.invoice.id)));
    if (!belongsToInvoice || attempt.customerId !== target.invoice.customerId
      || attempt.publicShareId !== target.share.id
      || Boolean(attempt.allocationPlan) !== (target.share.resourceType === 'CUSTOMER')) {
      return paymentApiError(res, { statusCode: 404, code: 'CHECKOUT_ATTEMPT_NOT_FOUND', message: 'Checkout attempt not found', requestId: req.id });
    }
    if (attempt.mode !== getMode()) throw new RazorpayCheckoutError('RAZORPAY_MODE_MISMATCH', 'Attempt belongs to a different Razorpay mode; no provider lookup was performed.', 409);
    if (attempt.status !== 'REVIEW') {
      return getPublicRazorpayCheckoutStatus({ ...req, query: { ...req.query, invoiceId, attemptId, checkoutIntegration: 'CUSTOM' } }, res, _next, testHooks);
    }
    const reconcile = testHooks.reconcileCheckoutAttempt || reconcileAmbiguousOrderCreation;
    // Public recovery must not turn a historical error code alone into proof
    // of rejection. The Standard service policy remains unchanged.
    await reconcile({ attemptId, actor: { requestId: req.id }, provider: testHooks.provider, customCheckout: true });
    return getPublicRazorpayCheckoutStatus({ ...req, query: { ...req.query, invoiceId, attemptId, checkoutIntegration: 'CUSTOM' } }, res, _next, testHooks);
  } catch (err) {
    if (err instanceof RazorpayCheckoutError) return paymentApiError(res, { statusCode: err.statusCode, code: err.code, message: err.message, requestId: req.id, retryable: err.statusCode >= 500, details: err.details });
    return paymentApiError(res, { code: 'CHECKOUT_RECONCILIATION_FAILED', message: 'Could not reconcile payment status', requestId: req.id, retryable: true, details: { provider: getProviderError(err), providerLookupUnavailable: true, observedAt: new Date().toISOString() } });
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

const blogPostListSelect = {
  slug: true,
  kicker: true,
  title: true,
  excerpt: true,
  heroImage: true,
  heroImageAlt: true,
  publishedAt: true,
};

const getPublicBlogPosts = async (_req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      select: blogPostListSelect,
      orderBy: { publishedAt: 'desc' },
    });
    return success(res, { items: posts });
  } catch (err) {
    console.error('getPublicBlogPosts error:', err);
    return error(res, 'Failed to load blog posts');
  }
};

const getPublicBlogPost = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return badRequest(res, 'slug is required');
    const post = await prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== 'PUBLISHED') return notFound(res, 'Article not found');
    return success(res, { post });
  } catch (err) {
    console.error('getPublicBlogPost error:', err);
    return error(res, 'Failed to load article');
  }
};

const suburbPageListSelect = {
  slug: true,
  suburbName: true,
  title: true,
  intro: true,
  heroImage: true,
  heroImageAlt: true,
};

const getPublicSuburbPages = async (_req, res) => {
  try {
    const pages = await prisma.suburbPage.findMany({
      where: { status: 'PUBLISHED' },
      select: suburbPageListSelect,
      orderBy: { suburbName: 'asc' },
    });
    return success(res, { items: pages });
  } catch (err) {
    console.error('getPublicSuburbPages error:', err);
    return error(res, 'Failed to load pickup zones');
  }
};

const getPublicSuburbPage = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return badRequest(res, 'slug is required');
    const page = await prisma.suburbPage.findUnique({ where: { slug } });
    if (!page || page.status !== 'PUBLISHED') return notFound(res, 'Page not found');
    return success(res, { page });
  } catch (err) {
    console.error('getPublicSuburbPage error:', err);
    return error(res, 'Failed to load page');
  }
};

const servicePageListSelect = {
  serviceSlug: true,
  serviceName: true,
  suburbSlug: true,
  suburbName: true,
  title: true,
  intro: true,
  heroImage: true,
  heroImageAlt: true,
};

const getPublicServicePages = async (req, res) => {
  try {
    const serviceSlug = req.query.service ? String(req.query.service).trim() : undefined;
    const pages = await prisma.servicePage.findMany({
      where: { status: 'PUBLISHED', ...(serviceSlug ? { serviceSlug } : {}) },
      select: servicePageListSelect,
      orderBy: [{ serviceSlug: 'asc' }, { suburbName: 'asc' }],
    });
    return success(res, { items: pages });
  } catch (err) {
    console.error('getPublicServicePages error:', err);
    return error(res, 'Failed to load service pages');
  }
};

const getPublicServicePage = async (req, res) => {
  try {
    const serviceSlug = String(req.params.service || '').trim();
    const suburbSlug = String(req.params.suburb || '').trim();
    if (!serviceSlug || !suburbSlug) return badRequest(res, 'service and suburb are required');
    const page = await prisma.servicePage.findUnique({ where: { serviceSlug_suburbSlug: { serviceSlug, suburbSlug } } });
    if (!page || page.status !== 'PUBLISHED') return notFound(res, 'Page not found');
    return success(res, { page });
  } catch (err) {
    console.error('getPublicServicePage error:', err);
    return error(res, 'Failed to load page');
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
  getPublicBlogPosts,
  getPublicBlogPost,
  getPublicSuburbPages,
  getPublicSuburbPage,
  getPublicServicePages,
  getPublicServicePage,
  createPublicRazorpayOrder,
  getPublicCustomCapabilities,
  getPublicCustomCardEligibility,
  getPublicCustomDowntime,
  preparePublicCustomBankTransfer,
  verifyPublicRazorpayPayment,
  handlePublicRazorpayCallback,
  getPublicRazorpayCheckoutStatus,
  reconcilePublicRazorpayCheckout,
  assignPublicRazorpayCheckoutExperiment,
  recordPublicRazorpayCheckoutExperimentEvent,
};
