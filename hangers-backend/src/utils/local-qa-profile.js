const { localOutboxEnabled } = require('./local-outbox-scope');

const matchesLocalQaProfile = ({
  isProduction,
  databaseName,
  databaseUser,
  databaseAddress,
  databasePort,
  razorpayKeyId,
  outboxWorker,
  outboxHomeOnly,
  skipStartupSync,
}) => (
  !isProduction
  && databaseName === 'hangers_db'
  && databaseUser === 'postgres'
  && ['127.0.0.1', '::1'].includes(databaseAddress)
  && databasePort === 5432
  && String(razorpayKeyId || '').startsWith('rzp_test_')
  && localOutboxEnabled({ outboxWorker, outboxHomeOnly })
  && skipStartupSync === 'true'
);

const matchesLocalQaConfiguration = ({
  databaseUrl,
  razorpayKeyId,
  outboxWorker,
  outboxHomeOnly,
  skipStartupSync,
}) => {
  let parsed;
  try {
    parsed = new URL(databaseUrl || '');
  } catch {
    return false;
  }

  return parsed.protocol === 'postgresql:'
    && parsed.hostname === 'localhost'
    && parsed.port === '5432'
    && parsed.pathname === '/hangers_db'
    && parsed.username === 'postgres'
    && String(razorpayKeyId || '').startsWith('rzp_test_')
    && localOutboxEnabled({ outboxWorker, outboxHomeOnly })
    && skipStartupSync === 'true';
};

module.exports = { matchesLocalQaConfiguration, matchesLocalQaProfile };
