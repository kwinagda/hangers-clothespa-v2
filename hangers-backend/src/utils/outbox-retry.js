const MAX_OUTBOX_ATTEMPTS = 10;

const classifyOutboxFailure = ({ error, attempts }) => {
  const attemptCount = Math.max(1, Number(attempts || 1));
  const permanent = error?.retryable === false;
  const dead = permanent || attemptCount >= MAX_OUTBOX_ATTEMPTS;
  const delayMs = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attemptCount, 12)));

  return { dead, delayMs };
};

module.exports = { MAX_OUTBOX_ATTEMPTS, classifyOutboxFailure };
