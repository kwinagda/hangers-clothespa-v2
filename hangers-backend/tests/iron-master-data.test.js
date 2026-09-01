const test = require('node:test');
const assert = require('node:assert/strict');

const { ACTIVE_IRON_SUB_STATUSES, IRON_SUBSCRIPTION_STATUSES } = require('../src/config/master-data');
const {
  isBillableDailyIronService,
  normalizeIronBatchItems,
  normalizeManualIronRate,
  resolveAppliedIronRate,
} = require('../src/controllers/iron.controller');
const { OUTBOX_EVENT } = require('../src/services/outbox.service');
const { resolveDailyIronBillMode } = require('../src/utils/daily-iron-billing');
const { formatDailyIronLogItems } = require('../src/utils/daily-iron-summary');

test('only active Daily Iron subscriptions can accept new usage logs', () => {
  assert.deepEqual(ACTIVE_IRON_SUB_STATUSES, ['ACTIVE']);
  assert.ok(IRON_SUBSCRIPTION_STATUSES.includes('PAUSED'));
  assert.equal(ACTIVE_IRON_SUB_STATUSES.includes('PAUSED'), false);
});

test('Daily Iron logging requires active positive-priced service', () => {
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: true, basePrice: 0 }), false);
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: false, basePrice: 10 }), false);
  assert.equal(isBillableDailyIronService({ category: 'DAILY_IRON', isActive: true, basePrice: 10 }), true);
});

test('Daily Iron manual rate override is explicit and auditable', () => {
  const resolved = { rate: 12, source: 'CATALOG', catalogRate: 12 };

  assert.equal(normalizeManualIronRate(undefined), null);
  assert.equal(normalizeManualIronRate('15.236'), 15.24);
  assert.throws(() => normalizeManualIronRate('0'), /greater than zero/);

  assert.equal(resolveAppliedIronRate(resolved, null, null).source, 'CATALOG');
  assert.throws(() => resolveAppliedIronRate(resolved, 10, ''), /requires a reason/);

  const applied = resolveAppliedIronRate(resolved, 10, 'special count correction');
  assert.equal(applied.rate, 10);
  assert.equal(applied.source, 'MANUAL_OVERRIDE');
  assert.equal(applied.snapshot.resolvedRate, 12);
  assert.equal(applied.snapshot.reason, 'special count correction');
});

test('Daily Iron batch accepts duplicate service rows for different line rates', () => {
  const rows = normalizeIronBatchItems([
    { serviceId: 'shirt', pieces: 1, ratePerPiece: 100, notes: 'standard' },
    { serviceId: 'shirt', pieces: 1, ratePerPiece: 125, notes: 'heavy' },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].serviceId, rows[1].serviceId);
  assert.equal(rows[0].ratePerPiece, 100);
  assert.equal(rows[1].ratePerPiece, 125);
});

test('Daily Iron batch notification summarizes rows in one WhatsApp message body', () => {
  assert.equal(
    formatDailyIronLogItems([
      { serviceName: 'Saree', pieces: 1, ratePerPiece: 40 },
      { serviceName: 'Shirt', pieces: 1, ratePerPiece: 10 },
    ]),
    'Saree x1, Shirt x1'
  );

  assert.equal(
    formatDailyIronLogItems([
      { serviceName: 'Shirt', pieces: 1, ratePerPiece: 10 },
      { serviceName: 'Shirt', pieces: 1, ratePerPiece: 15 },
    ]),
    'Shirt x1 @ Rs 10, Shirt x1 @ Rs 15'
  );
});

test('Daily Iron batch uses a dedicated outbox event to avoid per-line WhatsApp spam', () => {
  assert.equal(OUTBOX_EVENT.DAILY_IRON_LOG_BATCH, 'DAILY_IRON_LOG_BATCH');
});

test('Daily Iron bill mode preserves locked bills and creates supplemental bills for late logs', () => {
  assert.deepEqual(resolveDailyIronBillMode([]), {
    existingDraftBill: null,
    lockedBills: [],
    mode: 'NEW_PERIOD_BILL',
  });

  const draft = { id: 'draft', status: 'DRAFT' };
  assert.equal(resolveDailyIronBillMode([{ id: 'sent', status: 'SENT' }, draft]).existingDraftBill, draft);
  assert.equal(resolveDailyIronBillMode([{ id: 'sent', status: 'SENT' }, draft]).mode, 'REGENERATED_DRAFT');

  const supplemental = resolveDailyIronBillMode([{ id: 'paid', status: 'PAID' }]);
  assert.equal(supplemental.existingDraftBill, null);
  assert.equal(supplemental.lockedBills.length, 1);
  assert.equal(supplemental.mode, 'SUPPLEMENTAL');

  const freshAfterVoid = resolveDailyIronBillMode([{ id: 'voided', status: 'VOID' }]);
  assert.equal(freshAfterVoid.existingDraftBill, null);
  assert.equal(freshAfterVoid.lockedBills.length, 0);
  assert.equal(freshAfterVoid.mode, 'NEW_PERIOD_BILL');
});
