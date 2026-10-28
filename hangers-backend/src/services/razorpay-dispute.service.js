const prisma = require('../config/database');
const { writeAuditEvent, log } = require('./activity.service');
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

const reconcileRazorpayDispute = async ({ disputeId, eventId, eventType, provider: injectedProvider, providerDispute } = {}) => {
  if (typeof disputeId !== 'string' || !/^disp_[A-Za-z0-9]{1,100}$/.test(disputeId)) {
    throw Object.assign(new Error('A valid Razorpay dispute ID is required'), { code: 'DISPUTE_ID_INVALID', permanent: true });
  }
  const provider = injectedProvider || getRazorpay();
  const fetched = providerDispute || await provider.disputes.fetch(disputeId);
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

const syncRazorpayDisputePage = async ({ provider, count, skip, to, actor, requestMeta } = {}) => {
  const mode = currentMode();
  try {
    const collection = await provider.disputes.all({ count, skip, to });
    if (!collection || !Array.isArray(collection.items) || collection.items.length > count) {
      throw Object.assign(new Error('Razorpay returned an invalid disputes collection'), { code: 'DISPUTE_COLLECTION_INVALID' });
    }

    let synced = 0;
    let review = 0;
    let failed = 0;
    for (const providerDispute of collection.items) {
      if (typeof providerDispute?.id !== 'string' || !/^disp_[A-Za-z0-9]{1,100}$/.test(providerDispute.id)) {
        failed += 1;
        await log({
          actorType: 'staff', actorId: actor?.id, actorName: actor?.name,
          action: 'RAZORPAY_DISPUTE_SYNC_ITEM_REJECTED', status: 'FAILURE',
          resource: 'razorpay_dispute_sync', description: 'Provider dispute row was rejected because its identity was invalid',
          metadata: { provider: 'RAZORPAY', mode, pageSkip: skip, errorCode: 'DISPUTE_ID_INVALID' },
          ...requestMeta,
        });
        continue;
      }
      try {
        const result = await reconcileRazorpayDispute({
          disputeId: providerDispute.id,
          eventType: 'RAZORPAY_DISPUTE_MANUAL_SYNC',
          provider,
          providerDispute,
        });
        if (result.state === 'PROCESSED') synced += 1;
        else review += 1;
      } catch (error) {
        failed += 1;
        await log({
          actorType: 'staff', actorId: actor?.id, actorName: actor?.name,
          action: 'RAZORPAY_DISPUTE_SYNC_ITEM_FAILED', status: 'FAILURE',
          resource: 'razorpay_dispute', resourceId: providerDispute.id,
          description: 'A provider dispute could not be reconciled; finance review is required',
          metadata: { provider: 'RAZORPAY', mode, pageSkip: skip, errorCode: String(error?.code || 'DISPUTE_SYNC_ITEM_FAILED').slice(0, 80) },
          ...requestMeta,
        });
      }
    }

    const nextSkip = skip + collection.items.length;
    const result = { mode, received: collection.items.length, synced, review, failed, nextSkip, to, hasMore: collection.items.length === count };
    await log({
      actorType: 'staff', actorId: actor?.id, actorName: actor?.name,
      action: failed ? 'RAZORPAY_DISPUTE_BATCH_SYNC_PARTIAL' : 'RAZORPAY_DISPUTE_BATCH_SYNC',
      status: failed ? 'FAILURE' : 'SUCCESS',
      resource: 'razorpay_dispute_sync',
      description: 'Staff synchronized a bounded page of disputes from Razorpay Payment Gateway',
      metadata: { provider: 'RAZORPAY', ...result, count, skip },
      ...requestMeta,
    });
    return result;
  } catch (error) {
    await log({
      actorType: 'staff', actorId: actor?.id, actorName: actor?.name,
      action: 'RAZORPAY_DISPUTE_BATCH_SYNC_FAILED', status: 'FAILURE',
      resource: 'razorpay_dispute_sync',
      description: 'Razorpay dispute page could not be synchronized',
      metadata: { provider: 'RAZORPAY', mode, count, skip, errorCode: String(error?.code || 'PROVIDER_OR_SYNC_ERROR').slice(0, 80) },
      ...requestMeta,
    });
    throw error;
  }
};

module.exports = { reconcileRazorpayDispute, syncRazorpayDisputePage, normalizeDispute };
