const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { writeAuditEvent } = require('../src/services/activity.service');
const { CommercialRuleError, resolveOrderPricing } = require('../src/services/pricing.service');
const { PaymentRuleError, recordOrderSettlement } = require('../src/services/payment.service');
const { syncOrderGarmentUnits } = require('../src/services/garment-unit.service');
const { nextDocumentNumber } = require('../src/services/document-number.service');

const integrationTest = process.env.RUN_DB_INTEGRATION === '1' ? test : test.skip;
const runId = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const state = {};

before(async () => {
  if (process.env.RUN_DB_INTEGRATION !== '1') return;
  state.staff = await prisma.staff.create({
    data: {
      name: `Integration Admin ${runId}`,
      phone: `9${String(Date.now()).slice(-9)}`,
      email: `${runId}@example.test`,
      passwordHash: 'integration-test-only',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });
  state.actor = { ...state.staff, effectivePermissions: ['*'] };
  state.customer = await prisma.customer.create({
    data: { name: `Integration Customer ${runId}`, phone: `8${String(Date.now() + 1).slice(-9)}` },
  });
  state.service = await prisma.service.create({
    data: { name: `Integration Service ${runId}`, category: 'INTEGRATION', basePrice: 100, isActive: true },
  });
});

after(async () => {
  if (process.env.RUN_DB_INTEGRATION !== '1') return;
  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: `IT-${runId}` } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length) {
    await prisma.receiptAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.receipt.deleteMany({ where: { customerId: state.customer.id } });
    await prisma.refundAllocation.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.creditNoteLine.deleteMany({ where: { creditNote: { orderId: { in: orderIds } } } });
    await prisma.creditNote.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.paymentAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.financialAdjustment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.invoiceRevision.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
    await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStage.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.activityLog.deleteMany({ where: { resourceId: { in: orderIds } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.service.deleteMany({ where: { id: state.service?.id } });
  await prisma.customer.deleteMany({ where: { id: state.customer?.id } });
  await prisma.staff.deleteMany({ where: { id: state.staff?.id } });
  await prisma.$disconnect();
});

const createOrder = async (suffix, totalAmount = 100) => prisma.order.create({
  data: {
    orderNumber: `IT-${runId}-${suffix}`,
    customerId: state.customer.id,
    documentType: 'ORDER',
    source: 'COUNTER',
    status: 'PICKED_UP',
    subtotal: totalAmount,
    totalAmount,
    assignedToId: state.staff.id,
  },
});

integrationTest('server pricing owns catalog identity and price', async () => {
  const priced = await prisma.$transaction((tx) => resolveOrderPricing(tx, {
    customerId: state.customer.id,
    staff: state.actor,
    items: [{
      serviceId: state.service.id,
      serviceName: 'Tampered name',
      garmentType: 'Tampered category',
      quantity: 2,
    }],
  }));

  assert.equal(priced.items[0].serviceName, state.service.name);
  assert.equal(priced.items[0].garmentType, state.service.category);
  assert.equal(priced.items[0].unitPrice, 100);
  assert.equal(priced.totalAmount, 200);

  await assert.rejects(
    prisma.$transaction((tx) => resolveOrderPricing(tx, {
      customerId: state.customer.id,
      staff: { ...state.actor, effectivePermissions: ['orders.create'] },
      commercialReason: 'Unauthorized price change',
      items: [{ serviceId: state.service.id, quantity: 1, unitPrice: 1 }],
    })),
    (error) => error instanceof CommercialRuleError && error.code === 'COMMERCIAL_APPROVAL_REQUIRED'
  );
});

integrationTest('captured receipts allocate exactly once and drive cached order balance', async () => {
  const order = await createOrder('SETTLEMENT');
  const result = await prisma.$transaction(async (tx) => {
    const settlement = await recordOrderSettlement(tx, {
      orderId: order.id,
      amount: 100,
      method: 'CASH',
      staff: state.actor,
      idempotencyKey: `${runId}:settlement`,
    });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: state.staff.id, actorName: state.staff.name,
      action: 'PAYMENT_RECORDED', resource: 'order', resourceId: order.id,
      description: 'Integration settlement', metadata: { paymentIds: settlement.payments.map((payment) => payment.id) },
    });
    return settlement;
  }, { isolationLevel: 'Serializable' });

  assert.equal(result.paidAmount, 100);
  assert.equal(result.paymentStatus, 'PAID');
  const [storedOrder, allocation, audit] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id } }),
    prisma.paymentAllocation.aggregate({ where: { orderId: order.id, status: 'POSTED' }, _sum: { amount: true } }),
    prisma.auditLog.findFirst({ where: { resourceId: order.id, action: 'PAYMENT_RECORDED' } }),
  ]);
  assert.equal(storedOrder.paidAmount, 100);
  assert.equal(allocation._sum.amount, 100);
  assert.ok(audit);

  await assert.rejects(
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id,
      amount: 1,
      method: 'CASH',
      staff: state.actor,
      idempotencyKey: `${runId}:second-settlement`,
    }), { isolationLevel: 'Serializable' }),
    (error) => error instanceof PaymentRuleError && error.code === 'OVERPAYMENT_NOT_ALLOWED'
  );
});

