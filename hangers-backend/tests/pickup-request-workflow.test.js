const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSIONS, WEBSITE_PICKUP_REQUEST_STATUSES, WEBSITE_PICKUP_TIME_SLOTS, WEBSITE_PICKUP_CONTACT_METHODS, WHATSAPP_TEMPLATES } = require('../src/config/master-data');
const { createOrderSchema } = require('../src/validation/orders.schemas');
const { pickupOtpSendSchema, pickupOtpVerifySchema, publicPickupRequestSchema } = require('../src/validation/public.schemas');

test('pickup request workflow has one initial, order-start, and conversion status', () => {
  assert.equal(WEBSITE_PICKUP_REQUEST_STATUSES.filter((status) => status.initial).length, 1);
  assert.equal(WEBSITE_PICKUP_REQUEST_STATUSES.filter((status) => status.orderStartTarget).length, 1);
  assert.equal(WEBSITE_PICKUP_REQUEST_STATUSES.filter((status) => status.conversionTarget).length, 1);
  const values = new Set(WEBSITE_PICKUP_REQUEST_STATUSES.map((status) => status.value));
  for (const status of WEBSITE_PICKUP_REQUEST_STATUSES) {
    for (const target of status.allowedTransitions) assert.equal(values.has(target), true, `${target} must exist`);
  }
});

test('pickup request staff permissions and public time slots are configured', () => {
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('pickup_requests.manage'), true);
  assert.equal(ROLE_PERMISSIONS.COUNTER_STAFF.includes('pickup_requests.manage'), true);
  assert.equal(ROLE_PERMISSIONS.ACCOUNTS.includes('pickup_requests.view'), true);
  assert.equal(WEBSITE_PICKUP_TIME_SLOTS.length > 0, true);
  assert.equal(WEBSITE_PICKUP_CONTACT_METHODS.length > 0, true);
  assert.equal(WEBSITE_PICKUP_REQUEST_STATUSES.find((status) => status.value === 'NEW').canCreateOrder, false);
  assert.equal(WEBSITE_PICKUP_REQUEST_STATUSES.find((status) => status.value === 'CONFIRMED').canCreateOrder, true);
});

test('pickup OTP and request input reject unstructured or non-digit customer data', () => {
  assert.equal(pickupOtpSendSchema.safeParse({ phone: '99999abc99' }).success, false);
  assert.equal(pickupOtpVerifySchema.safeParse({ phone: '9999999999', otp: '12345' }).success, false);
  assert.equal(pickupOtpVerifySchema.safeParse({ phone: '9999999999', otp: '123456' }).success, true);
  assert.equal(publicPickupRequestSchema.safeParse({
    phone: '9999999999', verificationToken: 'a'.repeat(43), name: 'Test Customer', addressLine1: 'Shop 8A', city: 'Mumbai', pincode: '400080',
    items: [{ serviceKey: 'dry_cleaning', quantity: 4 }], itemsSummary: '2 shirts for dry cleaning',
  }).success, false);
  assert.equal(publicPickupRequestSchema.safeParse({
    phone: '9999999999', verificationToken: 'a'.repeat(43), name: 'Test Customer', addressLine1: 'Shop 8A', city: 'Mumbai', pincode: '400080',
    items: [{ serviceKey: 'dry_cleaning', quantity: 4 }],
  }).success, true);
});

test('pickup customer confirmation uses a separate utility template', () => {
  assert.equal(WHATSAPP_TEMPLATES.pickupRequestOtp.templateName, 'hangers_otp');
  assert.equal(WHATSAPP_TEMPLATES.pickupRequestCustomerConfirmation.templateName, 'hangers_crm_pickup_request_confirmed');
});

test('pickup request alert template has the approved variable order', () => {
  assert.equal(WHATSAPP_TEMPLATES.pickupRequestAlert.templateName, 'hangers_crm_pickup_request_alert');
  assert.deepEqual(WHATSAPP_TEMPLATES.pickupRequestAlert.params, [
    'requestNumber', 'customerName', 'customerPhone', 'itemsSummary', 'preferredSchedule', 'pickupAddress',
  ]);
});

test('order creation accepts a linked pickup request id', () => {
  const result = createOrderSchema.safeParse({
    customerId: 'customer-1',
    pickupRequestId: 'pickup-1',
    items: [{ serviceName: 'Dry Cleaning', garmentType: 'Shirt', quantity: 1, unitPrice: 100 }],
  });
  assert.equal(result.success, true);
});
