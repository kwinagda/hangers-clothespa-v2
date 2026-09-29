const STATUS_FIRST_REASONS = new Set([
  'collect_request_pending',
  'payment_pending',
  'payment_timed_out',
  'payment_session_expired',
  'payment_collect_request_expired',
  'request_timed_out',
  'verification_failed',
]);

const CONFIGURATION_REASONS = new Set([
  'bank_not_enabled',
  'card_network_not_enabled',
  'emi_plan_unavailable',
  'input_validation_failed',
  'invalid_amount',
  'invalid_currency',
  'invalid_order_id',
  'live_mode_not_enabled',
  'merchant_not_activated',
  'order_amount_mismatch',
  'order_payment_method_mismatch',
  'payment_method_not_enabled',
  'upi_collect_not_enabled',
  'upi_intent_not_enabled',
]);

const classifyRazorpayPaymentError = ({ providerErrorSource, providerErrorReason } = {}) => {
  const source = typeof providerErrorSource === 'string' ? providerErrorSource.toLowerCase() : null;
  const reason = typeof providerErrorReason === 'string' ? providerErrorReason.toLowerCase() : null;

  if (!source && !reason) return null;
  if (STATUS_FIRST_REASONS.has(reason)) {
    return {
      category: 'PENDING_OR_UNKNOWN',
      operatorAction: 'CHECK_PROVIDER_STATUS',
      automaticRetry: false,
    };
  }
  if (CONFIGURATION_REASONS.has(reason) || source === 'business') {
    return {
      category: 'MERCHANT_CONFIGURATION',
      operatorAction: 'REVIEW_RAZORPAY_ACCOUNT_OR_INTEGRATION',
      automaticRetry: false,
    };
  }
  if (source === 'customer') {
    return {
      category: 'CUSTOMER_OR_INSTRUMENT',
      operatorAction: 'CONFIRM_TERMINAL_FAILURE_BEFORE_CUSTOMER_RETRY',
      automaticRetry: false,
    };
  }
  if (source === 'gateway') {
    return {
      category: 'BANK_OR_GATEWAY',
      operatorAction: 'CHECK_TERMINAL_STATUS_AND_PROVIDER_DOWNTIME',
      automaticRetry: false,
    };
  }
  if (source === 'razorpay') {
    return {
      category: 'RAZORPAY_PLATFORM',
      operatorAction: 'CHECK_TERMINAL_STATUS_THEN_ESCALATE_IF_PERSISTENT',
      automaticRetry: false,
    };
  }
  return {
    category: 'UNCLASSIFIED',
    operatorAction: 'FINANCE_REVIEW',
    automaticRetry: false,
  };
};

module.exports = { classifyRazorpayPaymentError };
