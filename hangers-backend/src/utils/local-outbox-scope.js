const HOME_TEST_PHONES = ['9930367267', '919930367267', '+919930367267'];

const localOutboxEnabled = ({ outboxWorker, outboxHomeOnly }) => (
  outboxWorker === 'false' || (outboxWorker === 'true' && outboxHomeOnly === 'true')
);

const homeOutboxScope = async (db) => {
  const customers = await db.customer.findMany({
    where: { phone: { in: HOME_TEST_PHONES } }, select: { id: true },
  });
  const customerId = { in: customers.map((customer) => customer.id) };
  const branches = [];
  for (const [model, eventTypes] of [
    ['order', ['ORDER_STATUS', 'ORDER_UPDATED', 'PAYMENT_RECEIVED']],
    ['invoice', ['INVOICE_PAYMENT_RECEIVED']],
    ['ironBill', ['DAILY_IRON_BILL', 'DAILY_IRON_PAYMENT']],
    ['ironLog', ['DAILY_IRON_LOG']],
    ['ironSubscription', ['DAILY_IRON_LOG_BATCH']],
  ]) {
    const resources = await db[model].findMany({ where: { customerId }, select: { id: true } });
    if (resources.length) branches.push({ eventType: { in: eventTypes }, aggregateId: { in: resources.map((resource) => resource.id) } });
  }
  const requests = await db.websitePickupRequest.findMany({
    where: { phone: { in: HOME_TEST_PHONES } }, select: { id: true },
  });
  if (requests.length) {
    const eventTypes = ['PICKUP_REQUEST_CUSTOMER_CONFIRMATION'];
    const setting = await db.setting.findUnique({ where: { key: 'public_site_profile' }, select: { value: true } });
    let businessPhone = '';
    try { businessPhone = String(JSON.parse(setting?.value || '{}').phone || '').replace(/[\s\-()+]/g, ''); } catch { /* Invalid configuration must not widen dispatch. */ }
    if (['9930367267', '919930367267'].includes(businessPhone)) eventTypes.push('PICKUP_REQUEST_CREATED');
    branches.push({ eventType: { in: eventTypes }, aggregateId: { in: requests.map((request) => request.id) } });
  }
  return { OR: branches };
};

module.exports = { homeOutboxScope, localOutboxEnabled };
