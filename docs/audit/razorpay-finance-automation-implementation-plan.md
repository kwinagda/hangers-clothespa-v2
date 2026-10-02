# Razorpay Payment Gateway Implementation Plan

**Status as of 2026-10-02: the Standard Checkout release described below is historical; the combined-payment follow-up and Custom Checkout are not released.**

This document records the earlier Standard Checkout Live release and its operational decisions. It is not the overall Razorpay implementation completion record. The active Custom Checkout plan and acceptance register are maintained in [`razorpay-custom-checkout.md`](../../hangers-crm/docs/razorpay-custom-checkout.md); its partial acceptance rows and release gates remain active. The combined-payment follow-up below is also pending release. Do not infer overall completion from the historical Standard Checkout closeout. No additional Live payment should be initiated solely to complete either plan.

## Goal and scope

### Combined outstanding checkout follow-up (2026-09-29)

The operator requested one combined payment for the customer outstanding summary,
including the reported INR 5,880 split across INR 2,680 and INR 3,200 invoices.
This is a new follow-up, not a reversal of the prior Live release closeout.

- Implemented in PR #7: one summary Pay button, a server-calculated allocation plan,
  one provider order/payment, atomic ledger allocation, one receipt, and one notification.
- Safety review covers share ownership, overlapping single/combined attempts,
  stale balances, provider note binding, duplicate delivery and order-level history/refunds.
- Verification: 98 existing release contracts, dedicated disposable GitHub database
  allocation/duplicate/stale-balance checks and both responsive browser checks passed.
  Main CI: https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/36612610078.
- Operator approved the additive nullable `allocationPlan` field migration and
  deployment after backup and CI. No local database will be copied to production.
- Release remains pending until exact-commit CI, guarded migration, deployment and
  read-only Live invoice checks pass. Do not initiate a real payment for this check.
- 2026-09-30 IST: first deployment stopped before mutation because the migration
  helper incorrectly expected the local database name. Read-only SSM verified
  production is `localhost:5432/hangers_prod`, all other migrations are applied,
  and pg_dump 16.15 is installed. Correct the exact-name guard, retaining backup,
  CI and migration-history checks. Local `hangers_db` is not a production target.
- API reference: https://razorpay.com/docs/api/orders/create/ (one order for the
  combined amount in paise; allocation is recorded by the CRM, not a Razorpay split transfer).

Provide reliable Razorpay Standard Checkout for dry-cleaning customer invoices: create or resume checkout safely, show truthful payment status, reconcile successful payments to the CRM ledger, and receive provider webhooks. This plan does not cover Daily Iron, Field Service, travel/hotel purchases, or unrelated CRM modules.

## Release closeout

- Live code was merged through PR #5 and deployed from commit `9a3b75a3705d11ae63576ba9389810d832567cf6`.
- The push CI run passed: [GitHub Actions run 36588583327](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/36588583327).
- The deployment workflow passed: [GitHub Actions run 36588771868](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/36588771868).
- Production health/readiness and CRM page checks passed after deployment. The supported Node 24 runtime was checked.
- No production database migration or data sync was part of this release.
- The operator independently confirmed one successful real Live payment and one intentionally failed real Live attempt were correctly reflected in the CRM. No further real-money test is authorized or needed by this plan.
- The operator confirmed exposed Test credentials were cleaned up. No credential values belong in this document.

## Payment safety behavior

- Only a provider-confirmed captured payment can mark the invoice paid, settle the ledger, and create its receipt/allocation.
- `created`, `pending`, `authorized`, or attempted-but-not-captured payments are not success. The invoice remains unpaid and is shown as processing/under review; the customer is warned not to pay again while the attempt is unresolved.
- The status action checks the existing payment state. It does not create a second payment. A checkout order is resumed only when provider state is verified as created, the order matches the saved invoice and amount, and there are no payment attempts. A new attempt is allowed only after Razorpay confirms every attempt on the prior order failed. Time passing by itself never authorizes another charge.
- `Check Razorpay status` manually calls the same-invoice reconciliation endpoint, which resolves the attempt through the public invoice token and applies the normal provider binding checks. Razorpay order/payment references are shown on unresolved invoices so Support/Finance can find the exact records. If Razorpay remains nonterminal or unreachable, the invoice stays blocked and displays the references; the customer must not pay again.
- A regression was identified in the customer recovery path: the CRM called `POST /public/invoices/:slug/payment/reconcile`, but the backend route was missing. As a result, a `REVIEW` attempt could remain stuck even though the Finance reconciliation service existed. The endpoint is now registered with invoice/customer ownership checks and rate limiting; the specific route and provider-reference display are covered by release tests.
- Provider status, identifiers, and available error details are retained for reconciliation. When Razorpay later supplies a definitive failure reason, handling can be made specific to that reason; the CRM must not invent a bank decline reason from an ambiguous state.
- Mode/binding checks and webhook signature verification protect settlement from mismatched or forged events.

