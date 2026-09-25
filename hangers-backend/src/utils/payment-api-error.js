const CHECK_STATUS_FIRST = new Set([
  'CHECKOUT_RESULT_UNKNOWN',
  'CHECKOUT_ATTEMPT_UNRESOLVED',
  'CHECKOUT_ALREADY_IN_PROGRESS',
  'CHECKOUT_ATTEMPT_STALE',
  'SETTLEMENT_REQUIRES_REVIEW',
]);

const defaultAction = ({ statusCode, retryable, code }) => {
  if (CHECK_STATUS_FIRST.has(code)) return 'CHECK_STATUS_FIRST';
  if (retryable) return 'RETRY_SAME_REQUEST';
  if (statusCode === 401 || statusCode === 403) return 'CONTACT_ADMIN';
  if (statusCode === 404) return 'CHECK_RESOURCE';
  if (statusCode === 409) return 'CHECK_CURRENT_STATE';
  if (statusCode >= 500) return 'CONTACT_SUPPORT';
  return 'CORRECT_REQUEST';
};

const paymentApiError = (res, {
  statusCode = 500,
  code = 'PAYMENT_INTERNAL_ERROR',
  message = 'Payment request could not be completed.',
  requestId = null,
  retryable,
  action,
  fieldErrors,
  details,
} = {}) => {
  const canRetry = retryable ?? (!CHECK_STATUS_FIRST.has(code) && (statusCode === 408 || statusCode === 429 || statusCode >= 500));
  const body = {
    success: false,
    code,
    message,
    requestId: requestId || null,
    retryable: canRetry,
    action: action || defaultAction({ statusCode, retryable: canRetry, code }),
  };
  if (fieldErrors?.length) body.fieldErrors = fieldErrors;
  if (details && typeof details === 'object') body.details = details;
  return res.status(statusCode).json(body);
};

const validationFieldErrors = (issues = []) => issues.map((issue) => ({
  field: Array.isArray(issue.path) ? issue.path.join('.') : '',
  code: String(issue.code || 'INVALID_VALUE'),
  message: String(issue.message || 'Invalid value'),
}));

module.exports = { paymentApiError, validationFieldErrors };
