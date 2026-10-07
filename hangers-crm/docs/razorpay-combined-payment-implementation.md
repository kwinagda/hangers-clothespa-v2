# A18: Shared Individual and Combined Payments

Approved by Kevin on 5 October 2026. This file freezes the design agreed in chat. It supplements, rather than replaces, the A01-A24 register and findings. No additional A labels or inflated completion counts.

## Approved Contract (Replaces Earlier Reservation Rule)

**An unresolved Razorpay attempt does not block a deliberate new Pay action** on either an individual invoice or the consolidated outstanding-invoice view. The earlier A18 wording that treated every unresolved attempt as a reservation is superseded. Keep same-request idempotency and rapid double-click protection, but a customer who explicitly starts a new attempt after the prior attempt is uncertain may proceed. Do not claim that the old Razorpay order was cancelled: it may still collect.

Before creating a new order, best-effort fetch known Razorpay Order/Payment state and settle any already-captured payment. A timeout, API outage, `created`, or `attempted` response is not proof of failure and is not a reason to strand the customer. If the customer explicitly continues, create a distinct CRM checkout attempt and provider order for the current payable balance. The prior attempt and provider IDs remain immutable and monitored for late capture. Never reuse a prior attempt with a different amount or allocation snapshot. An exact compatible existing order may be resumed only when the user is resuming that same attempt, not when silently retrying a new payment.

At capture, fetch/verify the Razorpay Payment and Order binding, amount, currency, mode, and CRM attempt. In one locked database transaction, record the **full amount Razorpay captured** and allocate only up to the remaining due on invoices in that attempt's frozen allocation snapshot. Current invoice balances at settlement time are authoritative; each allocation is capped at both its snapshot amount and current due. Paid/void/cancelled invoices receive no allocation. Do not move surplus to another invoice that was not in the snapshot, and do not make an invoice appear overpaid to force accounting through.

If the capture exceeds those valid allocations, persist the unapplied surplus and an automatic refund job atomically with the captured-payment ledger record. Refund only the confirmed surplus, against that captured Razorpay Payment ID, through Razorpay's documented normal-refund API. Use a durable unique refund request/idempotency record and reconcile `pending`, `processed`, and `failed` from Razorpay API/webhooks. A crash after capture but before the refund call must leave a retryable durable job; an ambiguous refund call must be reconciled before another create call. Do not describe a refund as complete until Razorpay reports `processed`. Razorpay documents a minimum normal refund of ₹1.00: surplus below that minimum stays visible as an exception for Finance; never round it up or silently absorb it.

Examples:

- Invoice A is ₹10 due. Its old checkout is still `created`. The customer explicitly pays through a new checkout, and that payment captures ₹10 first. A receives ₹10 and becomes paid. If the old checkout later captures ₹10, the old capture is recorded, allocates ₹0 because A is already paid, and a ₹10 refund is created and tracked.
- A combined checkout snapshots A ₹10 + B ₹100 = ₹110. A separate checkout pays A first. If the combined ₹110 later captures, it allocates ₹100 to B, allocates ₹0 to now-paid A, and refunds the remaining ₹10. It must not show A as paid twice or B as paid ₹110.
- If the second capture is only partially allocatable and surplus is ₹0.50, Razorpay's documented ₹1 minimum means the system must not submit an invalid refund or hide the surplus; it records a finance exception and exposes it operationally.

Same key / same request returns the same attempt. A new customer Pay action uses a new idempotency key and creates a separate attempt only after the explicit action; background polling, refresh, or browser reopen never creates an order. Recompute current receivables before the new attempt and require confirmation if the shown total changed. Browser callback, signed webhook, and reconciliation all converge on the same settlement/refund idempotency. Late captures remain bindable even when their local attempts are superseded or public links are revoked. All Hangers invoice source types are in scope.

Public checkout shows the current amount, clear payment progress, and a deliberate retry/new-payment action when available. It must not claim the previous order was cancelled or that a refund has already arrived. Internal provider IDs and refund state remain available to Finance and support.

## Source-of-Truth and Error-Code Rule

Every amount, invoice balance/allocation, checkout attempt, Razorpay order/payment/refund reference, payment state, and refund state used by this flow must be read from the canonical CRM database or verified from Razorpay's documented API/webhook response. Do not hardcode or infer provider state, invent terminal outcomes, reuse stale invoice snapshots, or silently substitute a different order/allocation. An unavailable or malformed source remains explicitly unknown/reviewable and returns a Hangers-owned error code; the exact Razorpay error code is preserved in a separate provider field only when Razorpay supplied it. Internal Hangers codes must never be presented as Razorpay codes.

