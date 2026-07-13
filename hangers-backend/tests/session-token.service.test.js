const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStaffSessionData,
  createSessionId,
  hashToken,
  staffSessionWhereForToken,
} = require('../src/services/sessionToken.service');

test('createSessionId generates unique opaque ids', () => {
  assert.notEqual(createSessionId(), createSessionId());
});

test('staff session data stores token hash and not raw token', () => {
  const data = buildStaffSessionData({
    staffId: 'staff-1',
    token: 'secret.jwt',
    sessionId: 'session-1',
    req: { headers: { 'user-agent': 'test' }, ip: '127.0.0.1' },
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });

  assert.equal(data.token, null);
  assert.equal(data.tokenHash, hashToken('secret.jwt'));
  assert.equal(data.sessionId, 'session-1');
});

test('staff session lookup supports hash, jti, and legacy token during transition', () => {
  const where = staffSessionWhereForToken('secret.jwt', { jti: 'session-1' });

  assert.deepEqual(where.OR, [
    { tokenHash: hashToken('secret.jwt') },
    { sessionId: 'session-1' },
    { token: 'secret.jwt' },
  ]);
});

