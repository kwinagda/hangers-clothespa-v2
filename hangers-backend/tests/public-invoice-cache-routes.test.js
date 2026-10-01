const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../src/routes/public.routes');
const { privateNoStore } = require('../src/middleware/privateCache');

test('every public invoice-share and checkout route sets private no-store before other middleware', () => {
  const invoiceRoutes = router.stack
    .filter((layer) => layer.route?.path?.startsWith('/invoices/:slug'));

  assert.equal(invoiceRoutes.length, 12);
  for (const layer of invoiceRoutes) {
    assert.equal(layer.route.stack[0].handle, privateNoStore, layer.route.path);
  }
});
