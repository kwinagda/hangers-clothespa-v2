BEGIN;

ALTER TABLE "Payment"
  ADD COLUMN "recordedAt" TIMESTAMP(3);

-- Keep createdAt unchanged; it may be an effective date rather than an event time.
WITH linked_audit_events AS (
  SELECT
    refs.payment_id AS payment_id,
    audit.id AS audit_id,
    audit."createdAt" AS recorded_at
  FROM audit_logs AS audit
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(audit.metadata->'paymentIds') = 'array' THEN audit.metadata->'paymentIds'
      ELSE '[]'::jsonb
    END
  ) AS refs(payment_id)
  WHERE audit.action IN (
    'PAYMENT_RECORDED',
    'DELIVERY_CASH_COLLECTED',
    'WALLET_APPLIED_TO_ORDER'
  )
    AND audit.status = 'SUCCESS'
  UNION ALL
  SELECT
    audit."resourceId" AS payment_id,
    audit.id AS audit_id,
    audit."createdAt" AS recorded_at
  FROM audit_logs AS audit
  WHERE audit.action = 'ORDER_REFUND_ISSUED'
    AND audit.resource = 'payment'
    AND audit."resourceId" IS NOT NULL
    AND audit.status = 'SUCCESS'
  UNION ALL
  SELECT
    audit.metadata->>'localRefundPaymentId' AS payment_id,
    audit.id AS audit_id,
    audit."createdAt" AS recorded_at
  FROM audit_logs AS audit
  WHERE audit.action IN (
    'RAZORPAY_AUTOMATIC_REFUND_LEDGER_POSTED',
    'RAZORPAY_REFUND_LEDGER_POSTED'
  )
    AND audit.metadata->>'localRefundPaymentId' IS NOT NULL
    AND audit.status = 'SUCCESS'
), unambiguous_recording_times AS (
  SELECT payment_id, MIN(recorded_at) AS recorded_at
  FROM linked_audit_events
  GROUP BY payment_id
  HAVING COUNT(DISTINCT audit_id) = 1
)
UPDATE "Payment" AS payment
SET "recordedAt" = evidence.recorded_at
FROM unambiguous_recording_times AS evidence
WHERE payment.id = evidence.payment_id
  AND payment."recordedAt" IS NULL;

ALTER TABLE "Payment"
  ALTER COLUMN "recordedAt" SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
