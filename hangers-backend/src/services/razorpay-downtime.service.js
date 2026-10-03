const prisma = require('../config/database');
const { RazorpayCheckoutError } = require('./razorpay-invoice-checkout.service');
const { getDowntimeApiContext, persistWebhookEvidence, providerId, requireWebhookContext } = require('./razorpay-checkout-account.service');

// https://razorpay.com/docs/api/payments/downtime/entity/
// https://razorpay.com/docs/webhooks/payments/#payments-downtime
const DOWNTIME_EVENTS = Object.freeze(['payment.downtime.started', 'payment.downtime.updated', 'payment.downtime.resolved']);
const INSTRUMENT_FIELDS = Object.freeze({
  card: ['network', 'issuer', 'card_type'],
  netbanking: ['bank'],
  upi: ['psp', 'vpa_handle', 'flow'],
});
// Hangers warning-only policy; these intervals are not provider guarantees.
const DOWNTIME_CACHE_MS = 30_000;
const DOWNTIME_STALE_AFTER_MS = 60_000;
const MAX_INCIDENTS = 200;
const snapshots = new Map();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000;
const code = (value) => typeof value === 'string' && /^[A-Za-z0-9_@.-]{1,80}$/.test(value) ? value : null;
const terminal = (entity) => entity.status === 'resolved';

// Unknown constraints are never silently removed to make an incident match more broadly.
const normalizeRazorpayDowntime = (value) => {
  const raw = object(value) ? value : {};
  let known = raw.schemaKnown !== false;
  const method = Object.hasOwn(INSTRUMENT_FIELDS, raw.method) ? raw.method : null;
  const status = ['started', 'updated', 'scheduled', 'resolved'].includes(raw.status) ? raw.status : null;
  const severity = ['low', 'medium', 'high'].includes(raw.severity) ? raw.severity : null;
  const id = providerId(raw.id, 'down');
  if (!id || !method || !status || !severity || (raw.entity !== undefined && raw.entity !== 'payment.downtime')
    || !timestamp(raw.begin) || !(raw.end === null || timestamp(raw.end)) || typeof raw.scheduled !== 'boolean'
    || !timestamp(raw.created_at) || !timestamp(raw.updated_at) || raw.updated_at < raw.created_at) known = false;
  const instrument = {};
  if (!object(raw.instrument) || !Object.keys(raw.instrument).length) known = false;
  for (const [field, value] of Object.entries(object(raw.instrument) ? raw.instrument : {})) {
    const name = field === 'type' && method === 'card' ? 'card_type' : field;
    if (!INSTRUMENT_FIELDS[method]?.includes(name) || !code(value)) {
      known = false;
      continue;
    }
    if (instrument[name] !== undefined && instrument[name] !== value) known = false;
    instrument[name] = value;
    if (name === 'card_type' && !['credit', 'debit'].includes(value)) known = false;
    if (name === 'flow' && !['collect', 'intent', 'in_app'].includes(value)) known = false;
    if (value === 'ALL' && !['network', 'vpa_handle'].includes(name)) known = false;
  }
  if (raw.vpa_handle != null) {
    if (method !== 'upi' || !code(raw.vpa_handle) || (instrument.vpa_handle && instrument.vpa_handle !== raw.vpa_handle)) known = false;
    else instrument.vpa_handle = raw.vpa_handle;
  }
  if (raw.instrument_schema !== undefined) {
    if (!Array.isArray(raw.instrument_schema) || !raw.instrument_schema.length) known = false;
    else for (const field of raw.instrument_schema) {
      const name = field === 'type' && method === 'card' ? 'card_type' : field;
      if (!INSTRUMENT_FIELDS[method]?.includes(name) || !Object.hasOwn(instrument, name)) known = false;
    }
  }
  return {
    id, method, status, severity,
    begin: timestamp(raw.begin) ? raw.begin : null,
    end: timestamp(raw.end) ? raw.end : null,
    scheduled: typeof raw.scheduled === 'boolean' ? raw.scheduled : null,
    instrument: Object.fromEntries(Object.entries(instrument).sort(([a], [b]) => a.localeCompare(b))),
    created_at: timestamp(raw.created_at) ? raw.created_at : null,
    updated_at: timestamp(raw.updated_at) ? raw.updated_at : null,
    schemaKnown: known,
  };
};

const getDowntimeWebhookPayload = (body) => ({
  accountId: providerId(body?.account_id, 'acc'),
  downtime: normalizeRazorpayDowntime(body?.payload?.['payment.downtime']?.entity),
});