This does not prohibit documented static schema mappings or customer-facing copy. Static values must never masquerade as current payment/account data. A fallback is allowed only when current Razorpay documentation explicitly defines its trigger, exact value and recovery behavior; it must be bounded, clearly identified as temporary, and replaced with authoritative data when it arrives. No other fallback is implied.

## Frozen Verification Matrix

Each row requires named code/test evidence before checking it. Existing valid evidence may be reused; do not rerun passing unrelated suites. These are scenarios within A18, not new master tasks.

| ID | Scenario and acceptance | Status |
|---|---|---|
| V01 | Same idempotency key/double-click returns one attempt/order; a separate explicit Pay action creates a distinct attempt. | Partial: distinct explicit retry is mock-tested; no post-change DB idempotency/concurrency proof. |
| V02 | Individual and combined checkouts may overlap while unresolved; captures allocate only current invoice balances and refund any surplus. | Partial: service mock covers multiple overlapping attempts and capped allocation; public-route preflight and DB settlement remain unverified. |
| V03 | Different checkout scope/amount never reuses an incompatible provider order; unrelated invoices and Test/Live remain isolated. | Partial: focused mocks cover unrelated invoices and Test/Live mode; full API/snapshot binding not rerun. |
| V04 | Current unpaid summary is recomputed before payment; partial dues included, paid/void/cancelled excluded, changed total confirmed. | Mock pass for stale displayed amount; no browser/API end-to-end verification. |
| V05 | New invoices do not alter an in-flight payment split. | Pending: no post-change regression evidence. |
| V06 | Refresh/reopen/offline does not create orders automatically; explicit customer action can continue with a new attempt. | Partial: current mocked browser coverage confirms a terminally failed Card payment can retry with the same Razorpay order and preserves email/method state. A18's distinct new-attempt path after an unresolved prior attempt still lacks DB-backed verification. |
| V07 | Ambiguous create response is reconciled when possible; if a user later explicitly starts a new attempt, any late capture from either order remains attributable. | Mock pass for bounded create-response races; provider/DB late-capture path remains unverified. |
| V08 | Duplicate callback/webhook/status delivery creates one captured-payment ledger entry and one refund job per provider payment. | Partial: in-memory tests cover refund-event replay and one refund ledger row; DB-backed settlement/webhook idempotency remains unverified. |
| V09 | Out-of-order failure/authorization/capture/refund events never downgrade a capture or duplicate a refund. | Partial: an authoritative refund fetch overrides a stale webhook label in unit tests; DB-backed payment/refund event ordering remains unverified. |
| V10 | Crash after capture ledger commit but before refund API call resumes the durable refund job; ambiguous refund call is reconciled before retry. | Partial: worker tests verify the same payment, amount, body and provider idempotency key after a simulated timeout; persisted crash/restart recovery remains unverified. |
| V11 | Staff/other-channel payment wins race safely; later online capture is retained and surplus refunded without corrupting invoice/order status. | Pending: only the isolated allocation fixture covers an already-paid invoice; cross-channel race is unverified. |
| V12 | Single and combined late/duplicate capture allocates only due balances in its snapshot; exact surplus is refunded, sub-₹1 surplus is an explicit Finance exception. | Partial: mock tests verify capped allocation, exact surplus, idempotent reservation, below-minimum review, mode isolation and processed-refund ledger posting; DB-backed completion is unverified. |
| V13 | Journey and settlement recovery survive the original anchor invoice becoming paid or disappearing from the current outstanding summary. | Partial: recovery code and prior status evidence exist; changed code was not re-run against a disposable database. |
| V14 | Revoked/expired public link blocks public access but does not stop authenticated webhook settlement/refund. | Pending: no post-change evidence. |
| V15 | Wrong customer/invoice/order/currency/mode/amount/payment binding is rejected and cannot trigger allocation/refund. | Partial: isolated allocation tests cover customer/currency checks; full provider/refund binding suite not re-run. |
| V16 | Exact paise totals/allocations/refund surplus work across partial balances and the existing deterministic 100-invoice preparation bound. | Partial: 100-invoice preparation and exact-paise allocation fixtures exist; 100-invoice settlement/refund scale is unverified. |

## Execution and Closure

**A18-a closure is a finite acceptance, not a deployment gate:** A18-a is complete as of 7 October 2026. The one combined Razorpay Test capture is matched to the paid provider order, exact CRM capture, immutable invoice allocations, zero balances and paid customer view. Existing unresolved provider orders remain intact and monitored for late capture. A24 owns PR approval/merge, production migration/configuration, deployment, and post-release checks; none of those production steps was needed to close A18-a.

