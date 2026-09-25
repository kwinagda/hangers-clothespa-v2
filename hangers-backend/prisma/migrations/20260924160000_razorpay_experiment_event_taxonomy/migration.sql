ALTER TABLE "razorpay_checkout_experiment_events"
  DROP CONSTRAINT "razorpay_checkout_experiment_events_type_check";

ALTER TABLE "razorpay_checkout_experiment_events"
  ADD CONSTRAINT "razorpay_checkout_experiment_events_type_check"
  CHECK ("eventType" IN (
    'EXPOSURE',
    'CTA_CLICK',
    'CHECKOUT_OPENED',
    'CHECKOUT_ABANDONED',
    'CHECKOUT_CALLBACK_RETURNED',
    'CHECKOUT_OPEN_REQUESTED',
    'CHECKOUT_DISMISSED',
    'CHECKOUT_HANDLER_RETURNED',
    'PAYMENT_FAILED_CALLBACK',
    'CLIENT_ERROR',
    'CRM_CAPTURED'
  ));