const matchRazorpayDowntime = (value, selection = {}, { now = Date.now(), stale = false } = {}) => {
  const incident = normalizeRazorpayDowntime(value);
  const unknown = { match: 'unknown', phase: 'unknown', action: 'unknown', disabled: false };
  if (!incident.schemaKnown || !Number.isFinite(now)) return unknown;
  const phase = terminal(incident) ? 'resolved'
    : incident.begin * 1000 > now ? (incident.scheduled ? 'upcoming' : 'unknown')
      : incident.status === 'scheduled' ? 'unknown' : 'active';
  if (!selection.method) return { ...unknown, phase };
  if (selection.method !== incident.method) return { match: 'no_match', phase, action: 'none', disabled: false };
  let missing = false;
  for (const [field, expected] of Object.entries(incident.instrument)) {
    if (expected === 'ALL' && ['network', 'vpa_handle'].includes(field)) continue;
    const actual = selection[field];
    if (!code(actual) || (field === 'flow' && !['collect', 'intent', 'in_app'].includes(actual))) {
      missing = true;
      continue;
    }
    // Only the documented optional @ prefix is normalized; PSP/app and network IDs are not mapped.
    const comparable = (input) => field === 'vpa_handle' ? input.replace(/^@/, '') : input;
    if (comparable(actual) !== comparable(expected)) return { match: 'no_match', phase, action: 'none', disabled: false };
  }
  if (missing || phase === 'unknown') return { ...unknown, phase };
  return { match: 'match', phase, action: stale ? 'unknown' : phase === 'active' ? 'warn' : 'none', disabled: false };
};

const sameEntity = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const assertCurrentEvidence = (fetched, observed) => {
  if (!fetched.schemaKnown) throw new RazorpayCheckoutError('DOWNTIME_SCHEMA_UNKNOWN', 'Downtime API schema is not recognized', 503);
  for (const prior of observed) {
    if (!prior || prior.id !== fetched.id) continue;
    if (prior.updated_at === null || fetched.updated_at < prior.updated_at
      || (fetched.updated_at === prior.updated_at && !sameEntity(fetched, prior))) {
      throw new RazorpayCheckoutError('DOWNTIME_EVIDENCE_CONFLICT', 'Downtime API has not reconciled the observed occurrence version', 503);
    }
    if (terminal(prior) && !terminal(fetched)) {
      throw new RazorpayCheckoutError('DOWNTIME_STATE_REGRESSION', 'Resolved downtime occurrence cannot be reopened without review', 503);
    }
  }
};

const fetchOccurrence = async (provider, id) => {
  const fetched = normalizeRazorpayDowntime(await provider.payments.fetchPaymentDowntimeById(id));
  if (fetched.id !== id) throw new RazorpayCheckoutError('DOWNTIME_REFERENCE_MISMATCH', 'Downtime API returned another occurrence', 503);
  return fetched;
};

const publicSnapshot = (entry, mode) => {
  const expired = !entry.fetchedAt || Date.now() - Date.parse(entry.fetchedAt) > DOWNTIME_STALE_AFTER_MS;
  return {
    mode,
    status: entry.reasonCode || expired ? (entry.fetchedAt ? 'stale' : 'unknown') : 'fresh',
    reasonCode: entry.reasonCode || (expired ? 'DOWNTIME_SNAPSHOT_UNAVAILABLE' : null),
    fetchedAt: entry.fetchedAt || null,
    lastAttemptAt: entry.lastAttemptAt || null,
    staleAfterMs: DOWNTIME_STALE_AFTER_MS,
    policy: 'warning_only',
    incidents: (entry.incidents || []).map((incident) => normalizeRazorpayDowntime(incident)),
  };
};