- [x] Freeze the revised approved contract and finite A18 matrix in this file; earlier reservation text is superseded.
- [x] Freeze the revised explicit-retry/overpayment-refund contract and finite V01-V16 matrix.
- [x] Implement an explicit retry path that preflights overlapping provider orders and supersedes every still-active overlapping CRM attempt in one transaction. Keep the provider orders intact and monitored.
- [x] Implement full verified capture recording, current-due-capped snapshot allocations, persisted unallocated amount, durable automatic refund reservation and ₹1 minimum exception handling.
- [x] Add in-memory regression coverage for explicit overlapping attempts, exact allocation/surplus, idempotent refund reservation, and the below-minimum exception.
- [x] Keep A18-a's one combined Test capture and paid customer-view acceptance separate; it was completed and recorded 7 October 2026.
- [x] Add A18-b refund API mode checks, stable normal-refund request, authoritative status handling, one-time `REFUND` ledger posting and linked audit evidence; focused mocked tests pass 28/28 across five suites on 7 October 2026.
- [x] Run one disposable-database acceptance scenario for late capture after another channel paid an invoice. On 7 October 2026, the new integration case passed on the isolated local `hangers_checkout_qa_20261007_a18b` database after all 82 migrations were applied. It verified atomic captured-receipt recording, allocation capped to the remaining ₹100, ₹100 surplus reservation, simulated provider timeout and retry with the same refund idempotency identity, authoritative `processed` status lookup on duplicate webhook delivery, exactly one `REFUND` ledger row, zero remaining unallocated amount, and audit linkage across checkout/payment/refund IDs. Provider calls were injected stubs; no Razorpay request/payment/refund, notification, production DB, or existing `hangers_db` mutation occurred. Test-owned rows were cleaned up. No second checkout payment or UI redesign test is part of A18-b.
- [ ] Run exact-SHA CI for the completed source change before considering a release. Production migration/deployment is A24, not an A18-b requirement.

**Environment and test authority (updated 7 October 2026):** The user authorizes source/test/docs changes, synthetic checkout QA data, disposable local/CI database creation and mutation, exact-SHA CI, and Razorpay Test Mode payments/refunds when required by the finite A18 acceptance. Prefer a disposable database, verify Test Mode before provider writes, preserve pre-existing work/data, and clean up only test-owned records. Live credentials/actions, production database/deployment, and unrelated work remain prohibited by this task authorization. The earlier read-only-only boundary is superseded for future A18 execution; historical read-only observations remain dated evidence. A18-b has one remaining gate: exact-SHA CI.

## Sources and Boundaries

- https://razorpay.com/docs/api/orders/fetch-with-id/ : fetch authoritative order state.
- https://razorpay.com/docs/api/payments/fetch-with-id/ : fetch authoritative payment state before treating a capture as settled.
- https://razorpay.com/docs/api/refunds/create-normal/ : payment-based full/partial refund, paise amount, provider states and ₹1.00 minimum.
- https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/ : retrying a refund request with the same provider idempotency key and request body.
- https://razorpay.com/docs/api/refunds/fetch-with-id/ : authoritative refund state by Razorpay Refund ID.
- https://razorpay.com/docs/api/refunds/fetch-multiple-refund-payment : list refunds against a Razorpay Payment ID when needed for reconciliation.
- https://razorpay.com/docs/webhooks/best-practices/ : signature verification, duplicate/out-of-order events and API polling.
- https://razorpay.com/docs/webhooks/validate-test/ : raw-body signature verification and Test validation.

**Refund API contract:** Razorpay creates a refund against a captured **Payment ID**, not an Order ID: `POST /v1/payments/{payment_id}/refund`. Hangers sends an exact partial amount in paise and explicitly requests normal speed. A refund response is not a completed customer refund while status is `pending`; only Razorpay `processed` is final for posting the local `Payment.kind = REFUND` ledger row. On an ambiguous create timeout, retry the same endpoint with the same `X-Refund-Idempotency` value and identical body. The idempotency key is unique per refund; Razorpay documents `409` while that same request is still being processed. Webhook event delivery success is separate from provider refund status; the worker fetches the refund and records its authoritative status.

## Historical Execution Evidence - 5 October 2026 (Before Revised Contract)

