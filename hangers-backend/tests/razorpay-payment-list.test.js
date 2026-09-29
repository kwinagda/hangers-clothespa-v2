const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isCompleteFailedOrderPaymentList } = require('../src/utils/razorpay-payment-list');

const payment = {
  id: 'pay_failed_123',
  order_id: 'order_123',
  amount: 1000,
  currency: 'INR',
  status: 'failed',
  captured: false,
};

const response = (items = [payment], count = items.length) => ({ count, items });
const expected = { orderId: 'order_123', amountPaise: 1000n, currency: 'INR' };

test('accepts a complete, attributable list of failed payments for the exact order and amount', () => {
  assert.equal(isCompleteFailedOrderPaymentList({ response: response(), ...expected }), true);
});

test('refuses to release checkout when any failed payment lacks its provider ID', () => {
  for (const id of [undefined, '', '   ']) {
    const item = { ...payment };
    if (id === undefined) delete item.id;
    else item.id = id;
    assert.equal(isCompleteFailedOrderPaymentList({ response: response([item]), ...expected }), false);
  }
});

test('refuses incomplete, mixed-state, or mismatched order-payment lists', () => {
  const cases = [
    response([payment], 2),
    response([{ ...payment, status: 'created' }]),
    response([{ ...payment, captured: true }]),
    response([{ ...payment, order_id: 'order_other' }]),
    response([{ ...payment, amount: 999 }]),
    response([{ ...payment, currency: 'USD' }]),
    { count: 0, items: [] },
    { count: 1, items: null },
  ];
  for (const failedList of cases) {
    assert.equal(isCompleteFailedOrderPaymentList({ response: failedList, ...expected }), false);
  }
});
