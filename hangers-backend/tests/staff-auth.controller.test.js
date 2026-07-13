const test = require('node:test');
const assert = require('node:assert/strict');

const { _internals } = require('../src/controllers/staffAuth.controller');

test('staff auth browser response does not expose bearer token in JSON', () => {
  const response = _internals.buildStaffAuthResponse(
    {
      id: 'staff-1',
      name: 'Manager',
      phone: '9999999999',
      email: 'manager@example.com',
      role: 'MANAGER',
      mustChangePassword: false,
    },
    {
      permissions: ['orders.view'],
      services: ['CRM'],
    }
  );

  assert.equal(Object.prototype.hasOwnProperty.call(response, 'token'), false);
  assert.equal(response.staff.role, 'MANAGER');
  assert.deepEqual(response.staff.permissions, ['orders.view']);
});