integrationTest('row locking prevents concurrent over-collection', async () => {
  const order = await createOrder('CONCURRENCY');
  const attempts = await Promise.allSettled([
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id, amount: 70, method: 'CASH', staff: state.actor, idempotencyKey: `${runId}:concurrent-a`,
    }), { isolationLevel: 'Serializable' }),
    prisma.$transaction((tx) => recordOrderSettlement(tx, {
      orderId: order.id, amount: 70, method: 'CASH', staff: state.actor, idempotencyKey: `${runId}:concurrent-b`,
    }), { isolationLevel: 'Serializable' }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);

  const [orderAfter, allocation] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id } }),
    prisma.paymentAllocation.aggregate({ where: { orderId: order.id, status: 'POSTED' }, _sum: { amount: true } }),
  ]);
  assert.equal(orderAfter.paidAmount, 70);
  assert.equal(allocation._sum.amount, 70);
});

integrationTest('business write and audit evidence roll back together', async () => {
  const orderNumber = `IT-${runId}-ROLLBACK`;
  await assert.rejects(prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: state.customer.id,
        documentType: 'ORDER',
        source: 'COUNTER',
        status: 'PICKED_UP',
        subtotal: 25,
        totalAmount: 25,
        assignedToId: state.staff.id,
      },
    });
    await writeAuditEvent(tx, {
      actorType: 'staff', actorId: state.staff.id, actorName: state.staff.name,
      action: 'ORDER_CREATED', resource: 'order', resourceId: order.id,
      description: 'Rollback integration event',
    });
    throw new Error('ROLLBACK_TEST');
  }), /ROLLBACK_TEST/);

  assert.equal(await prisma.order.count({ where: { orderNumber } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { description: 'Rollback integration event' } }), 0);
});

integrationTest('physical garment quantity has one immutable unique unit tag per piece', async () => {
  const order = await createOrder('GARMENT-UNITS', 300);
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id, serviceId: state.service.id, serviceName: state.service.name,
      garmentType: state.service.category, quantity: 3, unitPrice: 100, subtotal: 300,
    },
  });
  const initial = await prisma.$transaction((tx) => syncOrderGarmentUnits(tx, order.id));
  assert.equal(initial.length, 3);
  assert.equal(new Set(initial.map((unit) => unit.tagNumber)).size, 3);

  await prisma.orderItem.update({ where: { id: item.id }, data: { quantity: 2, subtotal: 200 } });
  await prisma.$transaction((tx) => syncOrderGarmentUnits(tx, order.id, { voidReason: 'INTEGRATION_REDUCTION' }));
  const units = await prisma.garmentUnit.findMany({ where: { orderItemId: item.id } });
  assert.equal(units.filter((unit) => unit.status !== 'VOID').length, 2);
  assert.equal(units.filter((unit) => unit.status === 'VOID').length, 1);
});

integrationTest('database permits only one default address per customer under concurrency', async () => {
  const attempts = await Promise.allSettled([
    prisma.address.create({ data: { customerId: state.customer.id, label: 'HOME', addressLine1: 'Integration A', city: 'Mumbai', pincode: '400001', isDefault: true } }),
    prisma.address.create({ data: { customerId: state.customer.id, label: 'WORK', addressLine1: 'Integration B', city: 'Mumbai', pincode: '400001', isDefault: true } }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(await prisma.address.count({ where: { customerId: state.customer.id, isDefault: true } }), 1);
});

integrationTest('document sequence remains unique under concurrent generation', async () => {
  const values = await Promise.all(Array.from({ length: 12 }, () =>
    prisma.$transaction((tx) => nextDocumentNumber({
      tx, documentType: `INTEGRATION_${runId}`, prefix: 'ITSEQ-', padding: 6,
    }))
  ));
  assert.equal(new Set(values).size, values.length);
});