- Creation/recovery, status, reconciliation, resume and callback focused bundle: 56/56 passed on 5 October 2026. It covers both reservation directions across five active states, unrelated-invoice and mode isolation, stale expected amount, late create-response races, explicit master-attempt recovery, callback binding and safe resume. These are primarily unit/mocked checks, not database-backed settlement proof.
- CRM `npx tsc --noEmit`, `npm run lint:checkout`, and `git diff --check`: passed.
- Kevin Chrome on existing `localhost:5002`: one customer outstanding-summary flow showed four open invoices totaling ₹142, retained the under-review state, and after “Check Razorpay status” returned to the same pending state without enabling a second payment. The temporary customer share used for this flow was revoked immediately. No final success/paid UI was exercised.
- Read-only local `hangers_db` plus Razorpay Test API check at 22:35 IST: four Home invoices remain open (₹10, ₹100, ₹10, and ₹22 balances). Three bound provider orders are `created` with no payments; the fourth is `attempted` with one `failed` and one `created` payment. There is no captured payment in these four orders. No capture, replacement order, or attempt status was fabricated.

Historical note from the pre-revision design: the recorded Home orders overlapped outstanding invoices, and the old recommendation was to wait for provider terminal status before another attempt. That recommendation is superseded by the approved contract above. Do not cancel or locally clear those provider orders. Under the current design, a deliberate new Pay action supersedes intersecting CRM attempts but leaves provider orders monitored; any late capture must be reconciled and surplus refunded/reviewed. The remaining A18-b evidence is only the database-backed late-capture/refund recovery acceptance and exact-SHA CI. A18-a's combined Test capture and paid customer-view acceptance are already complete; no second combined capture or UI run is required. `combined-checkout.integration.test.js` remains guarded for disposable CI; do not claim it ran against local `hangers_db` or remove the guard.

Current disposition: A18-a is complete: one combined Test capture is reconciled to provider state, the CRM ledger, the frozen invoice allocations, zero balances and paid customer view. A18-b has mocked evidence for refund request/retry, mode isolation, authoritative status, duplicate event handling, refund ledger classification and audit linkage. It remains Partial for one disposable-database late-capture/refund recovery acceptance and exact-SHA CI. A18-b does not require another checkout payment, final paid UI run, or production deployment.

## Historical Verification - 6 October 2026

- Isolated mock suites: 32/32 passed (`razorpay-checkout-create-recovery-race.unit.test.js` and `combined-checkout-settlement.unit.test.js`). In addition to overlapping-order, allocation and refund cases, this includes same-attempt reuse only after provider verification confirms the one existing `CREATED` order has no payment evidence; it rejects reuse when the provider reports payment evidence.
- Backend `node --check` passed for the changed checkout service, public controller and focused test files.
- `npm run db:validate` passed; this validates Prisma schema syntax only and does not apply the migration or connect for migration rehearsal.
- CRM `npx tsc --noEmit` and `npm run lint:checkout` passed.
- Read-only local `hangers_db` inspection found the current combined Test attempt for ₹120 (12,000 paise), with the frozen ₹10/₹10/₹100 invoice split and no bound Payment ID. Razorpay Test `Fetch Order` and `Fetch Payments for an Order` confirm the same order is `created`, `amount_paid=0`, `amount_due=12000`, with no payments.
- Read-only localhost checks: PostgreSQL is already running on port 5432 (PID 414); API `localhost:5001/health` and CRM `localhost:5002` are available. The checkout renders ₹120 for three Home invoices and shows the same existing Razorpay order. No invoice, attempt, payment, database fixture, migration or message was created/changed by these checks.
- The card path remains unavailable in this Test environment: the documented sample IIN `438628` returns Razorpay `BAD_REQUEST_ERROR` / HTTP 400, `The requested URL was not found on the server.` through both SDK and direct API requests (with and without a trailing slash). The checkout therefore keeps Card Pay disabled until the provider eligibility lookup succeeds; details are recorded under A05-a/F46 in the findings file. No PAN/CVV was sent and no payment was submitted.
- No combined Test capture/settlement, DB-backed fixture, migration, exact-SHA CI run or deployment was performed. The working-tree migration remains unapplied. A18 and A18-a remain open.

## Current Verification - 7 October 2026

- One combined ₹120 Razorpay Test payment using a documented Test Visa completed successfully. The provider order is `paid`; the matching provider payment and CRM payment are `captured` for ₹120.
- The persisted immutable allocation is three invoice shares of ₹10, ₹10 and ₹100. The local ledger has exactly three posted allocations totaling ₹120; all three invoices are `PAID` with zero remaining balance, and the customer invoice view shows no amount due.
- Provider order/payment references were matched to the CRM attempt and payment; no replacement or old provider order was cancelled. No WhatsApp notification was sent for this verification.
- This closes A18-a only. A18-b remains Partial because database-backed contention, webhook/refund recovery and late-capture/refund acceptance are still open. No new payment or data mutation was performed during this read-only continuation.