// API-only read for an already-scoped/rate-limited public checkout route. No DB or payment writes.
const getRazorpayDowntimeSnapshot = async ({ mode, refresh = false, provider } = {}) => {
  let context;
  try {
    context = getDowntimeApiContext({ mode, provider });
  } catch (error) {
    return publicSnapshot({ reasonCode: error instanceof RazorpayCheckoutError ? error.code : 'DOWNTIME_SNAPSHOT_UNAVAILABLE' }, ['TEST', 'LIVE'].includes(mode) ? mode : null);
  }
  let entry = snapshots.get(context.cacheKey);
  if (!entry) {
    // Key rotation must not share a previous account's evidence or grow the cache indefinitely.
    if (snapshots.size >= 8) snapshots.delete(snapshots.keys().next().value);
    entry = { incidents: [], fetchedAt: null, lastAttemptAt: null, generation: 0 };
    snapshots.set(context.cacheKey, entry);
  }
  if (entry.inFlight) {
    await entry.inFlight;
    return publicSnapshot(entry, context.mode);
  }
  if (!refresh && entry.lastAttemptAt && Date.now() - Date.parse(entry.lastAttemptAt) < DOWNTIME_CACHE_MS) {
    return publicSnapshot(entry, context.mode);
  }
  entry.lastAttemptAt = new Date().toISOString();
  const generation = entry.generation;
  entry.inFlight = (async () => {
    try {
      const response = await context.provider.payments.fetchPaymentDowntime();
      const collection = response?.payment_downtime ?? response;
      if (!object(collection) || collection.entity !== 'collection' || !Array.isArray(collection.items)
        || collection.items.length > MAX_INCIDENTS || collection.count !== collection.items.length
        || (response?.payment_downtime && response?.items)) {
        throw new RazorpayCheckoutError('DOWNTIME_SCHEMA_UNKNOWN', 'Downtime collection schema is not recognized', 503);
      }
      const candidates = collection.items.map(normalizeRazorpayDowntime);
      if (candidates.some((item) => !item.schemaKnown) || new Set(candidates.map((item) => item.id)).size !== candidates.length) {
        throw new RazorpayCheckoutError('DOWNTIME_SCHEMA_UNKNOWN', 'Downtime collection contains unrecognized or duplicate occurrences', 503);
      }
      const next = new Map(candidates.map((item) => [item.id, item]));
      // Absence from the list, or elapsed end time, does not resolve a known occurrence.
      for (const prior of entry.incidents) {
        let candidate = next.get(prior.id);
        if (!candidate && terminal(prior)) {
          next.set(prior.id, prior);
          continue;
        }
        if (!candidate || candidate.updated_at < prior.updated_at
          || (candidate.updated_at === prior.updated_at && !sameEntity(candidate, prior))) {
          candidate = await fetchOccurrence(context.provider, prior.id);
        }
        assertCurrentEvidence(candidate, [prior]);
        next.set(candidate.id, candidate);
      }
      if (next.size > MAX_INCIDENTS || entry.generation !== generation) {
        throw new RazorpayCheckoutError('DOWNTIME_REFRESH_REQUIRED', 'Downtime evidence changed during snapshot refresh', 503);
      }
      entry.incidents = [...next.values()];
      entry.fetchedAt = new Date().toISOString();
      entry.reasonCode = null;
    } catch (error) {
      // Never expose SDK errors/credentials or translate an API failure into healthy methods.
      entry.reasonCode = error instanceof RazorpayCheckoutError ? error.code : 'DOWNTIME_FETCH_UNAVAILABLE';
    }
  })();
  try { await entry.inFlight; } finally { entry.inFlight = null; }
  return publicSnapshot(entry, context.mode);
};

const reconcileRazorpayDowntimeWebhook = async (event, { provider } = {}) => {
  if (!DOWNTIME_EVENTS.includes(event?.event)) throw new RazorpayCheckoutError('DOWNTIME_EVENT_UNSUPPORTED', 'Unsupported downtime event');
  const context = requireWebhookContext(event, 'DOWNTIME', provider);
  const entry = snapshots.get(context.cacheKey);
  if (entry) {
    entry.generation += 1;
    entry.lastAttemptAt = null;
    entry.reasonCode = 'DOWNTIME_REFRESH_REQUIRED';
  }
  const observed = normalizeRazorpayDowntime(event.payload.downtime);
  if (!observed.id) throw new RazorpayCheckoutError('DOWNTIME_REFERENCE_MISSING', 'Downtime event has no occurrence ID', 409);
  const fetched = await fetchOccurrence(context.provider, observed.id);
  const fetchedAt = new Date().toISOString();
  // Serializable inbox evidence prevents concurrent/out-of-order events from winning by arrival order.
  await prisma.$transaction(async (tx) => {
    const history = await tx.razorpayWebhookEvent.findMany({
      where: {
        mode: context.mode,
        event: { in: DOWNTIME_EVENTS },
        AND: [
          { payload: { path: ['accountId'], equals: context.accountId } },
          { payload: { path: ['downtime', 'id'], equals: observed.id } },
        ],
      },
      select: { payload: true },
    });
    const evidence = [observed, ...history.flatMap((row) => [row.payload?.downtime, row.payload?.downtimeReconciliation?.downtime])]
      .filter(Boolean).map(normalizeRazorpayDowntime);
    assertCurrentEvidence(fetched, evidence);
    await persistWebhookEvidence(tx, event, { downtimeReconciliation: { downtime: fetched, fetchedAt } });
  }, { isolationLevel: 'Serializable' });
  if (entry) {
    entry.generation += 1;
    entry.lastAttemptAt = null;
    entry.reasonCode = 'DOWNTIME_REFRESH_REQUIRED';
    const prior = entry.incidents.find((item) => item.id === fetched.id);
    if (!prior || fetched.updated_at > prior.updated_at || sameEntity(prior, fetched)) {
      entry.incidents = [...entry.incidents.filter((item) => item.id !== fetched.id), fetched];
    }
  }
  return { state: 'PROCESSED', downtimeId: fetched.id, providerStatus: fetched.status };
};

module.exports = {
  DOWNTIME_EVENTS,
  getDowntimeWebhookPayload,
  getRazorpayDowntimeSnapshot,
  matchRazorpayDowntime,
  normalizeRazorpayDowntime,
  reconcileRazorpayDowntimeWebhook,
};
