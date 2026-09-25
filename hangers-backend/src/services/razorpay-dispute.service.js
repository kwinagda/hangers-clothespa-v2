const prisma = require('../config/database');
const { writeAuditEvent } = require('./activity.service');
const { getRazorpay } = require('./razorpay-invoice-checkout.service');

const DISPUTE_STATES = new Set(['open', 'under_review', 'won', 'lost', 'closed']);
const NEXT_STATES = {
  OPEN: new Set(['OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'CLOSED']),
  UNDER_REVIEW: new Set(['UNDER_REVIEW', 'WON', 'LOST', 'CLOSED']),
  WON: new Set(['WON', 'CLOSED']),
  LOST: new Set(['LOST', 'CLOSED']),
  CLOSED: new Set(['CLOSED']),
};
const currentMode = () => String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'TEST' : 'LIVE';
const safeCode = (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : null;

const normalizeDispute = (value, disputeId) => {
  const status = String(value?.status || '').toLowerCase();
  const amount = Number(value?.amount);
  const deducted = Number(value?.amount_deducted);
  if (value?.id !== disputeId || typeof value?.payment_id !== 'string' || !value.payment_id
    || !DISPUTE_STATES.has(status) || !Number.isSafeInteger(amount) || amount < 0
    || !Number.isSafeInteger(deducted) || deducted < 0
    || typeof value.currency !== 'string' || !/^[A-Z]{3}$/i.test(value.currency)) {
    throw Object.assign(new Error('Fetched Razorpay dispute is missing valid identity or finance fields'), {
      code: 'DISPUTE_PROVIDER_DATA_INVALID', permanent: true,
    });
  }
  return {
    providerDisputeId: disputeId,
    providerPaymentId: value.payment_id,
    amountPaise: BigInt(amount),
    amountDeductedPaise: BigInt(deducted),
    currency: value.currency.toUpperCase(),
    status: status.toUpperCase(),
    phase: safeCode(value.phase),
    reasonCode: safeCode(value.reason_code),
    respondBy: Number.isSafeInteger(Number(value.respond_by)) && Number(value.respond_by) > 0
      ? new Date(Number(value.respond_by) * 1000) : null,
    providerCreatedAt: Number.isSafeInteger(Number(value.created_at)) && Number(value.created_at) > 0
      ? new Date(Number(value.created_at) * 1000) : null,
  };
};

const reconcileRazorpayDispute = async ({ disputeId, eventId, eventType, provider: injectedProvider } = {}) => {
  if (typeof disputeId !== 'string' || !/^disp_[A-Za-z0-9]{1,100}$/.test(disputeId)) {
    throw Object.assign(new Error('A valid Razorpay dispute ID is required'), { code: 'DISPUTE_ID_INVALID', permanent: true });
  }
  const provider = injectedProvider || getRazorpay();
  const fetched = await provider.disputes.fetch(disputeId);
  const dispute = normalizeDispute(fetched, disputeId);
  const mode = currentMode();
  const matchingPayment = await prisma.payment.findFirst({
    where: {
      razorpayPaymentId: dispute.providerPaymentId,
      method: 'RAZORPAY',
      kind: 'RECEIPT',
      status: 'CAPTURED',
    },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT "id", "status" FROM "razorpay_dispute_cases" WHERE "providerDisputeId" = ${disputeId} FOR UPDATE`;
    const current = rows[0] || null;
    const nextStateAllowed = !current || (NEXT_STATES[current.status] || new Set()).has(dispute.status);
    const linkStatus = matchingPayment ? 'LINKED' : 'UNLINKED';
    const write = nextStateAllowed ? {
      ...dispute,
      localPaymentId: matchingPayment?.id || null,
      linkStatus,
      lastEventId: safeCode(eventId),
      lastEventType: safeCode(eventType),
      mode,
      lastSyncedAt: new Date(),
    } : {
      lastEventId: safeCode(eventId),
      lastEventType: safeCode(eventType),
      lastSyncedAt: new Date(),
    };
    const saved = current
      ? await tx.razorpayDisputeCase.update({ where: { providerDisputeId: disputeId }, data: write })
      : await tx.razorpayDisputeCase.create({ data: write });
    await writeAuditEvent(tx, {
      actorType: 'system',
      actorName: 'Razorpay dispute reconciliation',
      action: nextStateAllowed ? 'RAZORPAY_DISPUTE_SYNCED' : 'RAZORPAY_DISPUTE_STATE_REGRESSION_REVIEW',
      status: nextStateAllowed ? 'SUCCESS' : 'FAILURE',
      resource: 'razorpay_dispute',
      resourceId: disputeId,
      description: nextStateAllowed ? 'Authoritative Razorpay dispute state synchronized' : 'Stale dispute state ignored; finance review required',
      metadata: {
        provider: 'RAZORPAY',
        disputeId,
        paymentId: dispute.providerPaymentId,
        localPaymentId: matchingPayment?.id || null,
        priorState: current?.status || null,
        providerState: dispute.status,
        storedState: saved.status,
        amountPaise: String(dispute.amountPaise),
        amountDeductedPaise: String(dispute.amountDeductedPaise),
        currency: dispute.currency,
        phase: dispute.phase,
        reasonCode: dispute.reasonCode,
        respondBy: dispute.respondBy?.toISOString() || null,
        linkStatus,
        mode,
        eventId: safeCode(eventId),
        eventType: safeCode(eventType),
      },
    });
    return { saved, nextStateAllowed };
  }, { isolationLevel: 'Serializable' });

  return {
    state: result.nextStateAllowed && result.saved.linkStatus === 'LINKED' ? 'PROCESSED' : 'REVIEW',
    disputeId,
    paymentId: dispute.providerPaymentId,
    providerStatus: result.saved.status,
    linkStatus: result.saved.linkStatus,
    eventType: result.saved.lastEventType,
  };
};

module.exports = { reconcileRazorpayDispute, normalizeDispute };
