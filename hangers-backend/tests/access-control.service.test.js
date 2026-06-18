const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasResolvedPermission,
  hasResolvedServiceAccess,
} = require('../src/services/accessControl.service');

test('hasResolvedPermission honors wildcard access', () => {
  assert.equal(hasResolvedPermission({ effectivePermissions: ['*'] }, 'orders.edit'), true);
});

test('hasResolvedPermission checks explicit permission membership', () => {
  assert.equal(hasResolvedPermission({ effectivePermissions: ['orders.view', 'orders.edit'] }, 'orders.edit'), true);
  assert.equal(hasResolvedPermission({ effectivePermissions: ['orders.view'] }, 'orders.edit'), false);
});

test('hasResolvedServiceAccess checks explicit service membership', () => {
  assert.equal(hasResolvedServiceAccess({ serviceAccess: ['CRM', 'FINANCE'] }, 'CRM'), true);
  assert.equal(hasResolvedServiceAccess({ serviceAccess: ['CRM'] }, 'PLANT'), false);
});