Relevant implementation: [`razorpay-invoice-checkout.service.js`](../../hangers-backend/src/services/razorpay-invoice-checkout.service.js), [`public.controller.js`](../../hangers-backend/src/controllers/public.controller.js), [`webhooks.controller.js`](../../hangers-backend/src/controllers/webhooks.controller.js), and [`razorpay-webhook-worker.service.js`](../../hangers-backend/src/services/razorpay-webhook-worker.service.js).

## Live webhook configuration

The operator created the Live webhook on 2026-09-29. Dashboard configuration was inspected and confirmed:

- Enabled endpoint: `https://crm.hangers-cs.com/api/v1/webhooks/razorpay/live`
- Alert email: `kevinnagda@gmail.com`
- Signing secret: configured during creation and stored in AWS Secrets Manager; secret value is intentionally omitted.
- Fourteen enabled events:
  - Payments/orders: `payment.authorized`, `payment.failed`, `payment.captured`, `order.paid`
  - Refund lifecycle: `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`
  - Disputes: `payment.dispute.created`, `payment.dispute.action_required`, `payment.dispute.under_review`, `payment.dispute.won`, `payment.dispute.lost`, `payment.dispute.closed`

The endpoint verifies signatures, records events durably, deduplicates by event ID, and processes/reconciles events asynchronously. A webhook is Razorpay's server-to-server notification: it covers delayed status changes and events that may arrive after a customer's browser closes or a temporary network interruption. A successful checkout can appear paid through the immediate checkout/API response even before a webhook is observed; webhooks provide the independent follow-up and recovery path.

**Evidence boundary:** the webhook configuration and deployed processing path are verified. No claim is made that all fourteen event types have each been delivered and processed in Live. The operator explicitly chose to verify real event delivery as those events naturally occur. This is accepted operational monitoring, not a reason to generate artificial refunds/disputes or delay the completed release.

## Test evidence and limitations

Previously recorded Test-mode evidence:

- Visa debit capture: HCS-1287 / INV-001610, ₹100; paid ledger/allocation/receipt verified.
- RuPay credit capture: HCS-1283 / INV-001281, ₹300; CRM reconciliation verified. The WhatsApp provider accepted one payment-received notification; handset delivery was not independently verified.
- A Visa card intended as a timeout fixture (`4100 2800 0009 0000`) unexpectedly produced a captured payment. It is evidence of a successful capture, not a timeout failure test.
- Visa insufficient-funds attempts ended as `payment_cancelled` or remained `created`/uncaptured; they did not establish an `insufficient_fund` failure result.
- Mastercard credit/prepaid success and the remaining negative Visa/Mastercard reason fixtures were not fully validated.
- Amex and Diners Club were excluded because they are not activated for this account.

Historical notes disagree on the number of remaining card-matrix items, so this plan does not repeat an unreliable total. The incomplete scenarios are explicitly deferred by the operator and are **not represented as passed**. Razorpay/bank infrastructure determines payment outcomes; when an unfamiliar definitive status or error occurs, use the Razorpay payment/order ID and provider-reported reason to investigate and implement a targeted CRM mapping. Never create real charges or synthetic refund/dispute events just to fill this matrix.

## Ongoing operations

1. Let naturally occurring Live webhook events arrive. Check Razorpay delivery attempts and the CRM durable inbox/worker outcome; investigate signature failures, repeated delivery failures, or events stuck in retry. Do not infer complete event coverage from the two operator-run checkout transactions, which occurred before webhook setup.
2. For a customer-visible `processing`/`under review` payment, check the same Razorpay payment and order IDs. Do not ask the customer to pay again until provider state is definitive. If it stays ambiguous, reconcile through the provider dashboard/API and authorized Finance workflow.
3. For a definitive captured state, confirm exactly one CRM ledger settlement and receipt. For definitive failure, retain the provider reason and permit a safe retry only after confirming no successful/capturable attempt remains.
4. Keep Live credentials in their approved secret store; never put them in source, logs, screenshots, or this plan. Rotate any credential if it is exposed.

## Historical closeout boundary

The Standard Checkout implementation and the agreed initial Live release described in this document were completed. That historical decision does not close the later combined-payment follow-up, the Custom Checkout work, or its A01-A24 acceptance matrix. Those remain governed by the active plan linked above. The deferred Standard Checkout card-matrix limitation remains specific to its original scope; it must not be used to waive Custom Checkout Test acceptance requirements.
