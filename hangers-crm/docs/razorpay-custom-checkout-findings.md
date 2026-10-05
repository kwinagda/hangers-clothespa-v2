# Custom Checkout Build Findings

**Current goal status (4 October 2026):** 24/24 A-items have explicit status: 17 accepted (A01-A08, A13-A17, A19-A21, A23), 1 N/A (A12), 6 deferred (A09-A11, A18, A22, A24), and 0 active. A18's prior combined-provider capture claim was not substantiated by the approved local ledger; the current Home balance is also held by eight existing single-invoice Orders, documented in A18-a/A18-b. A19's finite current-path success/skip acceptance is complete; one older processed event with no correlated terminal stage remains a deferred historical finding (A19-a). A22 operational policy/runtime evidence is scoped as A22-a. A24's PR is still Draft and open; no merge/release occurred. A14's delayed create/recovery repair passed 13/13 focused local mocked tests and exact-SHA CI run [37156470392](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37156470392) at SHA `0a8b091521210c800c7d05dba9e22e414daaa8a9`. Deferred does not mean accepted or fully implemented. Use the master plan's current register and do not rerun passing checks absent a concrete gap or relevant change.

**Current testing authorization:** The Test-only authorization and environment boundaries are defined in the plan's [Testing Authorization and Environment Rules](razorpay-custom-checkout.md#testing-authorization-and-environment-rules-3-october-2026). Current count (4 October 2026): 17/24 accepted, A12 N/A, 6/24 deferred, and 0 active. PR #10 remains OPEN/Draft and production release was not performed. Older detailed wording below is historical unless repeated in the current status or register.

## Current Findings Disposition - 4 October 2026

**Purpose and counting rule:** this file is the backlog for defects, contract questions and evidence gaps discovered while executing A01-A24. Findings are not additional acceptance tasks and do not change the A01-A24 denominator. A finding may explain why an A-item remains Partial, but its ID is not itself a completion percentage.

**A-item sequencing rule:** record each finding under the A-item that exposed it using lettered IDs (A01-a, A01-b, A02-a, etc.). Finish the active A-item and every finding needed for that item's acceptance before moving to the next A-item. Do not silently broaden the active scope: unrelated findings are recorded under the relevant A-item and held for the later findings phase. Work those deferred findings one at a time when that phase begins, updating status/evidence immediately after each acceptance check passes. Preserve unresolved items as open; do not mark a batch complete until every in-scope finding is fixed and verified or explicitly dispositioned with evidence.

**Required detail for every new finding:**

| Field | Record |
| --- | --- |
| ID and status | Use the next A-item letter (for example, A01-a) for a finding tied to that task. Keep F-numbers only for existing chronological/cross-cutting history. Record the current state and any provider/activation dependency. |
| Symptom and exact evidence | User-visible/backend symptom, route or source location, revision, timestamp, and reproducible output. Redact credentials, PAN/CVV, OTPs and customer secrets. |
| Impact and scope | Customer/payment/ledger/security effect; affected A-item and C-requirement IDs; explicitly state what is not affected. |
| Bounded remedy | Smallest documented-contract-compliant correction; no guessed provider behavior or unrelated refactor. |
| Acceptance subtasks | `- [ ]` Reproduce/confirm the defect; `- [ ]` implement the bounded correction; `- [ ]` add/run focused regression; `- [ ]` record exact evidence and update this finding. Omit a subtask only with a recorded reason. |
| Dependency/disposition | Razorpay response, merchant activation, supported device, unavailable evidence, or none. F11 and F35 await Razorpay clarification; F46 is deferred after the bounded Test IIN lookup returned 404. |

For a finding required by the active A-item, tick its subtasks as they are verified and close it before advancing to the next A-item. Unrelated findings stay open for the later findings phase. A source edit alone is not completion.

This is a chronological evidence register; the bullets below are the current disposition. Do not read older headings such as “Deferred”, “Current Repair Instruction”, or a dated “pending CI” sentence as today's status without checking this section and the master plan's Current Audited Task Register. Preserve dated evidence, but the newest exact-SHA/runtime evidence controls. Checkboxes in Reviewed Repair Progress mean source work was reviewed; they do not mean the linked A01-A24 acceptance is complete.

**New-finding workflow:** any issue discovered while completing an A01-A24 task goes here under that A-item as an unchecked, lettered subtask with symptom, reproducible evidence, impact/risk, bounded fix, and acceptance criteria. If it affects acceptance or safe completion of the active A-item, resolve and verify it before advancing. Otherwise leave it recorded for the later findings phase; do not interrupt the active task with unrelated repairs. Resolved findings remain checked here with closure evidence; dated failure notes stay historical.

**Finite findings-pass rule:** when A01-A24 reaches a final disposition, freeze the findings present at that point as the complete scope of the later findings pass. Number/count that frozen list, then handle each finding once against its recorded bounded acceptance and test budget. Do not append newly discovered issues to that active pass, reopen closed A-items, or rerun passing checks without a relevant change or contradictory evidence. A new issue found after the freeze is a recommendation for a separately approved, finite follow-up plan. External dependencies receive one bounded verification when evidence arrives; if still unavailable, keep the specific deferral and finish the current finite pass rather than retrying indefinitely.

**Current disposition (4 October 2026):** A01-A08, A13-A17, A19-A21 and A23 are accepted (17/24); A12 is N/A; A09-A11, A18, A22 and A24 are deferred (6/24); no A-item is active. A18-a records the unverified combined capture; A18-b records eight active Home Test Orders, four covering the current ₹142 balance and four tied to already-paid invoices, with no documented cancel/expire operation established. A19-a records a distinct historical outbox row with no terminal stage, while A19's representative current-path provider-accepted and skip outcomes are verified; A22-a records that operational retention/access and deployed-runtime guarantees are unspecified. A20/A21/A23 have exact-HEAD CI evidence from run `37136624270`; no refund, downtime or provider event was sent. A24's open Draft PR at the exact tested SHA has successful CI but requires a separate approved release workflow. A14's compare-and-set repair and focused mocked regression passed locally 13/13; exact-SHA CI run [37156470392](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37156470392) passed both jobs. No new payment, refund, database write, notification, IIN request or WhatsApp send was made in this turn.

**Per-A hard cap and current status:** Previously passing items were not rerun without a gap. A14/F29 is complete within its bounded recovery acceptance: focused mocked regression passed 13/13 locally, and exact-SHA CI run `37156470392` passed both jobs. Current count is 17 accepted, A12 N/A, 6 deferred and 0 active. Deferred dependencies remain in the master register and findings A18-a/A19-a/A22-a; A24 needs separately authorized PR approval/production release gates.

| Finding(s) | Current disposition | What remains |
| --- | --- | --- |
| F01-F02 | Earlier claims superseded: same-order retry source path is implemented; approved Razorpay-hosted artwork mapping is integrated. | Retry lifecycle acceptance remains in A13-A15; active UI artwork review remains in A03/C10. |
| F03-F09 | Source boundaries were repaired or kept explicitly separate as recorded below; no activation is inferred. | A11/A12 activation/lifecycle and A17 delivery acceptance remain Partial/Deferred or upcoming under the current master register. |
| F10, F12-F16, F19-F27, F30-F34, F36-F45 | Bounded source repairs are recorded in Reviewed Repair Progress and Authorized Repair Integration. Older “not repaired” statements are historical. | Relevant runtime/provider/accessibility/recovery portions stay open under the master task register. F17's test fixture edits are not themselves test evidence. |
| F28 | Cleared in the observed local runtime; later local HTTP evidence confirms the registered capabilities route responds. The earlier screenshot was not proof of a missing route. | None for the route symptom; A04 method/runtime readiness is accepted under the finite scope. |
| F29 | Closed under A14; this was an internal source/concurrency defect, not a Razorpay-support deferral. | Compare-and-set repair and focused mocked recovery-race suite passed locally 13/13; exact-SHA CI run [37156470392](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37156470392) passed both jobs. Do not broaden into physical multi-device races. |
| F11, F35 | Deferred pending Razorpay clarification. F11 asks for authoritative EMI processing-fee units/applicability; F35 asks whether/how Custom Checkout provider listeners can be detached. | One bounded review when support evidence arrives; do not block unrelated tasks. |
| F46 | Deferred after one bounded Test IIN lookup returned 404. Support confirmed the 8-digit prefix guidance, but the lookup's 404 cause is not established. Ordinary card checkout remains available through the documented formatter/network gate; issuer/EMI enrichment is not claimed. | Resume only with new endpoint evidence or an available Test lookup; no repeated probes or guessed alternate route. |
| F18, F48, F49, F52, F57-F59, F63-F65 | Active, conditional, or report-only evidence gaps; they are not provider-support dependencies by default. | Follow the finite A01-A24 register. Do not infer unsupported behavior or provider guarantees. |
| F47, F50-F51, F53-F56, F61-F62 | Resolved for the specific defect/contract scope described in their dated entries. | Broader A17/A22/A23 acceptance is not closed by these scoped repairs. |
| F60 | Partially resolved release-control gap. | A24 still needs green exact-SHA CI, review/approval and separately authorized release/migration/post-check gates. |
| F66 | Resolved at source/test SHA `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30`; both exact-SHA CI jobs passed in run [37009102219](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37009102219). | Broader live account readiness/runtime acceptance remains under A04; this scoped CI regression is closed. |
| A18-a | The plan's prior note claimed a matching combined Test provider capture, but it cannot be found in the approved existing local ledger. | Deferred: read-only query verified `localhost` / `hangers_db` and found 0 matching allocations among 21 ₹30 payment records. Its original `created` payment remains unresolved. No replacement combined payment was created. |
| A18-b | Eight Home Test Orders are still active locally; four correspond to the current ₹142 open balance and four to invoices now marked paid. | Deferred pending authoritative order invalidation/recovery guidance: one read-only provider pass found four Orders with attempts and nonterminal `created` payments, plus four `created` Orders with zero attempts. The combined-checkout reservation intentionally blocks rather than risk a second payable order. |
| A19-a | One older processed payment-notification event has no correlated terminal notification result; it is distinct from the later verified current-path event. | Deferred historical-data finding: the old outbox row is `PROCESSED` with zero attempts and only a matching `WHATSAPP_PENDING` stage. A separate current-path capture has a correlated `WHATSAPP_SENT` stage and proves provider acceptance, not handset delivery. No replay or synthetic stage was used. |
| A22-a | Journey logging and redaction have CI evidence, and the local migration is applied, but there is no approved operational retention/access policy or deployed-runtime proof. | Deferred without broadening the finite checkout pass: retain source/CI/local evidence; no retention duration, production access model or logger-failure guarantee is invented. |

## Acceptance-Linked Findings

Keep findings grouped under the A-item that exposed them. These Axx-letter entries are acceptance gaps/subtasks, not extra A-items and not replacements for the chronological F-number history below. Resolve the active A-item and its linked findings before beginning the next A-item. Record later findings under their owning A-item using the next letter.

### A01 Findings

#### A01-a - Successful public checkout path lacks end-to-end acceptance evidence

- **Status:** Resolved; exact-SHA disposable-DB CI passed.
- **Evidence:** `combined-checkout.integration.test.js` now mounts the registered public router, resolves active `ORDER`, `IRON_BILL`, and `INVOICE` shares for `ORDER`, `DAILY_IRON`, and `FIELD_SERVICE` invoices, and calls the create-order endpoint twice with the same idempotency key using a mock Test provider. It asserts amount/currency/order reference, one provider order and attempt per invoice, and no settlement before capture. Test execution is intentionally not run against local `hangers_db`; it must run only in disposable `hangers_test` CI.
- **Impact:** A regression in public route wiring, share-to-invoice binding, or the handoff from the public controller to the checkout service could escape the current A01 CI coverage even though the isolated service and lookup tests pass.
- **Bounded acceptance:** Add and run a Test-only integration case through the registered public HTTP route for active shares across the supported invoice source types. Verify the returned amount/currency and Razorpay order reference, replay the same request without creating a second provider order or checkout attempt, and confirm the invoice remains unpaid until capture. Retain existing expired/revoked/cancelled denials. Use only the disposable CI database (`hangers_test`) and an injected/mock Test provider; never point this case at local `hangers_db` or Live credentials.
- **Acceptance subtasks:**
  - [x] Add coverage for the registered public HTTP route and active share resolution, not only the controller or service directly; exact-SHA CI passed.
  - [x] Add eligible unpaid `ORDER`, `DAILY_IRON`, and `FIELD_SERVICE` invoice cases with source-appropriate share types; exact-SHA CI passed.
  - [x] Add assertions that successful preparation plus same-request replay yields one attempt/provider order and leaves invoice settlement unchanged; exact-SHA CI passed.
  - [x] Run in disposable CI and record exact revision/run; invalid-link and cancelled-source regressions also passed.
- **A01 disposition:** A01-a is complete on exact-SHA CI run `37055637233` (commit `9d1ce4332d8dd411cfbd9f73a611db66bbd273d5`).

#### A01-b - Checkout eligibility does not match cancelled/returned source rules

- **Status:** Resolved; exact-SHA disposable-DB CI passed.
- **Evidence:** `createInvoiceCheckout` now locks linked Order, IronBill, and ServiceAppointment source rows before invoice rows, rejects returned/cancelled/void sources using the same source-specific payment codes, and applies `openInvoiceWhere` to combined checkout revalidation. Public customer outstanding summaries now use that same eligibility predicate. A CI-gated regression in `combined-checkout.integration.test.js` covers a returned order and cancelled field-service appointment through direct service and active public-share route, asserting no provider order, checkout attempt, or inclusion in customer outstanding totals. The test was not executed locally because it writes fixture data; its run must remain confined to the disposable `hangers_test` CI database.
- **Impact:** A customer could complete a provider payment for a returned order or cancelled field-service appointment, after which CRM settlement would reject the payment and require Finance review.
- **Bounded remedy:** Implemented in source: public outstanding selection and checkout reservation now honor `openInvoiceWhere`; source rows are locked consistently before invoice rows; invalid sources are rejected before attempt reservation/provider calls with the existing source-specific error contract.
- **Acceptance subtasks:**
  - [x] Reject a `RETURNED` order and cancelled `FIELD_SERVICE` invoice before provider call or checkout-attempt creation; exact-SHA CI passed.
  - [x] Apply the shared eligibility predicate to combined checkout revalidation and public customer receivables; exact-SHA CI passed.
  - [x] Verify `DAILY_IRON` void invoices remain blocked and combined receivables exclude cancelled/returned/void sources; exact-SHA CI passed.
  - [x] Run focused regressions against the approved disposable CI database; local `hangers_db` was not written.
- **A01 disposition:** A01-b is complete on exact-SHA CI run `37055637233` (commit `9d1ce4332d8dd411cfbd9f73a611db66bbd273d5`).

#### A01-c - New checkout dependency breaks the reservation retry harness before A01 CI runs

- **Status:** Resolved; exact-SHA CI passed.
- **Evidence:** Exact-SHA run [37052327041](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37052327041) passed setup, schema/migration checks, and earlier Razorpay suites, then failed the `Verify bounded Custom Checkout acceptance regressions` step. Four failures in `checkout-concurrency-acceptance.unit.test.js` reported `Unexpected import: ./receivables.service`; the new source dependency was absent from that test's isolated VM dependency map. Workflow sequencing therefore skipped the subsequent database-backed A01 integration step. CRM CI passed.
- **Impact:** A01-a/A01-b cannot be considered verified until the unrelated isolated retry harness loads the service successfully and CI reaches the disposable-DB integration step.
- **Bounded remedy:** Add only the missing `openInvoiceWhere` stub to the VM harness; do not broaden or weaken the retry assertions.
- **Acceptance subtasks:**
  - [x] Reproduce the exact failure from the run log.
  - [x] Add the required isolated dependency stub without enabling database/provider access.
  - [x] Run focused concurrency unit test locally: 5/5 passed without DB/provider access.
  - [x] Rerun exact-SHA disposable-DB CI and record that the A01 integration step executed (run `37055637233`).
  - [x] Confirm the complete A01 integration step passed 6/6 cases.
- **Disposition:** Closed; the dependency-isolated harness and downstream A01 integration run pass.

#### A01-d - Source eligibility integration fixture omitted public legal-terms setting

- **Status:** Resolved; exact-SHA CI passed.
- **Evidence:** Exact-SHA run [37052805385](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37052805385) passed the concurrency retry harness and the active public route test for all three billing sources, then failed `returned orders and cancelled field-service appointments are not payable or included in customer totals`. The public invoice lookup returned HTTP 500 because the isolated disposable database did not contain required `master.legalTerms`. The CRM job passed.
- **Impact:** A01-b's customer receivables exclusion assertion cannot run until the test fixture supplies the required public-site setting; source eligibility assertions before that point pass.
- **Bounded remedy:** Seed the legal-terms setting only when absent in `hangers_test`, then remove it only if the fixture created it, matching the established neighboring fixture pattern.
- **Acceptance subtasks:**
  - [x] Identify the required setting from the CI stack trace and compare with the passing neighboring fixture.
  - [x] Add isolated setup/cleanup preserving any pre-existing CI setting.
  - [x] Rerun focused disposable-DB integration and record exact-SHA results (run `37055637233`; 6/6 passed).
- **Disposition:** Closed as part of A01-b's passing eligibility matrix.

#### A01-e - Historical-unpaid integration fixture leaked CI rows and Test-mode environment

- **Status:** Resolved; cleanup path passed exact-SHA CI.
- **Evidence:** Source review of the CI-passing historical-unpaid test found it created a Home test customer, three source rows/invoices, checkout attempts and payment-journey events; it only changed invoices to VOID and retained the fixtures. It also set `RAZORPAY_KEY_ID` without restoring the previous process value. Those leftovers could affect later tests in the same CI process even though the disposable database is discarded after the workflow.
- **Impact:** Later A01 receivables checks can depend on implicit prior fixture state; a failed assertion can leave additional rows that obscure subsequent failures. The Test-mode environment could leak across tests.
- **Bounded remedy:** Track created source/invoice rows, delete linked journey events and attempts before invoices, remove only fixture-created subscription/customer rows, and restore `RAZORPAY_KEY_ID` in `finally`.
- **Acceptance subtasks:**
  - [x] Confirm the missing cleanup and environment restoration by reviewing the passing test source.
  - [x] Add unconditional, dependency-ordered fixture cleanup and restore the prior environment.
  - [x] Rerun the complete disposable-DB suite and verify A01 tests pass with cleanup (run `37055637233`; 6/6 passed).
- **Disposition:** Closed; fixture cleanup and environment restoration are exercised by the passing CI test.

#### A01-f - Historical checkout mock reused one provider Order ID across source types

- **Status:** Resolved; distinct source IDs passed exact-SHA CI.
- **Evidence:** Exact-SHA run [37053960211](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37053960211) passed the new public-source, cancelled-source, route replay and preceding CI gates, but the historical-unpaid concurrency case failed on a unique `razorpayOrderId` constraint. The mock generated `order_<same-run-suffix>` for each of three source types. Earlier per-loop deletion had hidden this duplicate; A01-e's correct final cleanup made it visible.
- **Impact:** The historical-unpaid all-source regression cannot complete with provider responses that violate Razorpay Order ID uniqueness; this is test fixture behavior, not a production checkout defect.
- **Bounded remedy:** Include the invoice source type in each deterministic mock Order ID while retaining end-of-test cleanup.
- **Acceptance subtasks:**
  - [x] Confirm unique-constraint failure and trace it to the repeated mock ID.
  - [x] Generate distinct mock Order IDs per source type.
  - [x] Rerun the complete disposable-DB suite and confirm the historical concurrency/replay case passes (run `37055637233`; 6/6 passed).
- **Disposition:** Closed; distinct provider-shaped IDs preserve the all-source replay proof.

#### A01-g - Mock Order IDs violated provider identifier shape and were dropped by journey logging

- **Status:** Resolved; bounded alphanumeric mock IDs passed exact-SHA CI.
- **Evidence:** Exact-SHA run [37054429900](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37054429900) failed because A01-f's first correction used extra underscores after the `order_` prefix. Run [37054960450](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37054960450) confirmed the next fixture version still produced `razorpayOrderId: null`: although alphanumeric, `dailyiron` plus the 32-character UUID suffix exceeded the journey logger's 40-character provider-ID payload limit. The public-route fixture ID was already alphanumeric and within bounds.
- **Impact:** A01's journey correlation assertion is not meaningful unless mock provider IDs satisfy the same safe identifier contract expected from Razorpay.
- **Bounded remedy:** Keep distinct IDs but use a one-character source code plus the 32-character UUID suffix, and assert the historical fixture matches `^order_[A-Za-z0-9]{6,40}$`. Keep the public-route shape assertion and do not relax the production logger's allowlist.
- **Acceptance subtasks:**
  - [x] Trace the null journey identifier to mock formatting, not application redaction behavior.
  - [x] Correct mock IDs and add shape assertions; the first correction exceeded the maximum accepted length and was not sufficient.
  - [x] Rerun disposable-DB integration and confirm journey event IDs remain populated (run `37055637233`; 6/6 passed).
- **Disposition:** Closed; the fixture IDs satisfy the production logger's allowlist and journey references remain populated.

**A01 verification status (3 October 2026):** The earlier note calling A01 CI verification blocked by the read-only smoke-check rule was incorrect and is withdrawn. That rule was supplied under “Codex tool update checks”; these are product integration tests, not tool smoke checks. Exact-SHA PR #10 run [37055637233](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37055637233), commit `9d1ce4332d8dd411cfbd9f73a611db66bbd273d5`, passed Backend and CRM. Its disposable `hangers_test` combined-checkout integration passed 6/6, and the other A01-related receivables and journey CI checks passed. A01 and findings A01-a through A01-g are closed. No local or production database was changed. A02 is closed. **Historical execution update (3 October 2026):** Kevin authorized local Test invoice/order creation and Test payment submission using only localhost:5002, existing `hangers_db`, Razorpay Test credentials, and Home / +91 9930367267. This superseded the stale A03 prohibition below. A03 was active at that point; it is now complete within finite scope, and A04 is active per the resumed goal.

## A02 Findings

#### A02-a - Combined Test capture was duplicated across A02 and A18

- **Status:** Resolved by making the A-item boundary explicit.
- **Evidence:** The current register assigned a real combined provider capture to A02, while A18 already explicitly required a combined provider Test capture and provider/fee reconciliation. A dated A02 matrix also repeated a single Netbanking capture already covered by A06. Exact-SHA run [37055637233](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37055637233) passed the bounded A02 total/allocation/refresh evidence: the combined `hangers_test` integration covers a ₹5,880 allocation split into ₹2,680 and ₹3,200, atomic settlement, zero balances, paid status, invoice history, refreshed public status and idempotent replay; the browser case covers the combined total, one remaining invoice, simulated success, refresh and reload.
- **Impact:** Without an explicit boundary, A02 and A18 could prompt duplicate payment attempts for the same behavior and make progress counts misleading.
- **Bounded remedy:** A02 owns customer totals, one-remaining-invoice and zero-balance presentation, mock/integration allocation, and refresh behavior. A06 owns provider-backed single-payment acceptance. A18 owns the one actual combined provider capture plus its combined provider/CRM reconciliation and fee contract. No duplicate Test payment is needed to close A02.
- **Acceptance subtasks:**
  - [x] Compare A02 and A18 acceptance criteria and identify the duplicate combined-provider gate.
  - [x] Assign provider-backed single-payment success/refresh to A06 and the single combined-provider capture to A18.
  - [x] Confirm A02's remaining total/allocation/refresh cases pass on exact-SHA CI run `37055637233`.
  - [x] Update both current and detailed A02 plan rows to remove the duplicate provider-payment gate.
- **Disposition:** A02 is complete. A18 retains its separate combined provider acceptance; do not repeat that transaction under A02.

## A03 Findings

#### A03-a - VoiceOver announcements and focus continuity lack manual acceptance

- **Status:** Deferred accessibility follow-up by user direction on 3 October 2026; not a functional checkout or public-page responsiveness gate. Source now moves keyboard focus to the captured/review heading when the payment form is replaced.
- **Evidence:** Source inspection confirms labelled form controls, a `fieldset`/`legend` payment-method group, `aria-invalid`/`aria-describedby` field errors, visible focus styling, and status/alert roles. Browser regressions now assert focus lands on the captured receipt heading and on the pending-review heading when the flow transitions. These newly edited browser assertions have not been executed in this continuation. Existing Kevin Chrome evidence is an accessibility-tree inspection, not a VoiceOver session; it does not prove what a screen-reader user hears when methods load, an error/retry appears, the checkout changes to pending, or capture confirmation replaces the form. An active local Test checkout for the approved Home customer is recorded; status and payment methods rendered after A03-c's local schema repair.
- **Impact:** A screen-reader user may miss a dynamic payment-state change or lose their place when the form is replaced, despite correct static labels and automated DOM assertions.
- **Bounded acceptance:** Use a valid local Test checkout in Kevin's Chrome profile. If no active fixture exists, create a small local Test invoice/order for Home using the approved test number only. Use macOS VoiceOver to traverse the heading/progress, invoice and amount summary, payment-method group, required fields, primary action, error/retry state, pending/status action, and captured confirmation when available. A Test payment may be submitted only if needed to exercise the captured state and only after confirming Test mode. Record observed announcements and focus destinations; DOM accessibility-tree output alone is not VoiceOver evidence. Do not send WhatsApp/email or use another customer/number. Revoke any newly created public test share after acceptance; retain payment/ledger records for audit.
- **Acceptance subtasks:**
  - [x] Open an active local Test checkout for Home; create the smallest practical local fixture only if no valid checkout already exists. The active fixture is `HCS-1292` / `INV-001645`, ₹100, unpaid; no payment submitted.
  - [x] Move keyboard focus to the captured receipt or unresolved-payment heading when the payment form is replaced; add focused regression assertions. Execution of those browser assertions remains unverified here.
  - [ ] Record VoiceOver announcements and focus continuity for the available required states.
  - [ ] Fix only a reproduced A03 accessibility defect and run its focused regression once; otherwise record the observed pass and close this finding.
- **Current-session check (3 October 2026):** The current browser inventory exposes Chrome under the Afleo Logistics profile, not the required Kevin profile. The Codex in-app browser tab inventory is empty, and the Browser Use Node REPL execution tool is not exposed in this session. I did not access another profile, open a new browser runtime, or claim VoiceOver acceptance. The two focused checkout unit files pass 17/17, but they do not substitute for the screen-reader pass.
- **Disposition:** Keep this finding documented for a separately prioritized accessibility pass. Do not spend the active A03 acceptance cycle on manual VoiceOver or use it to block public invoice/checkout responsiveness or A03-i functional recovery.

#### A03-b - Active-form zoom, reflow and contrast are not verified at the written level

- **Status:** Public invoice/checkout responsive acceptance is complete; rendered disabled/focus contrast is deferred accessibility follow-up by user direction on 3 October 2026.
- **Evidence:** CI checks no horizontal overflow at 320/720/1440 CSS-pixel viewports, active payment-method visibility and keyboard selection. A 720px viewport is not a browser-zoom test. On 3 Oct, the active form was visually inspected in Kevin Chrome at 200% browser zoom and at a 320 CSS-pixel responsive viewport. The heading, order/invoice references, payment options, selected outline and visible card fields reflowed vertically; no horizontal clipping/scroll was visible in either inspected viewport. The 320px inspection was an emulated responsive viewport; it does not replace a physical-device pass. A source-level cascade-aware contrast regression measures effective normal, selected, warning and error text/background pairs. Further source review found disabled primary actions and UPI app choices were faded with opacity; white text on the disabled primary action composited to about 4.2:1 against white, below this plan's 4.5:1 target. The opacity was removed while retaining the disabled cursor. Source assertions now check disabled-state declarations and focus-indicator contrast; rendered-browser disabled/focus contrast remains unmeasured.
- **Impact:** A customer using magnification or needing higher contrast could encounter clipped fields/actions or unreadable active-form content even though the paid/pending and narrow-viewport cases pass.
- **Bounded acceptance:** Public invoice/checkout reflow is the completed A03 responsive criterion: the public-page suite covers 320, 390, 768 and 1440 CSS-pixel widths, with recorded local inspection at 320 CSS pixels and 200% zoom and no horizontal clipping. Internal CRM screens are not part of this acceptance. Rendered disabled/focus contrast may be revisited only in a separately prioritized accessibility pass. Merchant header branding remains in A03; payment-network artwork belongs to A05/C10 and performance to A23.
- **Acceptance subtasks:**
  - [x] Open the Home local Test checkout (create a local fixture only if no valid checkout exists). The active fixture is `HCS-1292` / `INV-001645`, ₹100, unpaid.
  - [x] Record active-form reflow and visible controls at 200% browser zoom and 320 CSS-pixel responsive width; no horizontal clipping/scroll was visible in the observed screenshots.
  - [x] Add a cascade-aware source regression for normal/helper/reference text, selected rows, warning banners and errors; all tested pairs meet 4.5:1 (`checkout-page.unit.mjs`, 11/11 passed). No actual color defect remained after later CSS overrides were considered.
  - [x] Remove opacity fading from disabled payment buttons and UPI app choices; add source regressions requiring disabled text contrast >=4.5:1 and focus-indicator contrast >=3:1.
  - [ ] (Deferred accessibility follow-up) Inspect rendered disabled and focus states in Kevin Chrome; source-level contrast is not a rendered-page measurement.
  - [x] Review the reported normal/error/selected token pairs and keep the effective design unchanged because the rendered-cascade source values pass; retain the earlier colors only as overridden declarations.
- **Current-session check (3 October 2026):** Source-level contrast and disabled-state tests pass as part of the 17/17 focused checkout unit run. Rendered disabled/focus contrast was not inspected and is explicitly deferred; it is not a blocker to the public-page responsive criterion or A03-i functional acceptance.
- **Disposition:** Public invoice/checkout responsive acceptance is complete. Keep only rendered disabled/focus contrast in this finding for the separately prioritized accessibility pass.

#### A03-c - Local checkout status API failed against an unapplied existing migration

- **Status:** Resolved locally on 3 October 2026.
- **Evidence:** The new Home Test invoice showed “Could not check payment status” and no payment methods. The public status API returned HTTP 500 `CHECKOUT_STATUS_CHECK_FAILED`. A direct read-only Prisma query isolated `P2022`: `razorpay_checkout_attempts.paymentJourneyId` was absent from the existing local `hangers_db`. `npx prisma migrate status` showed exactly one pending migration, `20261002120000_razorpay_payment_journey_events`. Reviewed SQL contained only an additive nullable column/index and creation of the payment-journey events table/indexes. Applied the existing migration using `npx prisma migrate deploy` to `localhost:5432/hangers_db`. The same invoice then returned status HTTP 200 (`NONE`), Test methods capabilities HTTP 200, and Chrome displayed payment choices plus the Razorpay order reference. Payment was not submitted.
- **Impact:** A valid new invoice appeared unpayable because the backend failed before it could read checkout-attempt state; the generic error obscured the local schema mismatch.
- **Bounded remedy:** The intended migration is applied to the explicitly authorized existing local database. Keep it applied; do not mask the schema exception or change production. Confirm status/method routes and the same checkout UI after local backend restart/reload.
- **Acceptance subtasks:**
  - [x] Identify the exact Prisma error and verify the target is the existing local `hangers_db`.
  - [x] Apply only the already-reviewed pending additive migration to local `hangers_db`.
  - [x] Verify the same invoice's status and methods endpoints and the visible local payment choices.
  - [x] Verify Razorpay downtime `RAZORPAY_ACCOUNT_UNVERIFIED` is a separate warning-only condition and does not hide payment methods.
- **Disposition:** Closed for local schema/status recovery. Do not count it as a source-code fix or as closure of A03-a/A03-b. No production database, Live settings, or payment submission was touched.

#### A03-d - Downtime availability warning repeated because API read incorrectly required an account ID

- **Status:** Resolved locally on 3 October 2026.
- **Evidence:** The checkout displayed “Current availability for this payment instrument could not be confirmed” on every load/refresh. The response reason was `RAZORPAY_ACCOUNT_UNVERIFIED`. Inspection isolated the gate in `razorpay-checkout-account.service.js`: the downtime snapshot used the shared account-binding resolver, which required `RAZORPAY_ACCOUNT_ID_TEST`. The local backend `.env` has no account ID set. Razorpay's [Payment Downtime API](https://razorpay.com/docs/api/payments/downtime/fetch-all/) documents `GET /v1/payments/downtimes` authenticated with the merchant API key ID and secret and has no account-ID request parameter; credentials scope the read. That account-ID requirement was therefore an application-level misconfiguration, not a Razorpay outage. The generic warning was warning-only and did not block methods, but it repeated because no provider snapshot was fetched.
- **Impact:** Customers repeatedly saw an availability warning despite configured Test API credentials, while testing could falsely interpret it as a method failure.
- **Fix:** Added a downtime-API context that verifies active custom-checkout mode and uses the active API credentials/cache key without requiring `RAZORPAY_ACCOUNT_ID_TEST`. Kept strict configured account and mode checks for downtime webhook reconciliation and the separate bank-transfer flow. At this stage, unknown/outage warnings were not suppressed; A03-e separately records the later customer-UI noise fix.
- **Acceptance subtasks:**
  - [x] Add a regression that fetches a fresh provider snapshot with valid Test credentials and no configured Test account ID.
  - [x] Preserve strict wrong-account webhook rejection and run focused downtime tests: 14/14 passed.
  - [x] Run focused downtime tests: 14/14 pass; the actual Razorpay Test API returns HTTP-success-equivalent `fresh`, with no `RAZORPAY_ACCOUNT_UNVERIFIED` reason.
  - [x] Verify the localhost public downtime route returns HTTP 200 and a fresh Test snapshot with no reason code; its temporary Home Test share was revoked immediately afterward.
- **Disposition:** The unnecessary account-ID gate is removed only from this documented read path. Strict account/mode binding remains on webhook and bank-transfer paths. This closes A03-d; it does not claim every specific UPI instrument can always be matched or clear the separate A03-e warning behavior.

#### A03-e - UPI handle-specific downtime cannot be attributed to an intent app without documented mapping

- **Status:** Resolved as warning-only, evidence-based behavior on 3 October 2026; no payment method is blocked.
- **Evidence:** After A03-d, a fresh Razorpay Test Downtime API response contained four `started`, `high` severity UPI incidents whose only instrument constraint was `vpa_handle`. The checkout’s available UPI Intent choices come from Razorpay.js `getSupportedUpiIntentApps()` and are passed to `createPayment` as the `app` option. Razorpay's [Downtime API](https://razorpay.com/docs/api/payments/downtime/fetch-all/) describes VPA-handle-scoped incidents; its [UPI Intent guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/) supplies app identifiers and Intent initiation, but does not document an equivalence between those app identifiers and a customer's VPA handle. No user VPA is available to the checkout for Intent. Therefore the matcher correctly returns `unknown` rather than guessing a match or declaring the selected method healthy.
- **Impact:** The backend cannot truthfully attribute those handle-specific incidents to an app-only UPI selection. The checkout does not translate the app ID into a VPA or treat unknown attribution as a customer-facing error.
- **Acceptance subtasks:**
  - [x] Keep unknown provider attribution in the internal response; do not map UPI app IDs to VPA handles without an explicit Razorpay contract.
  - [x] Suppress generic unknown/stale availability notices in customer UI; retain only a fresh, exact provider-matched disruption notice.
  - [x] Regression asserts unknown availability does not add the prior generic banner and returned card methods remain selectable.
  - [x] Verify the real Test downtime snapshot is fresh and the public route returns the incidents without a configuration reason. No payment was submitted.
- **Disposition:** Closed for A03. Unknown attribution remains truthful in the backend but is not surfaced as a generic checkout error; methods remain usable. Instrument-level mapping remains governed by F21/provider documentation and does not prevent checkout QA.

#### A03-f - Methods REST lookup and SDK ready cross-check hid every method on availability mismatches

- **Status:** Source repair and focused browser regression complete on 3 October 2026; exact-SHA CI remains pending under A04.
- **Evidence:** The public capabilities route previously required a successful server-side `/v1/methods` request before returning the key/configuration needed to initialize Razorpay.js. The browser then rejected the SDK's `ready` inventory if a second REST inventory differed, rendering no methods. The server lookup is now best-effort and the SDK inventory is authoritative. The earlier claim that Razorpay documents a generic method fallback at timeout was incorrect and is withdrawn below.
- **Impact:** A transient server method-list outage or inventory mismatch could prevent a validated invoice from bootstrapping the Razorpay SDK.
- **Fix:** Public capability bootstrap preserves invoice, mode, key and merchant configuration when optional server method lookup fails and records only a sanitized warning. Razorpay.js `ready` is authoritative and is not rejected by the separate REST inventory. If no authoritative method list arrives within five seconds, the checkout shows one retryable methods-unavailable message, no payment choices and no Pay action. Confirmed payment-review/duplicate-payment safeguards are unchanged.
- **Acceptance subtasks:**
  - [x] Add a backend unit regression proving a transient `/v1/methods` transport failure still returns a Test bootstrap without leaking the transport message.
  - [x] Run `node --test tests/razorpay-custom-capabilities.unit.test.js tests/razorpay-downtime.unit.test.js`: 19/19 passed.
  - [x] Remove the cross-inventory mismatch gate and make retries reinitialize the provider SDK rather than repeat the failed REST request.
  - [x] Update the existing localhost:5002 browser regression for the REST methods outage, safe timeout state, retry and replacement by later `ready.methods`.
  - [x] Execute the focused browser case against the existing local Home Test invoice; no payment or second order was created.
- **Disposition:** Closed for source and local focused browser acceptance. Exact-SHA CI remains A04's next gate. This does not weaken real invoice lookup, payment-status review, provider mode, or account configuration errors.

**Contract correction (3 October 2026):** The earlier claimed documented generic card/UPI/netbanking fallback is withdrawn. Razorpay's [Custom Checkout build guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/build-integration) says to render activated methods from the SDK `ready` response and requires an actual bank code for Netbanking; it does not specify that generic timeout fallback. The server-side Methods API remains best-effort for bootstrap, but when SDK `ready.methods` is also unavailable the customer sees no choices or Pay action and gets a method-retry action. A04-c records this implementation and its passing current-worktree browser regression.

#### A03-g - Transient status reads could turn a payable invoice into false payment review

- **Status:** Source repair and focused local browser regression passed on 3 October 2026; broader accessibility acceptance remains open.
- **Evidence:** `CustomCheckoutFlow` treated any failed status refresh as `providerLookupUnavailable`. The review banner condition also accepted that flag without requiring a server-identified checkout attempt. A previously known `NONE` invoice could therefore display “Payment status under review” and disable payment after a temporary read failure, even though no payment attempt existed.
- **Impact:** A transient status endpoint/network failure could falsely tell a customer that money may have been taken and block payment on an otherwise payable invoice. Hiding that state after order creation would be unsafe because a create-order response can be lost while the provider order exists.
- **Fix:** Read-only status/capability requests now retry once after a 300 ms delay only for transport/5xx failures, while respecting offline state, 4xx responses and `Retry-After` throttling. Payment review now requires a server-returned attempt ID and an unresolved state; a bare status-read failure cannot fabricate an attempt. Beginning order creation invalidates the old `NONE` snapshot immediately, preserving the duplicate-payment guard if the order request or response is ambiguous. A successfully confirmed terminal capture still wins over later stale reads.
- **Acceptance subtasks:**
  - [x] Add the one-retry boundary for transient GET failures; do not automatically retry 4xx/429 or payment-mutating requests.
  - [x] Require an identified unresolved attempt before rendering the payment-review notice.
  - [x] Mark the prior empty state stale before create-order and keep ambiguous order creation in recovery.
  - [x] Add a focused mocked regression: first status GET returns transient 503, retry returns `NONE`, and the payable checkout remains available without a false review notice.
  - [x] Execute the transient-status recovery browser case against the existing local Home invoice and Kevin Chrome profile; no payment was submitted.
- **Disposition:** The repair is shared by every invoice/service and does not rely on order type. Do not expand into unrelated test methods or silently bypass confirmed pending attempts, invalid shares, merchant configuration errors or Razorpay's actual disabled-method response.

#### A03-h - Duplicate cream alerts and raw route errors obscured the real checkout state

- **Status:** Shared source fix and invalid-link/missing-route browser regressions passed locally on 3 October 2026.
- **Evidence:** Checkout initialization runs independent capabilities and status requests. When both failed, customers could see implementation-level route text or conflicting errors; the old error path could also leave ambiguous payment-review UI even when the server explicitly returned `INVOICE_NOT_FOUND`. This applied to the common checkout component, not a specific service/invoice.
- **Impact:** Customers saw confusing duplicate alerts such as “Invoice not found” beside a route error, could not tell whether the invoice link or payment status was at fault, and could be led to believe a payment was under review when no attempt was identified.
- **Fix:** Centralized checkout request messaging in `CustomCheckoutFlow`. A server-coded `INVOICE_NOT_FOUND` now hides payment methods and pending-review presentation, clears stale client checkout state, and shows one link-unavailable alert with a return-to-invoice action. Generic missing-route, transport and server failures no longer expose API paths or raw route diagnostics; they show one concise, retryable status/method message. A payment-review notice still requires a server-identified unresolved attempt. Other structured application/provider errors remain available through their existing sanitized detail path.
- **Acceptance subtasks:**
  - [x] Map `INVOICE_NOT_FOUND` to a single non-payable link state with a back-to-invoice action.
  - [x] Map generic missing-route/5xx/transport errors to concise retry guidance without exposing raw URLs.
  - [x] Ensure no false pending-review notice is shown without an identified unresolved attempt.
  - [x] Add mocked browser regressions for invalid/revoked-style invoice lookup and missing checkout API route, asserting exactly one actionable alert.
  - [x] Execute both focused browser regressions against the existing localhost:5002 setup; each shows one actionable error without raw route leakage. No payment was submitted.
- **Disposition:** Source repair is shared across all invoice source types and customer-outstanding checkout. It does not make invalid/revoked links payable or suppress genuine payment/configuration errors. A03 remains active until its bounded A03-a/A03-b browser/manual checks are completed or explicitly deferred.

#### A03-i - Refreshed invoice links deadlocked untouched Razorpay orders

- **Status:** Closed on 3 October 2026; same-order recovery passed a database-backed integration test in the existing local database.
- **Evidence:** Read-only reconciliation of existing Home Test fixtures found current valid invoice shares whose invoice-wide active attempt was created with a different, older share. The status endpoint returned `PENDING` with no attempt ID before asking Razorpay, while order creation refused same-invoice reuse because the share token changed. Provider reads distinguished untouched orders (`created`, zero attempts, zero payments) from genuinely unresolved attempts (for example, provider payment `created` and order `attempted`).
- **Impact:** A renewed invoice link could be permanently unable to pay even when Razorpay confirms no payment had been attempted. Conversely, simply allowing every cross-share retry could create duplicate charges or settle another invoice.
- **Fix:** A valid invoice share for the same invoice can now resolve the invoice-wide single-invoice attempt and run the existing strict Razorpay order/payment/balance/mode binding checks. If Razorpay confirms the original order is untouched, checkout reuses that exact order; it never creates a second order for this recovery. If Razorpay shows any nonterminal payment, provider lookup fails, the attempt is combined/customer-scoped, or bindings/balance/mode do not match, checkout remains blocked with the existing attempt references. Callback settlement is bound to the server-resolved invoice and the provider order's persisted CRM attempt/share notes, rather than requiring the customer's currently valid share token to equal the older token recorded when the same invoice order was created.
- **Acceptance subtasks:**
  - [x] Recover the invoice-wide single-invoice attempt when a valid renewed invoice link has no attempt bound to its own share.
  - [x] Permit same-invoice order reuse across a renewed share only through the existing strict provider-evidence gate.
  - [x] Keep callback settlement invoice-bound and preserve provider order/attempt/original-share binding checks.
  - [x] Add mocked status regressions for provider-confirmed untouched and genuinely attempted/pending provider states; adapt callback binding regression.
  - [x] Run focused mocked backend status/resume/callback regressions (27/27), CRM checkout/error unit regressions (18/18), backend TypeScript, CRM TypeScript, and `git diff --check`; no Live calls.
  - [x] Run the focused database integration case against the existing local `hangers_db`; no Live calls. `Razorpay checkout resumes the same unpaid Order from a refreshed valid invoice link` passed 1/1. It created an old and refreshed invoice share, reused the identical Test-mode stub provider order with one create call, rejected settlement to a different invoice, and settled only the expected invoice using a stubbed capture. The integration `after` hook removed the generated fixture records.
  - [x] Verify the shared customer-visible same-order recovery on localhost using the existing Home Test invoice; no payment was submitted.
- **Current-session check (3 October 2026):** `RUN_DB_INTEGRATION=1 node --test --test-name-pattern='Razorpay checkout resumes the same unpaid Order from a refreshed valid invoice link' tests/order-workflow.integration.test.js` passed 1/1 against the verified existing `localhost` / `hangers_db` / Test-key configuration. The integration used a stub provider, not Razorpay network calls. Its cleanup hook completed, including removal of generated invoices, orders, shares, attempts, payment/receipt rows, and test staff/customer/service fixtures. No real Test or Live payment was submitted.
- **Disposition:** Applies to all service invoice source types because they share the same public invoice checkout controller. It does not bypass actual provider errors, unknown status, revoked shares, configuration faults, attempted/created payments, or combined-payment scope. This in-scope A03 functional recovery finding is closed; A03-a/A03-b remain explicitly deferred accessibility follow-ups.

#### A03-j - One endpoint cooldown could suppress independent payment-status recovery

- **Status:** Resolved in the shared checkout client on 3 October 2026; local focused verification passed.
- **Evidence:** `checkoutRequest` keyed its in-memory 429 cooldown only by API origin. A throttled capabilities or order-creation request could therefore make a separate status request fail locally without reaching the API, even though status reconciliation is the evidence needed after an uncertain order-creation response. This could turn a temporary limit on one operation into a checkout-wide false dead end.
- **Impact:** The customer could see generic status-unavailable guidance and remain blocked from checking an existing Razorpay order. Clearing the cooldown globally would be unsafe because it could bypass a legitimate retry gate for the throttled operation.
- **Fix:** Scope the client cooldown by origin, request path and HTTP method. A forced status check can bypass the shared UI backoff guard, while the status endpoint's own server response and per-endpoint client cooldown still apply. New payment submission remains blocked until its relevant retry gate clears and the provider state is known.
- **Acceptance subtasks:**
  - [x] Add a regression where capabilities returns 429, status still reaches the API, and another capabilities retry remains held by its retry window.
  - [x] Run checkout error/recovery unit tests (6/6), CRM TypeScript, and `git diff --check`.
  - [x] Run focused local browser regressions for invalid-link handling, missing-route messaging, transient status recovery, and same-order reuse after a provider-confirmed untouched order (4/4; Home Test invoice, ₹100; no payment submission).
- **Disposition:** Shared across every supported invoice/service and outstanding-link checkout. It does not change server-side rate limits, suppress a genuine 429, bypass unresolved payment state, or enable another charge while payment status is uncertain.

#### A03-k - Runtime status and order-preparation errors lack correlated CRM diagnostics

- **Status:** Resolved locally on 3 October 2026; the same-order recovery now passes.
- **Evidence:** On the existing Home Test checkout for HCS-1292 / INV-001645, the browser displayed both “Payment status could not be checked” and “Secure checkout could not be confirmed.” The payment journey shows a ₹100 TEST order in CREATED with no payment ID. Activity history records Razorpay confirming the same order as `created`, with zero attempts and an empty payment list (`RAZORPAY_UNATTEMPTED_CHECKOUT_RESUMABLE`), followed shortly by `RAZORPAY_ORDER_CREATE_FAILED`. The exact source cause is a controller `ReferenceError`: `createPublicRazorpayOrder` invokes `assertCustomMode()` for every `checkoutIntegration: CUSTOM` request, but the controller omitted its import from `razorpay-custom-capabilities.service`. This fails before invoice resolution and before safe same-order reuse; it is independent of invoice type or customer. The status warning is separately being checked against current local runtime after this repair.
- **Impact:** Support and engineering cannot distinguish a CRM binding/configuration exception from a genuine transient provider transport failure. The customer may see a stale or duplicated warning even after status recovery succeeds.
- **Bounded fix and acceptance:** Import the documented local `assertCustomMode` helper, retain the safe request/error correlation added to preparation and status failure logs, then use one Retry action on this same untouched Home Test order. Verify status and secure order preparation reuse the existing order, the customer-facing errors clear, and Razorpay still reports zero payment attempts. Do not submit payment or create another provider order. Stop after this reproduction and one targeted correction; unrelated discoveries go to the later findings pass.
- **Acceptance subtasks:**
  - [x] Record the mismatch between provider-confirmed untouched/reusable order and the visible checkout errors; confirm no payment was submitted.
  - [x] Add safe request/error correlation to preparation and unexpected status failures.
  - [x] Identify the shared `ReferenceError` caused by the missing `assertCustomMode` import; this explains the order-create failure before invoice resolution.
  - [x] Import the existing mode-validation helper and add safe application-error correlation for create/status failures.
  - [x] Restart only the existing localhost API and execute one same-order recovery attempt; the user-visible status/prepare errors cleared, the existing order reference remained visible, and payment methods rendered.
  - [x] Confirm the CRM logged `RAZORPAY_ORDER_CREATED` with `reused: true`; the database has one CREATED TEST attempt for ₹100 and no payment ID. No second provider order or payment was created/submitted.
- **Disposition:** The missing helper import was a checkout-wide server bug. All invoice-source flows using Custom Checkout now reach mode validation and same-order reuse. A03-k is closed; this does not close A03-a/A03-b or A03-i's separate disposable-DB acceptance.
- **Environment:** Existing localhost:5002, API localhost:5001, existing `hangers_db`, Kevin Chrome profile, Home / +91 9930367267, Razorpay Test mode only.

## A04 Findings

#### A04-a - SDK listener detachment cannot be implemented without a documented provider contract

- **Status:** Deferred for this finite checkout goal; F35 remains a provider-lifecycle follow-up, not a customer payment-path blocker.
- **Evidence:** `RazorpayCustomCheckout.tsx` registers `payment.success`, `payment.error`, and one-time `ready` listeners. Cleanup clears the mounted callbacks and ready timer, making late callbacks inert, but does not detach provider listeners. The reviewed Custom Checkout documentation establishes `on`/`once` registration but does not establish an `off`, `removeListener`, or `destroy` API. F35 records the existing support clarification request; no supported detach method is evidenced.
- **Impact:** Full listener teardown across retry/reinitialization cannot be claimed. Inventing an unverified teardown call could break payment callbacks or SDK compatibility.
- **Bounded remedy:** Wait for the existing F35 support answer. If Razorpay identifies a supported detach contract, implement only that contract and add one focused unmount/reinitialization regression. If no detach API exists, document the provider limit and close only after the existing mounted-guard behavior is verified as the supported lifecycle; do not keep re-querying the same docs or repeating passing mocks.
- **Acceptance subtasks:**
  - [x] Review current SDK source and official docs; confirm no detach API is documented in the reviewed contract.
  - [ ] Record Razorpay's answer to F35 or an official documentation change.
  - [ ] Apply the documented lifecycle remedy, or record the supported limitation and its bounded acceptance evidence.
  - [ ] Run one focused listener-lifecycle regression after any source change and update the A04 register.
- **Dependency/disposition:** Razorpay support response F35. The read-only Test Methods API account check succeeded on 3 Oct 2026; availability discovery is not blocked. Do not implement guessed `off`/`destroy` methods.

#### A04-b - SDK script-load failure recovery has no dedicated browser regression

- **Status:** Complete.
- **Evidence:** `loadCustomSdk()` removes a failed script, clears the cached rejected promise and rejects with retry guidance. The existing browser regression covers a loaded SDK that times out before returning `ready`, then recovers on retry; no test explicitly aborts the SDK script request and proves that a later retry succeeds. Source behavior therefore lacks the written failure/retry acceptance proof.
- **Impact:** A regression in script error handling or cached-promise reset could leave checkout permanently unavailable after a transient network failure, even when the separate readiness-timeout test passes.
- **Bounded remedy:** Extend the existing mocked A04 readiness/retry browser case: abort the first intercepted SDK script load, assert payment choices and Pay remain absent with the load error, retry into a mocked SDK readiness timeout, then retry after a ready event is enabled. Assert the SDK script is requested only as needed, methods return, and no verification or payment call occurs. Use only mocked API/SDK responses; do not create another test server, invoice, order or payment.
- **Acceptance subtasks:**
  - [x] Confirm current SDK source resets its failed script promise and supports retry.
  - [x] Add assertions for script-load failure, fail-closed methods, retry and eventual ready methods; Playwright discovery lists the full 25-case CI file.
  - [x] Run exact-SHA CI once and record the result; do not rerun passing suites absent a change/new failure.
- **Dependency/disposition:** None for the mocked regression. Razorpay listener-detachment question F35 remains separately deferred under A04-a.

**Closure evidence (3 October 2026):** Exact-SHA PR #10 CI run [37061229353](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37061229353), commit `b3807d39f0bb284a99d09534f95d260ac422878a`, passed Backend and CRM. The CRM responsive UI job passed the full 25-case browser file, including the new aborted-SDK-script, fail-closed, retry-through-readiness-timeout, and eventual-ready recovery assertions. No live/test payment or local database mutation occurred. This closes A04-b; it does not close A04-a/F35.

#### A04-c - Methods API outage must not invent unconfirmed payment choices

- **Status:** Closed for this finite acceptance item; provider listener detachment remains deferred separately under A04-a/F35.
- **Symptom/scope:** Optional backend Methods API discovery previously prevented checkout bootstrap if the read failed. Preserving bootstrap is correct, but an SDK `ready` timeout cannot safely enable methods that have not been confirmed for this Razorpay account. A bare `netbanking: true` also cannot produce a usable bank choice because Razorpay requires a returned bank code. This is shared public invoice/checkout behavior across services.
- **Razorpay contract:** The [Custom Checkout build guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/build-integration) says to display only activated methods and demonstrates `ready.methods` as the SDK inventory. Its documented Netbanking payment data requires a bank code fetched from the available-methods response. The reviewed official pages do not define a generic card/UPI/netbanking fallback for a `ready` timeout. Therefore no choices or Pay action are shown until an authoritative method list arrives.
- **Bounded implementation/evidence:** `getCustomCheckoutBootstrap()` catches a Methods API lookup failure, logs only a sanitized code, and returns validated mode/key/configuration with `methods: null`; SDK readiness remains authoritative. If readiness takes five seconds or longer, checkout presents one methods-unavailable message and `Retry payment methods`, with no radio choice or Pay button. Retrying reinitializes the SDK; fresh `ready.methods` populates only returned options. Backend capability tests pass 8/8; checkout page/error units pass 17/17. Focused current-worktree Playwright regression passed 1/1 on the local Home Test invoice with mocked SDK/payment endpoints. Kevin Chrome on desktop separately recovered to account-enabled methods after reload; the existing Test order remained attached and no payment or duplicate order was created.
- **Acceptance subtasks:**
  - [x] Verify the current official method-inventory and Netbanking bank-code contract; withdraw the unsupported generic fallback claim.
  - [x] Verify backend discovery failure returns server-validated bootstrap and excludes raw transport details from diagnostics.
  - [x] Run focused backend/checkout unit tests and backend/CRM TypeScript checks.
  - [x] Verify timeout, retry and recovered SDK readiness in one focused local browser test; no payment or second order was submitted.
  - [x] Verify public checkout in Kevin Chrome at desktop size; revoke only the temporary QA share created for this check.
- **CI evidence and correction:** Run `37133308925` passed Backend, CRM type-check and build; 24/26 CRM browser cases passed. The two failures were stale harness assertions, not evidence of a payment-path defect: the missing-invoice mocks lacked `INVOICE_NOT_FOUND`, and the SDK-readiness case expected a generic methods fallback and obsolete retry label. Exact-SHA run `37134808948` then passed Backend, CRM type-check/build, and all 26/26 browser cases. No payment or local database mutation occurred.
- **Disposition:** A04-c's availability behavior is accepted. Under the active finite scope, A04 is complete; unresolved F35 remains a deferred provider-lifecycle follow-up. Do not rerun the passing suite. A05 was subsequently accepted under the active goal's narrower card-method scope; A07 is now active.

#### A04-d - CI browser fixtures still encode withdrawn checkout behavior

- **Status:** Closed.
- **Evidence:** Exact-SHA PR #10 run [37133308925](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37133308925) passed Backend, CRM type-check/build and 24/26 browser cases. The missing-invoice case expected raw `Invoice not found` although its mock omitted the production `INVOICE_NOT_FOUND` code. The readiness case still expected a guessed methods fallback and a removed `Retry secure checkout` button. These failures identify outdated mock/assertion contracts; they do not demonstrate that the current UI exposes unconfirmed methods or blocks a valid invoice.
- **Impact:** Leaving the assertions stale would keep the exact-SHA browser gate red and could reintroduce the unsupported assumption that methods may be shown without SDK confirmation.
- **Bounded remedy:** Update only the two existing CI cases: make the missing-invoice mock return the provider/application code and assert the single customer-safe unavailable-link state; change the SDK case to cover script-load retry, no methods/Pay during the readiness timeout, and display of only `ready.methods` after the explicit retry. No app/API implementation, payment data, provider call, fixture order or extra server is needed.
- **Acceptance subtasks:**
  - [x] Read the exact failed assertions from run `37133308925`; confirm 24 other browser cases and both backend/build jobs passed.
  - [x] Correct the invoice error fixture/assertion and remove the undocumented fallback expectation from the readiness case.
  - [x] Confirm exact-SHA run `37134808948` passes both jobs and all 26 combined-checkout browser cases.
- **Disposition:** The two stale fixture/assertion defects are closed after one bounded test-only repair cycle plus a selector-only correction; product code was unchanged during those corrections. Do not rerun passing suites absent relevant changes. This 3 October note previously kept A05 Partial because of F46; the 4 October active finite goal accepts ordinary card checkout and defers optional IIN enrichment. A07 follows.

**Prior exact-SHA source reconciliation:** HEAD `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30` ran as Actions run [37009102219](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37009102219); Backend and CRM both succeeded. Its 25 browser cases covered readiness timeout/retry but not script-load failure; that gap is now closed by A04-b above. F66 is resolved for that prior regression. Earlier red run [37004349213](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37004349213) is retained as historical evidence. F65's former “outbox CI pending” statement is superseded: the disposable-DB journey/webhook/outbox integration passed in Backend CI. Read-only local `pg_isready` and `prisma migrate status` observations are historical snapshots, not claims about current local service state.

### A14 Findings

#### A14-a - Delayed order-create response races autonomous recovery (F29)

- **Status:** Complete under finite scope; source repair, focused local regression (13/13), and exact-SHA CI run [37156470392](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37156470392) passed at SHA `0a8b091521210c800c7d05dba9e22e414daaa8a9`.
- **Symptom and evidence:** `createInvoiceCheckout()` previously wrote `CREATED` after Razorpay returned using an unconditional attempt-ID update. The recovery worker can first move a stale `CREATING` attempt to `REVIEW`; the late response could then overwrite that newer state. Similar unconditional writes in the create-error path could overwrite a state advanced by recovery.
- **Impact:** A pending/review or already-settled attempt could be presented as newly payable or have its reconciliation state regressed. Starting a second provider order must remain impossible while the first outcome is unresolved.
- **Bounded remedy:** Use a compare-and-set predicate requiring the same attempt/mode, `status=CREATING`, and no bound order ID for success, definitive rejection and ambiguous-result transitions. If an order ID is known after recovery moved the attempt to `REVIEW`, attach it only when that attempt has no order reference; keep `REVIEW` until authoritative reconciliation. Never overwrite a different order reference or newer status. Record the late response as an audit event.
- **Acceptance subtasks:**
  - [x] Add conditional attempt transitions for the provider success, documented amount rejection and ambiguous-error paths.
  - [x] Add a focused service regression simulating recovery advancing to `REVIEW`; prove the order reference is retained, status remains blocked, and a retry does not call provider order creation again.
  - [x] Add a focused regression proving a late response cannot downgrade `CAPTURED` or replace its payment reference.
  - [x] Retain a provider-returned order ID on the same `REVIEW` attempt when follow-up verification fails; a retry remains on the existing attempt.
  - [x] Cover late definitive-rejection and ambiguous-error responses after recovery advances the attempt; neither may overwrite the newer state.
  - [x] Run the focused mocked tests locally (13/13 across the race and resume suites); no server, database row, provider call, payment or message was used.
  - [x] Run the focused tests in exact-SHA CI and record the successful run: [37156470392](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37156470392), SHA `0a8b091521210c800c7d05dba9e22e414daaa8a9`; Backend and CRM jobs passed.
- **Dependency/disposition:** No provider or device dependency. A14/F29 is closed for this finite recovery-race scope; do not repeat its already-passing loss/reopen/pending/visibility suites or expand to physical multi-tab/device tests.

### A05 Findings

#### A05-a - Test IIN lookup fails and Razorpay's length instructions conflict

- **Status:** Deferred for this finite checkout goal; F46 issuer/IIN enrichment is unavailable, but ordinary card checkout remains supported through the formatter and account-enabled network list.
- **Evidence:** Prior read-only Test-key lookup for `41002800` and `410028` returned Razorpay's `The requested URL was not found on the server.` response through the documented SDK endpoint; see F46. The current official IIN page's supported-length table says non-tokenized IINs are 6–8 digits, but its path-parameter explanation says non-tokenized IINs are 6 digits and tokenized IINs are 9 digits. Current frontend sends up to the first 8 PAN digits and accepts 6–8 for non-tokenized lookup; it does not send a full PAN. Official reference: https://razorpay.com/docs/api/payments/cards/iin-api/ (reviewed 3 October 2026).
- **Impact:** Custom card eligibility/network and issuer identification cannot be represented as provider-verified when the Test endpoint errors; choosing one conflicting documented length or adding an alternate route would be a guess.
- **Bounded remedy/disposition:** Keep the existing documented 6–8 input boundary and fail closed for IIN metadata when the lookup is unavailable. The user-provided Razorpay support response #21192410 advises using the first eight digits, but the bounded Test lookups returned 404 and did not establish the endpoint cause. No alternate endpoint or guessed fallback is allowed. Do not retry during this goal; revisit only if Razorpay provides new endpoint evidence. This does not block ordinary card submission, which uses the SDK formatter and account-enabled networks.
- **Acceptance subtasks:**
  - [x] Confirm the current implementation sends only a 6–8 digit prefix and rejects unknown/error responses without guessing a network.
  - [x] Recheck the current official IIN page and record the conflicting length statements.
  - [x] Record support reply #21192410: use the first eight digits for network identification; the prior Test IIN lookup attempts returned 404, so endpoint availability remains unresolved.
  - [x] Keep the existing 6–8 input boundary/fail-closed metadata handling; no additional regression is required because the exact-SHA card suite already passed and no source change was made.
- **Dependency/disposition:** F46 endpoint availability is deferred after its single bounded provider-evidence check. Do not let this optional issuer/EMI enrichment block the ordinary card path or A07.

#### A05-b - Card validation boundary must not claim undocumented field rules

- **Status:** Closed as an implementation review; no guessed network-specific validation found.
- **Evidence:** Card number and expiry use Razorpay's loaded Custom Checkout formatter `isValid()` result. The app checks only required cardholder name, documented MM/YY shape/future expiry and non-empty CVV; it imposes no card-brand CVV length, local BIN prefix table or unsupported card-number length rule, and passes CVV to Razorpay unchanged. The reviewed official Custom Checkout, payment-method and Test pages do not specify a public formatter API contract or brand-specific CVV validation rules. References: https://razorpay.com/docs/developer-tools/integrations/custom-checkout/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/test-integration.
- **Impact:** Treating locally invented rules as Razorpay validation could reject valid cards or falsely advertise acceptance. Current source avoids that behavior and leaves authorization to Razorpay.
- **Bounded remedy:** None required. Preserve provider formatter validation and provider authorization; do not add CVV-length or BIN-prefix validation absent an official contract.
- **Acceptance subtasks:**
  - [x] Inspect card submission and formatter usage.
  - [x] Compare local validation to the reviewed official documentation.
  - [x] Confirm no guessed network-specific length/prefix rules are present.
- **Dependency/disposition:** None for the stated A05 acceptance. This finding is closed as an evidence-based no-change result; it does not claim that Razorpay documents a detailed per-field formatter contract.

#### A05-c - Active card form network artwork lacks a CI rendering assertion

- **Status:** Complete.
- **Evidence:** Backend publishes an allowlisted set of Razorpay-hosted network artwork URLs, and the active card form renders returned artwork against the enabled-network list. Existing CI browser fixtures supplied an empty artwork list, so none asserted Visa, Mastercard, RuPay, AmEx rendering or Diners exclusion in that active form.
- **Impact:** The provider-approved artwork mapping could regress or display a disabled network without the current suite detecting it.
- **Bounded remedy:** Extend the existing CI-only active-checkout browser case with the Razorpay-hosted Visa, Mastercard, RuPay and AmEx artwork entries and enabled-network response; assert their accessible images/source URLs appear and Diners does not. This validates UI mapping, not availability of Razorpay's external CDN or actual account activation.
- **Acceptance subtasks:**
  - [x] Confirm production mapping uses Razorpay-hosted image URLs and filters artwork through enabled networks/exclusions.
  - [x] Add assertions for four accepted network logos and Diners exclusion to the existing CI browser case.
  - [x] Run exact-SHA CI once and record the result; rerun only if this assertion fails and is fixed.
- **Dependency/disposition:** Exact-SHA CI. Actual CDN delivery/device rendering is not inferred by a mocked browser response; the accepted asset hosts are controlled by Razorpay.

**Closure evidence (3 October 2026):** Exact-SHA PR #10 CI run [37062349045](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37062349045), commit `b0946ae0a975aafa33ad1178ea698879e6c03fe6`, passed Backend and CRM. CRM's combined-checkout responsive suite passed all 25 cases, including the active card form's Visa, Mastercard, RuPay and American Express artwork assertions and Diners exclusion. This proves that returned/allowlisted artwork is rendered and accessible in the tested UI; it does not claim live CDN delivery or account-level card authorization. No payment or local database write occurred.

**A05 acceptance under active finite goal (4 October 2026):** Complete. Exact-HEAD CI run [37136624270](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37136624270) passed the active card checkout/network-gating case, SDK-readiness retry and invalid-card-field boundary. Earlier recorded CI covers the card UI/artwork assertion; A06 already covers one Test card success and terminal failure. Source review confirms card number/expiry use Razorpay's formatter and no guessed brand CVV length or BIN prefix is applied. The single F46 Test IIN lookup returned 404; optional issuer enrichment is deferred. No payment or IIN request was repeated.

### A07 Findings

#### A07-a - UPI Intent was not disabled for Customer Fee Bearer

- **Status:** Complete.
- **Evidence:** The official Razorpay UPI Intent mobile-web page states UPI Intent is not available on the Customer Fee Bearer (CFB) model. The UI previously treated only explicit `upi_intent` method flags as authoritative and could expose discovered app choices when the configured fee bearer was `CUSTOMER`.
- **Impact:** A customer on CFB could be offered an Intent flow that Razorpay documents as unavailable, despite the UI otherwise following the returned method list.
- **Bounded remedy:** Derive one `upiIntentUnavailable` guard from the provider's explicit method flags plus the already-loaded fee-bearer configuration. When fee bearer is `CUSTOMER`, disable only the Intent-specific mobile app path; do not suppress desktop UPI QR or unrelated methods. Do not infer the fee-bearer value when it is `UNVERIFIED`.
- **Acceptance subtasks:**
  - [x] Confirm the provider's documented CFB restriction and trace the UI method gate.
  - [x] Add the CFB guard without changing desktop UPI QR or other methods.
  - [x] Add focused unit cases for CFB and either returned method snapshot disabling Intent.
  - [x] Run exact-SHA CI once and record the result; rerun only if a concrete failure is fixed.
- **Dependency/disposition:** Exact-SHA CI. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/ (reviewed 3 October 2026).

**Closure evidence (3 October 2026):** Focused UPI unit tests passed 4/4. Exact-SHA PR #10 CI run [37063205049](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37063205049), commit `eaa0f5f17c0e1d69812a9da15ef42bc9242f563f`, passed Backend and CRM, including CRM type-check/build, the UPI discovery contract step and the complete combined-checkout responsive browser suite. The change disables only mobile UPI Intent under CFB; it leaves desktop QR and other payment methods unchanged. No payment or local database write occurred.

#### A07-b - Installed-app Intent and QR handoff/return lack supported-device acceptance

- **Status:** Native installed-app/device subset deferred; parent A07 is accepted for this finite method scope.
- **Evidence:** Existing browser tests mock supported-app identifiers and `createPayment`; they prove request construction and fail-closed UI, not that Android/iOS launches an installed UPI app or returns through success, cancellation or timeout. One captured Razorpay Test UPI QR path is recorded under A18; it is the single representative UPI success path for this goal.
- **Impact:** A browser mock cannot prove operating-system app switching, the bank/UPI app result, or return to the checkout page. No actual handoff success or failure is claimed.
- **Bounded remedy:** None for the frozen finite scope. Preserve the app-list guard and existing captured UPI QR path. Native app switching and device-specific cancel/return permutations may be revisited only in a separate supported-device pass; do not create another invoice or payment for this deferred subtask.
- **Acceptance subtasks:**
  - [x] Review the official device-specific app list and the existing mocked coverage.
  - [Deferred] Capture an Android/iOS Test Intent launch and return/cancel result; unavailable on the current desktop session and outside the frozen device scope.
  - [x] Reuse the existing captured Test UPI QR result recorded under A18; no repeat payment.
  - [ ] Record device/browser, selected identifier and resulting provider references/status without exposing customer secrets.
- **Dependency/disposition:** Desktop Chrome has no installed Android/iOS UPI app. Keep only that native device subtask deferred; a representative UPI QR Test success is already recorded. Do not emulate native handoff or repeat mock/payment cases.
- **Official source:** https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/.

#### A07-c - UPI app-list resolved type is not guaranteed by the public contract

- **Status:** Closed with a defensive runtime boundary; no stable provider type is claimed.
- **Evidence:** The official mobile-web guide documents `getSupportedUpiIntentApps()` and recommends displaying returned options, but does not specify a stable resolved JSON type. The existing implementation accepts only an array, filters non-string members, and rejects other response shapes. Prior read-only inspection of the then-current Razorpay-hosted SDK artifact found unique string identifiers and `google_pay` normalization to `gpay` (F63); the SDK URL is unversioned.
- **Impact:** Depending on undocumented future SDK response shapes could expose invalid app choices. The current strict boundary prevents that; mocks do not upgrade the observed artifact into a permanent provider guarantee.
- **Bounded remedy:** None required. Preserve array/string validation and fail closed for unknown shapes; revisit only if Razorpay publishes a schema change or runtime evidence contradicts the guard.
- **Acceptance subtasks:**
  - [x] Review official UPI Intent docs and the prior hashed SDK artifact observation.
  - [x] Confirm malformed/non-array responses are rejected by focused unit tests.
  - [x] Record that the resolved type is observed, not contractually guaranteed.
- **Dependency/disposition:** None for current source acceptance. Actual device behavior remains separate under A07-b. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/.

**A07 acceptance under active finite goal (4 October 2026):** Complete. Exact-HEAD CI run [37136624270](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37136624270) passed the current checkout suite; prior UPI contract CI covers app-list guards and the Customer Fee Bearer restriction. A captured Razorpay Test UPI QR payment is recorded under A18, providing one representative provider-backed UPI success path. Native installed-app Intent and exhaustive device/cancel/return cases are deferred; no new payment, invoice or database was created for this acceptance.

### A08 Findings

#### A08-a - Additional Netbanking/wallet failure and redirect permutations lack provider acceptance

- **Status:** Deferred variants only; parent A08 is complete under the finite representative-path scope.
- **Evidence:** Read-only Prisma queries confirmed the active local database is `hangers_db` and found Home/Test Netbanking capture `order_TiZghymRqO80Ir` / `pay_TiZlUVmIRkmX5R` and Airtel Money wallet capture `order_TicXzOXqiuOuN9` / `pay_TicYLmgkriQYoR`, each ₹10 and `CAPTURED`; the recorded Kevin Chrome runs include paid-state refresh. The fixed callback URL/POST contract, invoice/share binding, signature-verification handoff, duplicate handling and pending/failure-shaped callback responses have unit/CI coverage (run `36976152811`). A single bounded read-only `GET /v1/methods` check returned HTTP 401 for each of the two saved Test-key CSV pairs; neither pair was changed or retried. No new order/payment or local fixture was created for this review. These extra checks do not establish every bank redirect, provider failure, browser-close/return permutation, which is outside the accepted one-representative-path scope.
- **Impact:** Server callback correctness is supported, but end-to-end bank/app navigation and real return behavior are not proven for failed or interrupted redirects. Do not claim mocked callback behavior as provider acceptance.
- **Bounded remedy:** None for A08 acceptance. Keep the two captured successful method paths and callback/recovery contract as the accepted evidence. Do not retry the rejected credential pairs, change keys/configuration, or create payments solely to explore additional failure/redirect permutations. Revisit only if new authorized Test credentials or a concrete contradictory production-independent defect is supplied.
- **Acceptance subtasks:**
  - [x] Confirm callback URL is fixed, accepts the documented POST fields and delegates settlement to authoritative verification; unit/CI callback cases pass.
  - [x] Confirm one Test Netbanking success and paid refresh (`order_TiZghymRqO80Ir` / `pay_TiZlUVmIRkmX5R`); do not repeat it.
  - [x] Confirm one Test wallet success and paid refresh (`order_TicXzOXqiuOuN9` / `pay_TicYLmgkriQYoR`); do not repeat it.
  - [Deferred] Observe a Test Netbanking redirect and returned terminal failure/pending status with provider references; available Test credentials were rejected with HTTP 401.
  - [Deferred] Observe a Test wallet failure/return if Razorpay exposes that supported Test path; otherwise document its exact provider limitation. A valid Test-authenticated session is not available locally.
  - [Deferred] Verify reload/return reconciles the same attempt and does not expose a duplicate Pay while the provider state is nonterminal; callback and same-order behavior remain covered by the existing unit/CI evidence, not provider acceptance.
- **Dependency/disposition:** Additional bank/wallet failure and redirect permutations are deferred; they are not blockers for the one-path A08 acceptance. No checkout source defect was demonstrated by current evidence, so no speculative code change is made. A08 is complete and the finite A-sequence continues at A09.
- **Official references:** https://razorpay.com/docs/developer-tools/integrations/custom-checkout/ (callback URL must accept POST and use `redirect: true`) and https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/.

### A09 Findings

#### A09-a - EMI processing-fee/tax meaning is not defined by the reviewed public contract

- **Status:** Deferred under the finite dependency rule pending Razorpay support response F11; implementation intentionally does not estimate fees. Parent A09 is not accepted.
- **Evidence:** Official Custom Payment Methods documents issuer-keyed `emi_plans`, `min_amount`, duration/annual interest, `emi_duration`, and `Razorpay.emi.calculator`; it says calculator output uses the same unit as principal (paise remains paise). It does not establish units, application or tax treatment for processing-fee fields. Current UI displays the documented interest and SDK calculator amount, then states bank fees/taxes are confirmed by the bank; it does not combine unverified provider fields into an all-in amount. Existing support question F11 asks for the missing fee contract.
- **Impact:** Guessing fee units or tax applicability could misstate what an invoice customer will pay. The current wording avoids presenting an unverified fee estimate as final.
- **Bounded remedy:** Keep the current explicit bank-confirmation caveat. Record Razorpay's response to F11 once; implement only the documented fee calculation/disclosure if the provider supplies exact fields, units, applicability and tax treatment. Run one focused regression for that contract, then close this finding. Do not repeatedly reread the same docs or invent a fee formula.
- **Acceptance subtasks:**
  - [x] Compare the EMI plan/calculator contract with the current amount/tenure display.
  - [x] Confirm no local processing-fee or tax formula is applied.
  - [Deferred] Record Razorpay's authoritative response to F11 when it arrives; do not block the sequence while pending.
  - [Deferred] If the response supplies a fee contract, implement that contract and run one focused regression; otherwise record provider limitation and close without adding a guessed estimate.
- **Dependency/disposition:** Razorpay support response F11. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/.

#### A09-b - Issuer-specific EMI eligibility and plan acceptance remain provider-dependent

- **Status:** Deferred under the finite dependency rule; shared IIN lookup failure is tracked under A05-a/F46, not duplicated here. Parent A09 is not accepted.
- **Evidence:** Source parses only documented issuer-keyed `emi_plans`, applies the returned `min_amount` and tenure/interest, and calls Razorpay's documented `emi.calculator` with the paise principal. Focused plan parsing tests and CI cover malformed/undocumented shapes. The current Test IIN lookup evidence is the Razorpay 404 and conflicting length contract in A05-a; no live issuer eligibility/plan result or end-to-end EMI authorization is claimed from mocked issuer responses.
- **Impact:** Account mocks establish defensive UI logic, not the actual issuer/card/amount-specific plan or lender decision. Customers must not be told that a mocked EMI offer is authorized by their bank.
- **Bounded remedy:** Reuse A05-a's provider clarification/working read-only IIN result. If an actual returned issuer plan becomes available through the documented API, run one read-only mapping check; Test payment acceptance is not required for this source acceptance and must not be generated solely to close the finding. Keep bank approval and final fee disclosure authoritative at the payment provider/bank.
- **Acceptance subtasks:**
  - [x] Confirm UI emits only the returned issuer, duration, min-amount and annual-interest fields.
  - [x] Confirm the SDK calculator is used in documented principal units and no fee amount is guessed.
  - [Deferred] Record a successful documented Test IIN/issuer response or provider clarification linked to A05-a/F46; the one bounded lookup returned 404, and optional issuer enrichment is outside this finite ordinary-card acceptance.
- **Dependency/disposition:** A05-a/F46. This is a cross-reference, not an additional IIN fix/test task. Defer after the single unavailable Test IIN lookup; it does not block the ordinary card method or require another probe. Move on to A10; resume only if new authoritative provider evidence arrives.
- **Official references:** https://razorpay.com/docs/api/payments/cards/iin-api/ and https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/.

### A10 Findings

#### A10-a - A failed CRED eligibility check left a stale error after a successful retry

- **Status:** Complete; the source fix and regression passed exact-SHA CI.
- **Evidence:** `checkCred` set the ineligible/error state when the SDK returned a non-eligible result, but did not clear that error when the customer retried and received `ELIGIBLE`. The new bounded browser regression exercises ineligible then eligible responses and asserts the old alert disappears without invoking payment submission.
- **Impact:** The customer could see a contradictory failure banner beside confirmed eligibility, even though a later valid check permits continuing. It does not change payment eligibility, amount, payload or server settlement.
- **Bounded remedy:** Clear the prior method-level error at the start of a fresh CRED eligibility check; retain the existing country-coded eligibility call and payment gate. Do not change provider error mapping or add guessed eligibility states.
- **Acceptance subtasks:**
  - [x] Trace the failed-result and successful-retry state transitions.
  - [x] Clear the stale alert when a new eligibility check begins.
  - [x] Add one mocked ineligible-then-eligible regression and assert no payment/verification request.
  - [x] Run the corrected focused regression within exact-SHA CI; Backend and CRM both passed.
- **Evidence:** Commit `ea8ca1fb0a34f61830db2b251c83c19403067828`, run [37066262927](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37066262927), exposed a strict-mode ambiguity: `getByRole('status')` matched the general availability note and the CRED eligibility status. This was a test-selector failure, not a product failure. The assertion now scopes to the status element containing the CRED success message. The corrected regression passed as part of the 26-case CRM responsive suite; Backend also passed in exact-SHA run [37067571073](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37067571073) for commit `da2a919d9718c0c8668cecc0498fed615984cc50`.
- **Dependency/disposition:** None for A10-a. Official references: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/features/check-cred-eligibility and https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods.

#### A10-b - Merchant-enabled provider inventory and provider-backed acceptance are not evidenced

- **Status:** Deferred under the finite dependency rule; documented source/mocks are evidenced; parent A10 is not accepted.
- **Evidence:** The checkout uses Razorpay SDK `ready.methods` as its authoritative method/provider set; the A04 change removed a second server Methods API gate so an optional REST outage cannot suppress methods the SDK has confirmed. It submits the selected provider code with the documented `cardless_emi` or `paylater` method. A guarded, read-only Razorpay Test Methods API request at `2026-10-03 11:15 IST` returned 14 enabled `cardless_emi` codes and 2 enabled `paylater` codes; that frozen inventory is historical evidence and no invoice/order/payment was created by that request. Existing exact-SHA mocked tests cover cardless EMI `hdfc` and Pay Later `lazypay` payloads. A later bounded read-only `GET /v1/methods` using each of the two saved Test-key CSV pairs returned HTTP 401; neither pair matches backend `.env`. No provider eligibility/redirect/return path was attempted after authentication failed. No static alias or disputed minimum is added.
- **Impact:** Documented method payloads and the earlier provider inventory are recorded, but actual provider eligibility/redirect/error/return acceptance remains unproven. A second Methods API intersection is not an implemented source contract after A04; do not treat that discarded comparison as a current behavior.
- **Bounded remedy:** If a valid Test key pair becomes available in the existing local environment, exercise one representative SDK-ready provider for each distinct method (`cardless_emi` and `paylater`) through a documented eligibility/error/return path, without submitting a payment. The two available pairs already returned HTTP 401; do not retry them or test all 16 provider codes. Record the Test limitation and continue the finite A-sequence.
- **Acceptance subtasks:**
  - [x] Confirm the UI gates provider choices on the Razorpay SDK-ready method list, consistent with the A04 readiness decision; do not require a second REST intersection.
  - [x] Confirm payload uses the selected, unmodified provider code and method-specific documented fields.
  - [x] Record the frozen Hangers Test provider inventory (14 `cardless_emi`, 2 `paylater`) as time-stamped evidence, not as a second runtime gate.
  - [Deferred] Verify one provider eligibility/error/return path for each distinct method (`cardless_emi`, `paylater`); current saved Test credentials return HTTP 401. No payment was submitted.
- **Dependency/disposition:** Requires a Test key pair accepted by Razorpay. The available credential pairs have been checked once and rejected; no further retry is planned until credentials are refreshed. Documented payload mocks remain valid source acceptance. Official references: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods and https://razorpay.com/docs/payments/payment-methods/pay-later/custom-integration.

### A11 Findings

#### A11-a - Saved-card source guards and negative-auth boundary

- **Status:** Complete for source/unit and negative-auth coverage; this does not accept the positive provider token lifecycle.
- **Evidence:** The saved-card unit suite passed 12/12. Existing-local HTTP denial tests passed 24/24 across six operations for absent, malformed, wrong staff-type and expired customer credentials. Runtime capability remains disabled.
- **Impact:** These checks show unauthorized requests are rejected; they do not prove a customer can safely save and use a real provider token.
- **Acceptance subtasks:**
  - [x] Preserve the bounded saved-card unit suite result (12/12).
  - [x] Preserve the bounded negative-auth API result (24/24).

#### A11-b - Exact Test-mode saved-card activation is not attested

- **Status:** Deferred; saved cards remain disabled.
- **Evidence:** Existing local configuration reports `RAZORPAY_SAVED_CARDS_ENABLED=false`; no activation attestation is recorded for the exact Test account/key.
- **Impact:** Enabling the feature without confirming the exact provider account and mode could expose a non-working or incorrectly scoped save-card flow.
- **Acceptance subtasks:**
  - [Deferred] Record authoritative Test activation for the exact account/key before enabling the capability.

#### A11-c - Authenticated consent and owner-bound token creation lack positive acceptance

- **Status:** Deferred; no customer token was created.
- **Evidence:** The checkout has source/unit and unauthorized-request coverage, but no positive authenticated Home consent-and-token-creation run is recorded.
- **Impact:** Without this check, we cannot show that consent is recorded and the provider token is attached only to the correct customer.
- **Acceptance subtasks:**
  - [Deferred] With exact Test activation, verify authenticated Home consent and create one Test token bound to that customer; do not persist PAN or CVV.

#### A11-d - Saved-token list, reuse, deletion and CVV-less lifecycle lack provider acceptance

- **Status:** Deferred until A11-b/A11-c are accepted.
- **Evidence:** No positive Test token lifecycle or provider-backed CVV-less reuse is recorded.
- **Impact:** A token that cannot be listed, reused or deleted as expected could confuse the customer or leave a saved payment method active after removal was requested.
- **Acceptance subtasks:**
  - [Deferred] Verify the same authenticated customer can list, reuse and delete the token, including the documented CVV-less path only if Razorpay supports it for this account.

#### A11-e - Customer and Test/Live token isolation lack positive lifecycle acceptance

- **Status:** Deferred until a Test token exists; no cross-customer or cross-mode token test is claimed.
- **Impact:** Without this boundary check, one customer's saved payment method could be exposed to another customer or mixed between Test and Live.
- **Acceptance subtasks:**
  - [Deferred] Verify the token is unavailable to a different customer and cannot cross Test/Live mode boundaries.
- **Dependency/disposition:** A11 remains deferred. Do not create/select provider tokens until exact Test activation and the bounded authenticated lifecycle can be exercised.

**F65 current-status correction:** the following dated F65 paragraph's reference to SHA `8b768dd` and red CRM CI is historical. The current source/test SHA and all-green CI are `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30` / run `37009102219`; the observability limitations listed there remain open.

### A18 Findings

#### A18-a - Recorded combined Test capture is not present in the approved local ledger

- **Status:** Deferred; one existing Test payment remains `created`, so a new combined order/payment was not started.
- **Symptom and exact evidence:** The master plan recorded a Test capture split as ₹10 `ORDER` + ₹20 `FIELD_SERVICE`, with provider fee/tax and zero-balance reconciliation. A targeted read-only query explicitly verified the configured existing database host is loopback and database is `hangers_db`; among 21 local ₹30 payment records, zero allocations matched that source split. The local ledger therefore cannot substantiate the earlier combined-provider claim. No credentials or customer values were exposed.
- **Subsequent bounded attempt (4 October; not acceptance):** A browser attempt was run against a disposable local database rather than the required existing `hangers_db`, using two ₹10 Home dry-cleaning invoices. It created Test Razorpay order `order_TjbIktlCpGOSJn`; Netbanking did not complete, and the server status remained CREATED/resumable with no payment ID. No capture or settlement occurred. The disposable database was removed after confirming it had no connections. This did not test the required ₹10 `ORDER` + ₹20 `FIELD_SERVICE` split and does not change A18's deferred status.
- **Current-provider reconciliation (4 October; read-only):** Using a Test-key-only guard, one Razorpay Orders/Payments API fetch for `order_TiaTeUmJH7cAXm` returned order status `attempted`, amount 1000 paise, amount paid 0, amount due 1000, and two attempts. Its associated payments are `pay_TiaUIouvF2u0GD` (`failed`, not captured) and `pay_TiaVzcF9d1UMPF` (`created`, not captured). The matching local `hangers_db` checkout attempt is `PENDING` and bound to the `created` payment; the other existing Home attempts are `CREATED` with no payment IDs, and no local ledger payment is bound to these three orders. Razorpay's [Order API](https://razorpay.com/docs/api/orders/fetch-with-id/) documents that an `attempted` order remains in that state until a payment is captured; its [Payment API](https://razorpay.com/docs/api/payments/fetch-with-id/) lists `created` separately from `failed` and `captured`. This single read confirms no capture but does not establish a safe retry while the created payment remains unresolved.
- **Impact and scope:** A18's actual combined provider capture/reconciliation acceptance is unproven. Existing disposable-CI evidence for immutable split, atomicity, stale/overlap/foreign rejection and duplicate protection remains valid, but is not real provider acceptance. This does not alter C03: dry-cleaning eligibility is a merchant/business-level rule, not a requirement that each fixture or source order be dry cleaning.
- **Bounded remedy:** Keep A18 deferred and advance to A19 under the finite rule. Do not create a second order or payment while the existing `created` payment is unresolved; do not poll the provider repeatedly. Revisit only if a new authoritative event/status becomes available, then reconcile the same order before considering any retry.
- **Acceptance subtasks:**
  - [x] Verify the database target is the approved local `hangers_db`.
  - [x] Search existing ₹30 payment allocations for the recorded ₹10 `ORDER` + ₹20 `FIELD_SERVICE` split.
-  - [x] Reconcile the existing Home provider order/payments once in Test mode and match their IDs/status to the local checkout attempt; confirm zero provider amount paid and no local ledger payment.
-  - [Deferred] Complete a combined Test capture only after the existing `created` payment reaches an authoritative terminal state; retain this limitation without creating another payment.
- **Dependency/disposition:** Existing record/reference mismatch; no source defect was established, so no code change is justified.

#### A18-b - Existing single-invoice Orders prevent a safe combined replacement

- **Status:** Deferred; no attempt/order was changed and no replacement combined Order was created.
- **Symptom and exact local evidence (4 October):** A read-only query guarded to `localhost/hangers_db` found eight active `TEST` attempts for the Home customer. Four belong to currently open invoices totaling ₹142 (₹120 `ORDER`, ₹22 `DAILY_IRON`): `CUSTOM-CARD-20261001-ONE` is `PENDING` for ₹10; `INV-001295` is `CREATED` for ₹22; `QA-CHECKOUT-46753DDC9F` is `CREATED` for ₹10; and `INV-001645` is `CREATED` for ₹100. Four other active attempts refer to invoices whose local status is already `PAID` (₹350, ₹180, ₹100, ₹100). Thus this is not one stale payment ID; prior single-invoice Orders cover the whole open balance and several older paid invoices.
- **One bounded Test API pass:** Five previously unqueried Order IDs were fetched once, read-only, under a `rzp_test_` key guard. Combined with the three previously recorded one-time lookups in A18-a, the eight provider Orders are: `order_TgZ7zLrFteBLHM` (`attempted`, one `created` ₹350 payment); `order_TgbgvPlRPCIhxh` (`created`, zero attempts, ₹180); `order_Thf8bEW5mI6QNt` (`attempted`, one `created` ₹100 payment); `order_Thp3XNWFhxpEvp` (`attempted`, two `failed` plus one `created` ₹100 payment); `order_TiaTeUmJH7cAXm` (`attempted`, one `failed` plus one `created` ₹10 payment); `order_Timwn6m9HH1e4b` (`created`, zero attempts, ₹22); `order_TipQL42KJcTTvL` (`created`, zero attempts, ₹10); and `order_TjFIAfx304Nc12` (`created`, zero attempts, ₹100). Every payment amount-paid value is zero; none is captured. No further lookup is planned absent a provider event or new authoritative evidence.
- **Source and contract evidence:** Combined checkout currently searches active attempts by `customerId` and blocks if any `CREATING`, `CREATED`, `AUTHORIZED`, `PENDING`, or `REVIEW` attempt exists (`hangers-backend/src/services/razorpay-invoice-checkout.service.js`, `createInvoiceCheckout`). The paid-invoice attempts contribute to that broad customer-level block; even if those were separated, the four unpaid invoices already have individual Orders, so issuing a combined replacement without invalidating them could leave two payable Orders against the same balances. Razorpay's Order API documents only `created`, `attempted`, and `paid`; `attempted` persists until capture. Its official Orders collection lists create/fetch/fetch-payments/update, and the published Update example changes only `notes`; no cancel/expire operation is documented in the checked Order API. Sources: [Fetch an Order With ID](https://razorpay.com/docs/api/orders/fetch-with-id/), [Razorpay Orders APIs](https://www.postman.com/razorpaydev/razorpay-public-workspace/folder/rcegvs2/orders-apis), [Update an Order](https://www.postman.com/razorpaydev/razorpay-public-workspace/request/c1mxvsh/update-an-order).
- **Finite regression (4 October):** `node --test tests/razorpay-checkout-create-recovery-race.unit.test.js` passed 6/6. The added isolated mocked case seeds an active single-invoice attempt on a different invoice for the same customer, requests combined checkout, and verifies `CHECKOUT_ALREADY_IN_PROGRESS`, the matching attempt reference, preservation of its existing Razorpay Order ID, and zero provider `orders.create` calls. This proves the duplicate-order guard without changing local records or contacting Razorpay; it is not provider capture acceptance.
- **Impact:** Silently ignoring these attempts could allow an old single-invoice checkout and a new customer-total checkout to both collect. A captured late payment against an already-paid invoice fails the CRM ledger-balance rule and goes to Finance review; that does not prevent the customer from being charged upstream. Do not weaken the block, mark an attempt failed locally, or treat a provider `created`/`attempted` Order as expired.
- **Bounded remedy:** Ask Razorpay once whether a merchant can cancel/expire an unpaid Order (both `created` with zero attempts and `attempted` with nonterminal/failed payments), how that affects already-open Custom Checkout sessions, and what documented endpoint/dashboard action guarantees it can no longer accept a payment. If the provider confirms a supported mechanism, implement and test only that method before creating the single combined Test capture. If not, retain A18 as deferred and do not manufacture a success by clearing local attempts.
- **Acceptance subtasks:**
  - [x] Enumerate Home's active attempts and current invoice balances from the existing `localhost/hangers_db`, without exposing customer contact data.
  - [x] Fetch the five previously unqueried Razorpay Test Orders once and combine their status with the three earlier order lookups; no capture/payment was submitted.
  - [x] Trace the customer-level active-attempt guard and confirm why it blocks combined checkout.
  - [x] Regression-test that an active single-invoice attempt on another invoice for the same customer blocks combined checkout before provider create; focused mocked recovery-race suite passes 6/6.
  - [x] Check Razorpay's published Order states and update operation; no cancel/expire action was found in the reviewed Order API references.
  - [Deferred] Obtain one authoritative Razorpay answer on invalidating unpaid Orders and existing Checkout sessions; do not issue a combined Order before a documented safe path exists.
- **Dependency/disposition:** Provider lifecycle behavior for canceling an unpaid Order is not documented in the reviewed public API reference; this is a bounded provider clarification, not permission to weaken duplicate-payment protection.

### A19 Findings

#### A19-a - Processed historical payment notification has no correlated terminal outcome

- **Status:** Deferred historical-data finding; parent A19 is complete under finite current-path acceptance. No resend or outbox replay was performed.
- **Symptom and exact evidence:** In the approved local `hangers_db`, outbox event `cmup9ljgp0015gj56cdd7stjj` is a `PAYMENT_RECEIVED` row for the captured ₹10 Test payment; it is `PROCESSED`, has zero attempts and no stored error. The matching `WHATSAPP_PENDING` stage points to that event, but there is no terminal stage for the same event ID. A later `WHATSAPP_SENT` stage on the same order points to the separate `ORDER_UPDATED` event `cmupbqmle0001m2e722uk2a1t`, so it cannot establish the payment-message outcome.
- **Current-path verification (4 October):** The separate captured Test invoice `CUSTOM-CARD-20261001-FINAL` reconciles to one ₹10 captured ledger payment, one posted allocation, PAID invoice, issued receipt `REC-002756`, successful `RAZORPAY_PAYMENT_CAPTURE_POSTED` audit, and exactly one `PAYMENT_RECEIVED` outbox row (`PROCESSED`, attempts=1, no error). Its `WHATSAPP_SENT` stage references the same outbox event ID, establishing provider acceptance for this representative current path, not handset delivery. Exact-HEAD CI run `37157076612` also verifies the Test capture queue/skip path (`QUEUED` then `SKIPPED`, zero Whatomate calls) and idempotent outbox contract. Together these satisfy A19's finite success/skip state acceptance without resolving the separate older event.
- **Impact and scope:** The ledger, receipt and capture audit reconcile; the notification outcome does not. `PROCESSED` alone does not prove Whatomate accepted the message or that it reached the customer's handset. This finding does not authorize contacting the customer or replaying the event.
- **Bounded remedy:** Keep this one historical event deferred and preserve its evidence. Do not change payment state, synthesize a terminal stage, or resend a WhatsApp message to infer what happened. The parent A19 remains complete because a distinct representative success path and the CI skip path meet the finite acceptance.
- **Acceptance subtasks:**
  - [x] Verify the existing capture, posted allocation, zero balance and issued receipt.
  - [x] Verify the successful capture audit and linked outbox state.
  - [x] Compare the linked notification stage with the outbox terminal state; identify that only `WHATSAPP_PENDING` exists.
  - [x] Verify a separate current-path capture has a terminal stage correlated to its own processed payment outbox event; provider acceptance is not handset delivery.
  - [Deferred] Recover the terminal outcome of this specific historical outbox event from an existing authoritative record, if available; otherwise retain the limitation. Do not replay it or synthesize a terminal stage.
- **Dependency/disposition:** Missing terminal outcome evidence for this historical event; no current source defect or handset delivery is established.

### A22 Findings

#### A22-a - Operational observability policy is not specified for this finite checkout pass

- **Status:** Deferred; implementation-level correlation/privacy checks are recorded, operational policy is not invented.
- **Symptom and exact evidence:** The current code provides opaque journey/attempt/request/trace correlation, allowlisted event data and privacy tests. Exact-HEAD CI run `37136624270` passed backend logger/privacy and disposable-database journey correlation checks. A read-only Prisma status check, guarded to loopback host and database `hangers_db`, reports the local schema up to date with 80 migrations. No approved retention duration/access policy, logger-failure guarantee or deployed-runtime telemetry evidence is recorded.
- **Impact and scope:** This is an operational policy/evidence gap, not evidence that local journey logging or the database migration is absent. Do not infer production retention/access controls from unit or CI tests.
- **Bounded remedy:** Defer these operational decisions to a separately scoped policy/release review. Keep A22's implemented correlation/privacy evidence and advance to A23; do not broaden this Test-only acceptance into production telemetry rollout.
- **Acceptance subtasks:**
  - [x] Verify exact-HEAD CI coverage for journey correlation and privacy.
  - [x] Read local migration status without applying a migration; all 80 migrations are applied.
  - [Deferred] Establish retention/access policy, logger/persistence failure behavior and deployed-runtime telemetry under a separately bounded operational scope.
- **Dependency/disposition:** Requires an approved organizational retention/access policy and deployed-runtime evidence; no guessed duration or access model is written.

### A24 Findings

#### A24-a - Exact-revision CI evidence is recorded

- **Status:** Complete for the CI evidence recorded in the current task register; confirm the reviewed PR head again before release.
- **Evidence:** The current register records both Backend and CRM CI jobs passing for PR #10's tested revision.
- **Acceptance subtasks:**
  - [x] Record passing exact-SHA Backend and CRM CI evidence.

#### A24-b - PR review, approval and merge are outstanding

- **Status:** Deferred; PR #10 is OPEN/Draft.
- **Impact:** Shipping a draft or unreviewed revision could put unapproved code into the live payment path.
- **Acceptance subtasks:**
  - [Deferred] Obtain review/approval and merge only the revision whose CI was reviewed.

#### A24-c - Production backup and guarded schema change are outstanding

- **Status:** Deferred; no production backup or migration was performed.
- **Impact:** A schema change without a verified recovery point could make payment records unavailable if deployment fails.
- **Acceptance subtasks:**
  - [Deferred] Verify the production backup and apply only the approved, guarded migration if the reviewed release requires it.

#### A24-d - Production configuration and explicit activation are unverified

- **Status:** Deferred; no production configuration or application activation was performed in this acceptance record.
- **Impact:** Correct code can still fail or use the wrong mode if Live keys, webhook destination, or feature flags are misconfigured.
- **Acceptance subtasks:**
  - [Deferred] Verify the approved Live configuration, webhook endpoint settings and explicit feature activation without exposing credentials.

#### A24-e - Approved revision has not been deployed

- **Status:** Deferred; no production deployment was performed.
- **Impact:** Passing CI does not change the running website; customers continue using the currently deployed version until a controlled release occurs.
- **Acceptance subtasks:**
  - [Deferred] Deploy the reviewed and approved revision through the documented release process.

#### A24-f - Post-deployment checks and recovery readiness remain outstanding

- **Status:** Deferred; no post-deployment health/reconciliation check was performed.
- **Impact:** A deployment could appear successful while payment status, webhook delivery or invoice reconciliation is broken; without a recovery plan, restoring service takes longer.
- **Acceptance subtasks:**
  - [Deferred] Run the bounded post-deployment health and payment-reconciliation checks and confirm the documented recovery/rollback procedure.
- **Dependency/disposition:** A24 remains deferred until the review and release gates above are completed. These child labels make existing gates explicit and do not add A-items to the finite plan.

## Acceptance Findings - 1 October 2026

- F65 (observability/correlation; updated 2 October 2026): source review found fragmented ActivityLog/AuditLog, signed webhook inbox/worker outcomes and notification outbox stages, but no single durable parent across retries. Current implementation adds nullable `paymentJourneyId` to checkout attempts; new attempts receive an opaque Hangers ID, legacy attempts acquire one on their next logged transition using a conditional update/re-read, and each `auditAttemptTransition` inserts an allowlisted `RazorpayPaymentJourneyEvent` in the same transaction. Request IDs remain per HTTP hop; W3C Trace Context validates incoming version-00 `traceparent`, creates a distinct server span, and worker operations without HTTP context receive independent trace/span IDs. Provider order/payment IDs are included only after they exist and pass format validation. Confirmed retry, webhook outcomes and payment-notification outbox queue/worker outcomes now correlate to the same attempt/journey; notification logs distinguish provider acceptance from actual handset delivery. Card data, CVV, OTP values, full contacts, tokens, secrets, raw payloads and unrestricted error text are excluded from the new sink. Focused privacy/trace tests are recorded as 10/10 and the Backend release-suite evidence as 137/137. At current exact SHA `8b768dd`, the Backend CI job passed the disposable migration, webhook/retry and outbox integration checks in run `37004349213`; the overall workflow is red because CRM failed F66. Read-only Prisma status finds the local journey-event migration pending on reachable `hangers_db`. Still partial: browser lifecycle telemetry, durations/aggregate metrics, injected DB/logger failure behavior, retention/access controls, historical records, local migration application and production runtime remain open. Existing ActivityLog/AuditLog may still include separate diagnostics subject to their sanitizer; this new sink is stricter. References: https://docs.adyen.com/account/payments-lifecycle/ ; https://www.w3.org/TR/trace-context/ ; https://opentelemetry.io/docs/specs/otel/logs/.

- F61 (resolved 2 October 2026): Razorpay's Custom Checkout payment-method contract documents issuer-keyed `emi_plans` with `min_amount` and a `plans` object; the reviewed contract does not establish `emi_options` or array-shaped responses. The checkout now consumes only the documented structure and fails closed for those alternate shapes. Added focused unit regressions and a CI step. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/. This addresses response parsing only; actual issuer eligibility, calculator units, fee-bearer terms and Test-mode provider acceptance remain in A09/C14 and F11.
- F62 (resolved 2 October 2026): Razorpay's standard six-digit IIN example omits `tokenised_iin`; the tokenised nine-digit example includes `true`, and the entity example documents a boolean. The normal-IIN-only route therefore continues to accept an absent field, but now rejects any present value other than boolean `false` (including `true`, `null`, or string values). Tests cover omitted, `false`, `true`, `null`, and string cases. Official source: https://razorpay.com/docs/api/payments/cards/iin-api/#iin-entity. This closes response-schema ambiguity at this endpoint; it does not establish issuer/EMI eligibility or provider acceptance.
- F63 (current SDK artifact inspected; public contract still unverified, 2 October 2026): Razorpay's UPI Intent page recommends `getSupportedUpiIntentApps()` but does not document its resolved JavaScript type. Read-only inspection of the then-served official `https://checkout.razorpay.com/v1/razorpay.js` artifact (SHA-256 `68050c39082368f9959872696abfa6d54b6182b965dd46c13e62c5db928b6a04`, 327573 bytes) found `getSupportedUpiIntentApps` returning `Promise.resolve(e)`, where `os()` constructs unique string identifiers with `Array.from(new Set(t))` and normalizes `google_pay` to `gpay`. The existing `Promise<unknown>` boundary and runtime array/string guard match this observed artifact. Because the CDN URL is unversioned and the docs do not promise a stable type, retain the guard; this source observation does not count mocks as supported-device or provider-payment acceptance under A07. No SDK script was executed and no payment was initiated. Official sources: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/ and https://checkout.razorpay.com/v1/razorpay.js.
- F64 (report-only validation traceability question; 2 October 2026): the official Custom Checkout guide and payment-method page specify the card payload fields, show a 3-digit CVV example, and the Test guide says to use any random CVV and a future expiry. They do not define the public `setFormatter`/`formatter.add`/`isValid` JavaScript contract or detailed per-field validation rules. The current card form uses the Razorpay formatter for card number/expiry, applies local month/year shape and non-expiry checks, and only requires CVV to be nonempty; it does not impose a guessed brand-specific CVV length. This is not evidence of a demonstrated payment defect. **Disposition under the active finite goal:** no guessed validation is present, the representative card path is accepted under A05/A06, and deeper formatter-contract documentation is deferred; it does not keep A05 partial. Do not add brand-specific length/prefix rules or claim undocumented provider validation. Sources: https://razorpay.com/docs/developer-tools/integrations/custom-checkout/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/test-integration.

- F55 status (1 October 2026): the identified free-text bypass is repaired and the audit/activity persistence boundary now re-sanitizes nested Razorpay `providerError` data using an allowlist. Regression tests assert both ActivityLog and AuditLog payloads preserve documented diagnostics/references while excluding sensitive values and unapproved provider fields. This resolves F55's identified persistence bypass; it does not complete broader A22 telemetry, customer-auth OTP, rate-limit, historical-record or full-application privacy acceptance. No historical data purge or production operation was performed.
- Historical local-log scan (2 October 2026): a read-only aggregate query examined 869 paired ActivityLog/AuditLog Razorpay diagnostic records. It selected no row contents and made no writes. Both tables had zero standalone 3+ digit values, CVV/CVC labels, credential/token markers, email addresses or unexpected provider-error keys. The 125 descriptions matching the standalone word `OTP` contained no standalone 3+ digit values; the term alone is not evidence of an OTP value. This closes the local historical-data check only; production history and other telemetry stores were not inspected.

- F56 (resolved 2 October 2026): checkout reservation retry logs now preserve the actual recognized conflict code: Prisma `P2034`, PostgreSQL serialization failure `40001`, or deadlock `40P01`. Retry classification, limits and backoff are unchanged. The existing concurrency acceptance test now asserts each logged code; CI already runs it. No provider/payment behavior changed.
- F57 (report-only notification recovery gap; provider contract evidence added 2 October 2026): source audit finds no persisted provider message ID/status lookup or delivery-unknown state before an uncertain Whatomate resend; stable request keys alone do not prove external deduplication. Manual retry uses a different key from the original payment confirmation. The outbox claim selects PENDING/FAILED, not abandoned PROCESSING, so its lock-age predicate alone does not prove crash recovery. Whatomate's published API documents `POST /api/messages/template` returning `data.message_id` and `data.status` (initially `pending`), `GET /api/contacts/{id}/messages`, and Meta message-status callbacks with a `wamid`; its separate outbound webhook event catalog lists `message.incoming`, `message.sent`, and `message.outgoing`, but does not specify delivery-status updates in those events. The configured production endpoint/version and whether its callback/webhook configuration can correlate its returned `message_id` to Meta `wamid` have not been verified. Therefore do not assume a lookup, callback, or idempotency guarantee exists in the deployed Whatomate instance. Next evidence required: confirm the deployed Whatomate API version/contracts and supported authenticated status/reconciliation path; then persist returned IDs and delivery-unknown state, and exercise timeout-after-acceptance without resending. No messages sent or worker behavior changed. Sources: https://shridarpatil.github.io/whatomate/api-reference/messages/ and https://shridarpatil.github.io/whatomate/api-reference/webhooks/.
- F58 (new, report-only webhook configuration evidence): worker supports the original 14 payment/refund/dispute events plus payment.downtime.started/updated/resolved and conditional virtual_account.credited. Historical subscription record lists 14 and deployment guidance lists only three recommendations. Current Dashboard subscriptions/delivery were not inspected; this is not proof of an actual Live omission. Verify applicable subscriptions before Custom activation; recurring subscription events remain out of scope. No Dashboard/configuration changes made.

- Historical F55 discovery (superseded by the 1 October 2026 repair below): the original synthetic `Invalid CVV 123` probe exposed the three-digit-value bypass. The finding was subsequently authorized and repaired; it is no longer open. A22 remains incomplete for the separately listed coverage gaps.

- F54 status (2 October 2026): production fixed-code leakage risk repaired. Both customer and delivery OTP services now force dev mode off under `NODE_ENV=production`; production environment validation rejects `DEV_MODE`/`WA_DELIVERY_OTP_DEV` and missing or too-short `MSG91_AUTH_KEY`. Tests cover both services with missing credentials and dev flags in production, local missing-key development behavior, and production configuration rejection. No OTP was requested or sent. This verifies the source/config contract, not the deployed EC2 environment or a production OTP delivery.

- F53 (resolved 2 October 2026): all invoice-share and invoice-checkout routes now set `private, no-store` before rate limiting and share resolution, so invalid-share, malformed-body, and limiter responses inherit the policy. The existing local HTTP matrix through `localhost:5002` passed all 10 invoice/status/method/create/verify/reconcile/callback cases and asserts no-store for each. Marketing, quotation and Daily Iron endpoints are unchanged.

- F52 (new, report-only audit distinction): imported `main` commit `3256c7f` intentionally pauses five order-status templates. `sendOrderStatusMessage` returns true without a Whatomate request when `template.paused` is set. A success-shaped worker/audit result for those templates is not evidence of provider acceptance or handset delivery. Preserve this existing configuration; later audit work should distinguish intentionally skipped delivery from sent delivery. No automatic repair or unpause was performed.

- F51 (resolved 2 October 2026): Next.js now applies `Referrer-Policy: no-referrer` specifically to the saved-card API proxy path, preserving the backend route's privacy contract without changing the site's general referrer policy. The existing local HTTP matrix through `localhost:5002` passed all 24 missing/invalid-auth requests with HTTP 401, private/no-store and exact `no-referrer`. No valid customer session, token, provider call or database write was used.

- F50 (resolved for the fresh-share captured-receipt path, 2 October 2026): a fresh valid invoice share resolves a receipt only from that exact invoice's posted, unreversed allocation to a captured, unreversed Razorpay payment in the current mode. It returns that allocation's amount and provider references, without exposing another invoice's share-bound attempt or combined-payment split. An explicitly requested missing attempt ID remains not-found and cannot fall back to invoice history. The page checks status for both `PAID` and `NO_BALANCE` invoices and passes only an explicit `CAPTURED` snapshot to Custom Checkout. The paid receipt now exposes its Razorpay order/payment IDs under the accessible `Payment references` disclosure. The CI-only recovery fixture now models a real paid invoice with an ID; browser assertions scope the header badge and exact reference values. Local status suite passed 10/10, checkout page unit suite passed 10/10, TypeScript passed, and exact-SHA PR #10 CI run `36994761648` passed Backend and CRM, including the complete 25-case combined responsive browser suite, for commit `748192749a0a0c45984541158ace7b16aac37769`. This closes the targeted F50 recovery/receipt regression only; broader A01 route/provider acceptance remains partial. No local database, provider payment, message, share or production state was used.

- F49 (new, report-only provider coverage discrepancy): the documented Indian Visa insufficient-funds Test card followed by mock-bank Failure returned `BAD_REQUEST_ERROR`, `Payment failed`, source `gateway`, step `payment_authorization`, reason `payment_failed`, payment `pay_TiaUIouvF2u0GD`. The read-only Payments API confirmed these exact fields. This is real generic-failure coverage, not proof of the documented `insufficient_fund` branch. Preserve actual provider wording; do not translate or fabricate the expected reason. Official reference: https://razorpay.com/docs/payments/payments/test-card-details/.

- F48 (new, report-only): `publicShare.service.js` computes expiry using `Date.setDate(currentDay + ttlDays)`, which truncates fractional days. A QA call with `ttlDays: 1/24` created an immediately expired token; resolution returned null. Ordinary integer-day links are not shown affected. The subsequent QA link used integer-day creation followed by an exact one-hour timestamp, then was revoked after verification. No expiry implementation change is part of this acceptance turn.

- F47 (bounded A17 validation repair): local PostgreSQL session timezone is Asia/Kolkata and Prisma inbox timestamps are UTC `timestamp without time zone`. Plain `NOW()` comparison claimed a future retry immediately. Worker claim/expiry, lock and heartbeat SQL now explicitly use `NOW() AT TIME ZONE 'UTC'`. The existing-local-DB signed inbox/recovery regression reproduced the failure before repair and passed afterward, including future retry exclusion. No schema or production change. CI includes this regression under an India-timezone disposable role.

- F46 (new, report-only): real Test-key IIN lookups for `41002800` and `410028` both returned provider description `The requested URL was not found on the server.` through the documented installed SDK `/iins/:iin` request. Methods discovery succeeded separately. This does not prove activation is absent or that every IIN fails; do not infer either. Normal 6-8 digit validation remains as documented, with no automatic alternate-length fallback. Account/provider lookup acceptance remains unverified. Official reference: https://razorpay.com/docs/api/payments/cards/iin-api/.
- Bounded CI assertion repair: combined summary tests still assumed an invoice-inline Pay action and the old checkout label. Updated assertions to follow the dedicated checkout route and its `Continue` action, then validate captured confirmation, cleared summary and reload. No production behavior changed to satisfy the test.
Opened 30 September 2026. This is a findings register, not another implementation plan. The authoritative build scope remains `razorpay-custom-checkout.md`. Per user instruction, record new discoveries here without starting unrelated repair work. Tests, builds, browser checks, provider transactions, migrations and deployment are deferred.

## Current Repair Instruction

The user subsequently authorized repairing the existing registered findings F01-F27 with delegated agents. This supersedes their earlier repair deferral, but does not authorize runtime work or guessed provider contracts. Any further finding discovered during these repairs is recorded for later only, and must not expand this repair batch. Provider activation, actual device behavior and externally controlled evidence remain dependencies, not source fixes.

Repair tracking: all ten scoped repair workers have returned their work and were closed after source review. No unfinished delegated task remains to resume. Completed work is not reassigned merely to restart agents. Parent alone marks findings fixed after inspecting integrated source. No finding is closed by assigning an agent or merely writing a patch; runtime acceptance and unresolved provider contracts remain separate.

### Reviewed Repair Progress

- [x] F13 saved-card checkbox/reset portion: `SavedCards.tsx` centralizes consent state and parent notification for expiry, refresh, selection/removal, new-card changes, logout/errors and cleanup. Parent inspected the implementation. Explicit new-card `save: 0` is integrated; see the full source repair entry below. Runtime token acceptance remains deferred.
- [x] F14 persisted-ID recovery portion: `razorpay-saved-cards.service.js` fetches the reserved provider customer ID, verifies server-issued mapping/mode notes plus local payer/key binding, then conditionally promotes READY. Parent inspected source. Missing provider IDs remain review-only; no duplicate recreation or contact-based linking. Runtime/activation evidence remains deferred.
- [x] F22/F23 settlement binding source repair: exact customer/order/mode/amount/posted-allocation checks protect duplicate paths, and a one-entry outstanding plan uses combined settlement invariants. Parent inspected current checkout service. Provider binding/capture/refund checks now precede duplicate confirmation.
- [x] F25 receipt pagination portion: `orders.all` iterates documented count/skip pages; incomplete, malformed and repeated pages cannot prove receipt uniqueness. Worker recovery/escalation source has returned and its source integration review is complete; see the worker source repair entry below. F29 remains a separate active concurrency finding; it is not deferred awaiting Razorpay support.
- [x] F08 shared bank-transfer boundary source repair: parent wired and inspected the authoritative bank-transfer validator before duplicate confirmation and ledger posting; worker owner confirmed the contract. Provider/account/event acceptance remains deferred.
- [x] F09 Home-only Test OTP source repair: shared send controller rejects non-Home or non-allowlisted recipients in server-owned Test/development contexts before persisting or sending OTP. Parent inspected the gate; no OTP sent.
- [x] F24 failed-callback integration source repair: backend sanitizes and labels unsigned error diagnostics, logs them and returns bounded fragment evidence; `CallbackDiagnostic.tsx` displays it on invoice pages and removes the fragment. It never determines paid state. Parent source review completed; provider/browser acceptance remains deferred.
- [x] F26 frontend/discovery transport source repair: response handling retains Retry-After/backoff evidence, the flow handles offline transitions and submission-time connectivity, and the capabilities boundary forwards valid provider Retry-After values with CORS exposure. Missing provider headers remain missing; no runtime throttling test claimed.
- [x] F17 obsolete fixture source repair: existing tests now reflect issuer eligibility, current expiry input and capability/status shapes. Tests were edited but not executed; this is not a passing acceptance result.
- [x] F10/F20 source repair: superseded IIN/CRED requests clear busy state on edits; stale results cannot restore an old eligibility result. Parent inspected request sequencing and cleanup.
- [x] F12/F16 source repair: UPI discovery distinguishes pending/failed/empty states, offers retry and respects explicit Intent-disabled evidence. Retry refreshes and compares current REST/SDK identifiers and configuration before exposing choices. Parent removed an unused incompatible cross-worker prop; the checkout component owns its refreshed authoritative snapshot.
- [x] F13 full source repair: centralized consent resets plus explicit new-card save refusal and confirmed-consent-only saving are integrated. Actual token creation/reuse acceptance is deferred.
- [x] F15 source repair: documented formatter/IIN namespaces are reconciled; unknown, conflicting and excluded networks cannot submit. No BIN guesses or Discover-to-Diners inference.
- [x] F19 source repair: definitive bank review errors are permanent, transient capture/binding races remain retryable; displayed instructions are bound to the verified attempt/order/amount and effective expiry. Parent inspected service and UI binding.
- [x] F21 freshness/unknown source repair: mounted snapshots age, refresh on expiry/return/manual request and disclose unknown matches. Exact PSP/handle controller fields are supported; verified app-to-instrument identifiers remain a dependency, not an invented mapping.
- [x] F27 source repair: field-linked errors, contract-scoped contact collection and service-neutral wording are integrated. Accessibility/device acceptance has not run.
- [x] F07 source repair: fetched capture, customer/order ownership and amount/currency checks precede recording; simulator/authorized-only responses cannot create capture. Parent inspected the controller.
- [x] F25 worker source repair: durable bounded receipt recovery and deduplicated 15-minute Finance attention audit are integrated. The threshold is Hangers policy, not proof of failure; F29 remains separately deferred.
- [ ] F11 pricing disclosure: provider plan fields are preserved, but documented fee units/applicability have not been established. Reviewed Custom payment-method and build pages establish interest/calculator units, not processing-fee interpretation. No invented fee calculation or completed pricing claim.
- [x] F01 Custom same-order retry source: prepare reuses the bound failed attempt/order instead of creating a replacement. Shared status/prepare eligibility requires matching provider binding, an attempted unpaid order, complete unique failed payment evidence and unchanged amount/allocation. Unknown, authorized, captured or incomplete evidence blocks reuse. Retry audit preserves the old failure references; capture reconciliation remains authoritative. No runtime acceptance claimed. Existing Standard replacement policy remains F06 later review.
- [x] Integrate and review all ten assigned workers' returned source repairs. This closes the delegation/review task, not F01/F02/F03/F04/F05/F11 provider dependencies or deferred runtime acceptance.

### Bounded Contract Check

### Current Disposition - 2 October 2026

#### Artwork and Active UI Scope

The earlier note that logo sourcing and visual work were deferred to a separate UI phase is superseded by the user's later logo-inclusive checkout-design request. C05/C06/C10 visual implementation and acceptance are active work in the master plan, not deferred.

The user supplied support reply #21192410, confirmed IIN activation and authorized public Razorpay-hosted artwork. The supplied design README prefers Razorpay CDN assets; the user's later explicit instruction approved first-party provider artwork for the three cardless providers unavailable on Razorpay's CDN. The backend catalogue now maps all 45 returned banks, five enabled networks, six wallets, two Pay Later providers and all 14 observed Cardless EMI identifiers. The 15 previously uncatalogued enabled bank codes returned image/gif at their exact Razorpay CDN paths; PayZapp and Ola Money returned image/png. CASHe, TVS Credit and LiquiLoans are copied unchanged from their official sites into CRM public assets, and each source file URL is recorded with its catalogue entry. No third-party aggregator or generated mark is used. The UI has no duplicate frontend logo catalogue, generated bank URL, alternate image retry, initials tile, or text-as-logo substitute; an absent or failed image is simply hidden. Source and regression assertions cover all 14 provider rows. C10 remains partial only for active Home-checkout visual acceptance. No payment, invoice/order or database write occurred for this artwork repair. F11 EMI fee interpretation and F35 listener-detachment contract remain unrelated Razorpay-response dependencies.

New report-only finding: the current IIN documentation's supported-length table permits 6-8 digits for ordinary cards, but path guidance and `invalid_iin_length` examples describe six. Ticket #21192410 recommends eight; the user's subsequent instruction selects the documented 6-8 digit range. Frontend and backend now accept that range, with the browser prefix capped at eight and no guessed fallback. Later acceptance must verify the activated account's behavior and obtain clarification if it returns the documented length error. No live IIN request or test was run.

The prior artwork coverage gap for `cshe`, `tvsc`, and `liquiloans` is resolved with first-party provider logos under the user's explicit approval. Keep the returned methods selectable; if an image fails, hide the image without a substitute. Focused method-row source assertions cover all 14 observed providers, but active browser acceptance has not run against an approved Home checkout URL. Do not bypass the Home-only guard.

The user deferred EMI processing-fee interpretation (F11) pending Razorpay clarification and separately requires the SDK listener-detachment contract (F35) to be clarified. Logo asset sourcing is authorized and implemented for the observed catalogue, not pending a provider reply. These two remaining provider dependencies must not stop unrelated acceptance work. Current Orders API documentation describes multiple successful/failed attempts against one unpaid order and disallows further payments once paid. The previously claimed fresh-order warning could not be reproduced on re-read; F01's documentation-conflict rationale is withdrawn. Same-bound-unpaid-order retry is now written with authoritative evidence gates and retained historical payment references. Source review is not runtime acceptance or proof against every late-authorization race.

References: [Orders API](https://razorpay.com/docs/api/orders/create/), [Late authorisations](https://razorpay.com/docs/payments/payments/late-authorisation), [Custom payment methods](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/), [UPI Intent](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb).

On 30 September 2026, re-read [Custom payment methods](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/), specifically Fetch EMI Plans and Calculate EMI. The documented plan shape supplies issuer minimum amount, tenure and annual interest; the calculator returns the same units as its principal argument. This supports the existing SDK calculator and paise display conversion. It does not establish processing-fee field units, tax treatment or applicability. Preserving provider fields is implemented; interpreting them as an all-in customer charge remains F11, not a completed disclosure. No provider account request, test, runtime restart or deployment was performed.

Official evidence for these repairs: [Customer fetch](https://razorpay.com/docs/api/customers/fetch-with-id/), [Customer creation](https://razorpay.com/docs/api/customers/create/), and [Saved-card Scenario 1](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-1/). These references do not establish runtime acceptance.

| ID | Finding / dependency | Build treatment | Later follow-up |
| --- | --- | --- | --- |
| F01 | Earlier retry-conflict claim withdrawn after current Orders API re-read. | Same-bound unpaid-order retry implemented; no replacement order or timer-based proof. | Run the planned late-authorization/concurrency and complete-list evidence cases in the acceptance phase. |
| F02 | Historical discovery-stage gap: logo sourcing and identifier mapping were not connected to the revised UI. | Resolved in source: the backend catalogue maps all 14 observed Cardless EMI providers; the three Razorpay-CDN gaps use unchanged official CASHe, TVS Credit and LiquiLoans assets stored in CRM public assets with exact source URLs recorded. Source tests and mocked UI assertions cover all 14. C10 remains partial for active Home-checkout visual acceptance only. | No further logo-source task. Keep Home-only runtime acceptance separate; do not use a non-Home invoice to bypass the guard. |
| F03 | IIN, tokenisation and bank-transfer activation are not established by ordinary method flags. | Build documented adapters and authenticated boundaries; distinguish unverified activation and provider outage. | Verify account prerequisites and execute the planned method cases. |
| F04 | Actual UPI Intent/QR handoff and public webhook delivery cannot be established through mocked localhost checks. | Build the documented flows and consumers; retain mode/HTTPS gates. | Authorized supported-mode/device and public-delivery acceptance. |
| F05 | Customer Fee Bearer configuration and method-specific fee accounting are not yet verified. | Do not fabricate fees or alter commercial settings. Keep explicit configuration/evidence boundary. | Resolve CFB/Intent compatibility and principal-versus-charge accounting before enabling CFB. |
| F06 | Existing Standard checkout permits replacement of failed attempts and classifies all order-create 4xx responses as definitive rejection. | Do not refactor deployed Standard checkout during this custom-infrastructure build; apply stricter custom boundaries. | Review ambiguous duplicate/rate-limit responses and existing Standard behavior separately. |
| F07 | Existing authenticated customer payment verification accepts `authorized` before recording `CAPTURED` in `razorpay.controller.js`. | Keep this separate from the public Custom Checkout capture-only settlement path. | Review the existing customer payment endpoint and its ledger behavior separately. |
| F08 | Existing generic captured/order-paid webhook paths bypass bank-transfer-specific review checks. | Implement the planned virtual-account binding and credited-event consumer; retain this separate lifecycle finding. | Review generic event ordering against bank-transfer evidence before bank-transfer acceptance. |
| F09 | Shared customer OTP endpoints do not enforce the saved-card UI's approved Home-only Test contact restriction. | Saved-card Test UI uses the configured approved contact and blocks other inputs; no OTP sends were run. | Review the shared authentication endpoint's local test-contact policy separately. |

## Source Review Findings - 30 September 2026

The findings below form the now-authorized repair batch. Their original evidence remains preserved; completion records will distinguish reviewed source repairs from unresolved dependencies and deferred acceptance.

| ID | Finding / dependency | Source evidence | Later follow-up |
| --- | --- | --- | --- |
| F10 | Card edits invalidate IIN requests without consistently clearing eligibility busy state. | `RazorpayCustomCheckout.tsx`, eligibility request sequence and formatter change handler; independently identified by discovery and EMI reviewers. | Repair cancellation state and cover edits during lookup. |
| F11 | Returned EMI processing-fee fields are discarded by plan normalization. | `checkout/razorpay-sdk.ts`, issuer plan normalization; checkout EMI disclosure. | Preserve and disclose verified provider fee fields without calculating invented charges. |
| F12 | UPI app discovery conflates pending, failed and empty results; explicit Intent-disabled flags are incompletely reflected in UI availability. | `RazorpayCustomCheckout.tsx`, discovery callback and Intent submit gating. | Add distinct discovery states/retry and consistent authoritative capability gating. |
| F13 | New-card payload may omit explicit `save: 0`; checkbox resets may not clear parent save-request gating. | `RazorpayCustomCheckout.tsx`, new-card payload; `checkout/SavedCards.tsx`, expiry/refresh/new-card resets. | Align refusal payload and centralized consent reset state; do not equate capture with token creation. |
| F14 | Reserved saved-card customer mappings in CREATING/REVIEW lack safe reconciliation, even when a provider customer ID was persisted. | `razorpay-saved-cards.service.js`, mapping creation and READY gate. | Re-fetch and verify persisted IDs; no automatic customer recreation or phone-based linking. |
| F15 | Explicit network exclusion relies on successful IIN lookup; unknown network may reach submission. | `RazorpayCustomCheckout.tsx`, detected network and unavailable gating. | Establish verified formatter network mapping and enforce exclusions without guessed aliases/BIN rules. |
| F16 | REST/SDK agreement checks cover only some method flags; discovery retry retains the original REST snapshot. | `RazorpayCustomCheckout.tsx`, method comparison and SDK reload. | Coordinate refreshed authoritative inventories and resolve exact identifier disagreements. |
| F17 | Historical acceptance fixtures and master-plan gap prose do not consistently reflect current source. | EMI test uses removed expiry controls and lacks issuer eligibility; historical plan still describes shared EMI intersection and absent mapping. | Reconcile historical wording and update fixtures in the later authorized acceptance phase; do not run tests now. |
| F18 | Localhost/Test-only Custom flow gate prevents future authorized HTTPS device acceptance until its release gate is implemented/configured. | `checkout/CustomCheckoutFlow.tsx`, hostname/mode gate. | Preserve current safeguard; address only with explicit supported-mode release authorization. |
| F19 | Bank-transfer definitive review errors are retried before Finance review, and displayed instructions lack order-change/expiry invalidation. | Bank-transfer review errors and worker retry classification; checkout transfer state and returned `closeBy`. | Distinguish definitive review from transient races; bind displayed instructions to verified attempt/amount/expiry. Generic settlement bypass is already F08, not a new duplicate task. |
| F20 | CRED contact changes can invalidate eligibility without clearing its busy state. | `RazorpayCustomCheckout.tsx`, CRED sequence and current-request-only cleanup. | Synchronize cancellation and busy state; cover contact changes during lookup. |
| F21 | Mounted downtime status does not age/refresh, unknown matches are not disclosed, and PSP/handle constraints are not wired end to end. | Checkout downtime effect/rendering; scoped controller query allowlist; downtime matcher. | Honor snapshot expiry and unknown state, provide refresh, and map only verified instrument identifiers. |
| F22 | Early captured-receipt shortcut checks anchor membership but bypasses full combined amount/customer/allocation comparison. | `razorpay-invoice-checkout.service.js`, early duplicate settlement branch versus later stricter duplicate branch. | Require the same complete binding verification for every duplicate path. |
| F23 | One-entry outstanding allocation uses single-invoice settlement without all combined snapshot/customer/currency/cancelled-order checks. | Checkout settlement branch and `payment.service.js` single versus combined settlement. | Preserve outstanding-plan invariants even when only one invoice remains. |
| F24 | Failed POST callbacks discard diagnostic fields when successful signature fields are absent; UI diagnostic references are not fully displayed. | Public callback handler; `checkout/razorpay-sdk.ts` normalization; Custom flow diagnostic rendering. | Preserve sanitized provider error evidence separately from success-signature verification. |
| F25 | Ambiguous CREATING/REVIEW attempts without order IDs lack autonomous recovery, required 15-minute escalation is absent, and receipt uniqueness lookup is not paginated. | Payment reconciliation due-attempt selection; checkout receipt search using one count-100 page. | Implement durable bounded recovery/escalation and paginated uniqueness before acceptance. Never infer no payment from elapsed time. |
| F26 | Recovery ignores provider throttling headers; offline transition can leave previously enabled Pay unchanged until a later recovery trigger. | `checkoutRequest` response handling; Custom flow events/timers and checkout submit guard. | Preserve documented backoff and react to offline transitions without initiating replacement orders. |
| F27 | Aggregate validation lacks field-linked accessible errors; contact/email collection is unconditional; default business copy assumes cleaned clothes for every service. | `RazorpayCustomCheckout.tsx`, validation message, labelled inputs, contact form and introductory copy. | Associate errors with controls, collect only contract-required genuine identity fields and align copy with all existing billable services. |

No finding in this file is a passed acceptance case or evidence of a successful payment.

## Findings Backlog - Detailed Subtasks Deferred to the Findings Batch

The individual entries below are historical source findings and later discoveries. Their current resolution/provider-wait status is summarized in the disposition table at the top. Do not interpret old imperative wording (“repair”, “implement”, “verify”) as a request to interrupt the current A-item. For any new discovery, append a finding using the required detail above; do not create a new competing checklist in the master implementation plan.

### New Findings During Authorized Repair - Historical Entries

- **F28 - Local capabilities route unavailable in the serving runtime.** User screenshot shows `Route not found: GET /api/v1/public/invoices/:slug/payment/custom/capabilities`. Current source registers that exact route in `src/routes/public.routes.js`, mounted at `/api/v1/public` in `src/index.js`. Source inspection cannot determine whether an old backend process or a different proxy target served the request. Later runtime phase must identify the serving process/target and load the updated API; no server restart or runtime request performed in this source-only phase. This is not evidence of Razorpay rejection or a captured payment.
- **F29 - Order-create response can race autonomous recovery (historical discovery).** Recovery worker reported that provider creation attached its result unconditionally while recovery could transition CREATING to REVIEW. The current repair and acceptance subtasks are tracked under A14-a above; this older note no longer means “recorded for later.”

## Requested Ten-Agent Close-out - 1 October 2026

These are bounded source reviews, not runtime acceptance. All ten agents were started in two batches because the tool permits six concurrent threads. Returned reports do not constitute a clean completion claim. Newly identified unrelated defects remain report-only as instructed. F11 and F35 remain the two Razorpay-response dependencies; F02's source gate was later resolved by user authorization and implementation, while visual acceptance remains active in the master plan.

- **F30 - Invoice page fetch lacks an application timeout.** `checkout/page.tsx` awaits invoice loading without an AbortSignal timeout; status/profile fetches have explicit timeouts. A stalled invoice API can delay retry/back presentation. Page-review source evidence only; no stalled-server test run.
- **F31 - Mobile UPI discovery failure can expose desktop QR.** `RazorpayCustomCheckout.tsx` initializes mobile to false and classifies the device only inside successful array discovery. Rejected/malformed/missing discovery can leave desktop QR selectable on mobile. No device run; do not repair in this batch.
- **F32 - Custom order-create 4xx classification remains broad.** The Custom branch accepts structured provider 4xx as definitive rejection except selected statuses/description matches, unlike the narrow amount-validation predicate used for Standard. This can mark CREATE_FAILED without establishing absence of a provider order. Reported separately from F29; no further order/payment created.
- **F33 - Saved-card post-operation activation check incomplete.** Controller revalidates payer/session/mode/key after asynchronous operations but does not check current configuration availability before releasing SDK fields. Disabling activation under an unchanged key needs later review.
- **F34 - Method flag comparison omits some provider flags.** The capabilities allowlist drops debit_card, credit_card, prepaid_card and amex; frontend inventory comparison checks only mutually present keys. Exact applicable provider schema must be established before a later repair; no guessed fields added.
- **F35 - SDK handler detachment contract not established.** Payment/ready callbacks are mounted-guarded, but cleanup does not detach provider listeners. Reviewed Custom Build Integration documents on/once but no off/destroy contract; do not invent a teardown API. C07 listener lifecycle remains incomplete evidence, not a passed check.
- **F36 - Status polling loses provider Retry-After.** The inner status-lookup catch returns a successful envelope with providerLookupUnavailable but does not forward throttling/backoff evidence; frontend backoff is populated only by thrown transport errors. Remaining status portion of F26 is not closed by discovery-header forwarding.
- **F37 - Lost verification response may lose received success references.** Custom flow submits SDK success references but does not independently retain them for display if verify and later status requests both fail. Received references must remain labelled unverified; never use them to infer capture.
- **F38 - Callback diagnostic field omitted from display.** `CallbackDiagnostic.tsx` displays several provider fields but not field. Source repair F24 does not yet cover this display requirement.
- **F39 - Recovery observation timestamp incomplete.** Custom flow formats client receipt time in Asia/Kolkata without explicit timezone label and does not consume returned observedAt. Distinguish provider/server observation from browser receipt during later repair.
- **F40 - Webhook state update can overwrite a concurrent capture.** `razorpay-webhook-worker.service.js` reads the attempt and checks CAPTURED/REVIEW before an unconditional ID-only state update. A capture committed after that read can be overwritten by FAILED/AUTHORIZED. Parent inspected the reported read/update sequence; concurrency execution remains deferred. High-priority release gap; no repair performed under the report-only instruction.
- **F41 - Reconciliation success counters do not require confirmed capture.** `reconcilePagePayment` checks pending/duplicate results but not failed or final CAPTURED before incrementing recoveredCaptures. A disagreement between list and fetch can produce misleading run success. Parent inspected the branch; no runtime assertion performed.
- **F42 - Worker/reconciliation backoff omits provider throttling headers.** Reconciliation uses fixed short retry delays and worker schedules its own backoff without Retry-After. This is a backend extension of the remaining F26 transport gap; do not count frontend/discovery fixes as full coverage.
- **F43 - API-key rotation can invalidate virtual-account proof.** Bank-transfer association proof is recomputed with current API secret, while provider notes retain their original proof and persisted binding stores no proof version. Instructions for an existing account can become unavailable after key rotation. Parent inspected the HMAC and association boundary; no rotation performed.
- **F44 - Rollback handoff lacks an exact new-creation control and concrete checks.** C25 handoff refers to the existing runtime release mechanism without naming a mode-independent Custom creation control and exact health/status/reconciliation checks. Written instructions need a later concrete completion pass; no runtime settings changed.
- **F45 - Historical current-state prose contradicts integrated Methods adapter.** Master plan retains a not-implemented inventory/server statement while source/tracker show the adapter. Preserve the reported discrepancy for later reconciliation rather than resetting implemented work.

Ten-agent disposition: 10/10 returned and closed. The reviews establish source evidence and explicit gaps, not passing tests, release readiness or full objective completion. The subsequent user instruction authorized the bounded F30-F45 source repair batch; earlier report-only wording is historical, not the current instruction.

### Local Route Follow-Up - 1 October 2026

### Authorized Repair Integration - 1 October 2026

#### Bounded Source Repair Disposition

This table records implementation/source inspection only. No entry asserts tests, provider acceptance or release readiness.

| Finding | Source disposition | Evidence boundary |
| --- | --- | --- |
| F30 | Written: invoice fetch timeout. | checkout/page.tsx; stalled-request acceptance deferred. |
| F31 | Written: device classification independent of app discovery. | RazorpayCustomCheckout.tsx; real device acceptance deferred. |
| F32 | Inspected: definitive create rejection limited to structured amount-validation evidence. | razorpay-invoice-checkout.service.js; ambiguous generic 4xx remains unresolved rather than proving no order. |
| F33 | Inspected: post-operation payer/session/mode/key/availability recheck. | razorpay-saved-cards.controller.js; configuration operation deliberately permits unavailable state for discovery. |
| F34 | Written: documented card flags retained; SDK options must be API-enabled, API-only providers stay hidden. | capabilities service and RazorpayCustomCheckout.tsx; full flag/device matrix deferred. |
| F35 | Unresolved provider contract. | No documented listener-detachment API established; mounted guards are not claimed as detachment. |
| F36 | Inspected: throttled status response forwards Retry-After through paymentApiError. | public.controller.js; persisted attempt preserved. |
| F37 | Inspected: sanitized SDK success references retained in memory as unverified. | CustomCheckoutFlow.tsx; no signature/raw response retained for display. |
| F38 | Written: callback diagnostic field displayed. | CallbackDiagnostic.tsx; accessibility/runtime acceptance deferred. |
| F39 | Written: explicit server observation/browser receipt distinction and IST labels. | CustomCheckoutFlow.tsx; actual clock/refresh acceptance deferred. |
| F40 | Written: attempt row lock before worker terminal-state inspection/update. | razorpay-webhook-worker.service.js; concurrent execution deferred. |
| F41 | Inspected: only confirmed CAPTURED settlement contributes recovered capture count. | razorpay-payment-reconciliation.service.js; no list-only success inference. |
| F42 | Written: provider delay respected in immediate/durable retry paths and persisted full-scan deadline. | provider-retry-after.js and worker/reconciliation services; cross-process acceptance deferred. |
| F43 | Inspected: exact persisted VA binding survives secret rotation; first-time binding still requires proof. | razorpay-bank-transfer.service.js; never-bound historical proof remains insufficient. |
| F44 | Written: mode-independent disable switch plus exact rollback instructions. | capabilities service, .env.example and master handoff; no runtime flag changed. |
| F45 | Written: stale inventory and authorization prose corrected. | Master plan; historical entries retained as history. |

Historical discrepancy (withdrawn after re-reading the current Orders API documentation): an earlier backend review reported a fresh-order retry warning that appeared to conflict with same-order retry notes. The claim could not be reproduced; F01 now records the corrected disposition. Do not treat this as a current finding or open follow-up.

- F40: worker state transitions lock the matching persisted attempt before terminal-state inspection and update. F41: reconciliation does not count a pending, failed or non-CAPTURED settlement result as a recovered capture. Source inspected; concurrency execution deferred.
- F42: shared Retry-After parsing supports seconds and HTTP dates from provider response headers or preserved error details, rejecting unsafe date ranges. Webhook retry and per-order reconciliation schedules respect the longer provider delay; immediate reconciliation retries are bounded. Full-account scan errors persist providerRetryAt in the existing reconciliation-run summary; later runs check a future deadline before provider requests. Source implemented without a schema change. Cross-process/runtime acceptance remains deferred.
- F44: mode-independent RAZORPAY_CUSTOM_CHECKOUT_DISABLED control added to assertCustomMode and configuration examples. Release handoff names this control, the separate Live flag, frontend rebuild requirement, retained recovery paths and exact later health/status/webhook/reconciliation checks. It does not claim to remotely cancel an already prepared SDK payment. F45: stale REST-inventory-not-implemented prose corrected.
- F35 remains a provider-contract limitation, not an invented teardown implementation. No tests, migrations or deployment performed for this source repair integration.

- 1 October source continuation: SDK success/error/ready listeners now dispatch through nullable callbacks cleared on effect cleanup. This releases component callback references and keeps late events inert after cleanup without calling an undocumented provider API. It does not remove provider listeners or close F35; unmount/reinitialization acceptance remains deferred. Source inspected only; no tests or runtime checks run for this change.
- Historical 1 October design-reference note (superseded): the user-supplied Standard Checkout exposed Razorpay-hosted card-network, app and bank assets. At that point they were only in the preview and no Custom Checkout configuration was approved. The user subsequently authorized the observed Razorpay-hosted assets and source integration recorded above. This is not a stable Razorpay asset API or merchant-method activation contract; the dummy preview remains separate from production checkout acceptance and does not authorize UPI Collect.

- F28 serving-route symptom is cleared in the observed local runtime. The exact Chrome invoice slug's capabilities request through localhost:5002 returned success with TEST capabilities. The existing API on port 5001 reported ready, database ok, and localQaProfileMatches true. No migration, payment, production operation or database write was performed for this check.
- Chrome no longer displays Route not found. It displays the separate SDK/backend method-inventory disagreement safeguard. Payment remains blocked; this is not complete checkout acceptance. Do not bypass the disagreement or report that a payment can proceed.
- Follow-up diagnosis: SDK cardless_emi omitted walnut369 and instant_emi while the account Methods API included them. Exact-set equality incorrectly blocked every method. Comparison now accepts the SDK's narrower inventory only when every offered option is API-enabled; UI continues using SDK ready methods and does not add API-only providers. Enabled SDK flags explicitly disabled by the API still block. Source: Custom Build Integration section 1.2 and Methods API. Temporary development diagnostics removed.
- Source repair handoffs received for F30-F34, F36-F39 and F43; parent integration review remains required. F35 remains unresolved because no documented provider listener-detachment contract was established. F11 remains pending provider clarification; F02 is resolved at the source-authorization stage, not at full C10 acceptance.

### Acceptance Agent Close-Out - 1 October 2026

F55 authorized repair (1 October 2026): shared backend safeText now redacts standalone three-digit-or-longer values, labelled CVV/OTP/password/API credential/signature text (including quoted JSON labels), protected card/token/customer IDs, Razorpay key IDs and 64-character hex signatures. Checkout error extraction uses that sanitizer instead of its separate weaker regex. Webhook code/source/step/reason reject values changed by redaction rather than persisting numeric sensitive data as a code. SDK fields and checkout HTTP error messages use corresponding client-side redaction. Safe structured order/payment IDs and ordinary documented codes/reasons remain intact. Six backend redaction tests and one SDK privacy test pass; related capabilities/refund/dispatch suite passes 30 cases, and all 109 release regressions pass on installed Node 24.14.0. CRM TypeScript passes. CI now runs both privacy suites. This closes the enumerated F55 bypasses at their extraction boundaries, not every possible unlabelled secret, historical stored diagnostic, telemetry exporter or all A22 requirements. No historical data purge or production operation performed.

All ten acceptance agents returned and were closed. Four scoped regression files add eleven passing unit cases; these do not establish real-device, provider or production acceptance. Newly discovered issues below remain report-only under the bounded-scope instruction.

- **F59 - Accessibility acceptance remains incomplete.** Wrapping form labels include dynamic validation/network text; saved-card Remove controls now have card-specific accessible names using only the network and last four digits. Focus continuity when a form is replaced by a captured/error state is unverified. Existing labels, legends, invalid-field focus and visible outlines are source evidence, not VoiceOver, contrast, 200% zoom or long-error acceptance. The accessible-name source repair is recorded in the 2 October local verification entry; no complete UI acceptance is claimed.
- **F60 - Custom release is not a flags-only operation (partially resolved, 2 October 2026).** The stale claim that no Custom migration helper exists is corrected: `scripts/deploy/migrate-custom-checkout.cjs` supports only the two checksum-pinned Custom migrations, requires the exact current-main revision and explicit `--approved-custom-schema`, rejects any target other than `hangers_prod` on localhost, refuses unrelated/failed pending migrations, verifies a custom-format backup, and checks the resulting schema. `.github/workflows/deploy-production.yml` gates this separately from combined-checkout migration. Focused policy/workflow tests pass 3/3. The frontend now has a separate default-off Live build flag and checks HTTPS, exact `NEXT_PUBLIC_SITE_URL` host, and `rzp_live_` key; Test remains restricted to `localhost` and `rzp_test_`, and Test orders still require the approved test contact. The backend's independent Live-enable and global-disable gates remain authoritative. Mode-gate unit tests pass 2/2; CRM type-check and production build pass. Code rollback instructions are present in `docs/production-deployment.md`; rollback is a reviewed forward code revert, not automatic and not a database rollback. Remaining: exact release SHA/approval, authorized production backup and schema application, production environment configuration, explicit Custom activation, and post-deployment payment-recovery/health checks. No Live flag was enabled and no production change or Live payment was made. This source/test repair does not close C25/A24 or authorize deployment.
- **A11 audit boundary:** saved-card activation is operator attestation tied to the exact mode/key, not a provider activation response. Auth/session ownership and consent checks exist; positive Home authentication, save/reuse/delete and CVV-less issuer acceptance remain unverified while activation is disabled. Do not mark this row passed from source inspection.

## Resolved Finding Record

### [x] F66 - SDK readiness retry restores the methods UI in regression coverage

- **Original symptom:** After the SDK `ready` timeout correctly hid payment choices, selecting “Retry loading methods” left the CRM browser test unable to find the returned card radio.
- **Original impact:** A customer could remain unable to choose a method after transient SDK readiness failure; the first observed exact-SHA CI run was red.
- **Root cause and bounded repair:** The checkout correctly waited for a fresh `ready` event. The retry test's Razorpay SDK mock omitted the `setFormatter()` dependency, so the refreshed card form could not initialize. The test mock now supplies `setFormatter()`; no production fallback or premature method visibility was introduced. Source/test change: `hangers-crm/tests/invoice-checkout/razorpay-ab-responsive.spec.ts` at `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30`.
- **Acceptance evidence:** Exact-SHA Actions run [37009102219](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37009102219) passed both Backend and CRM jobs. The CRM `Verify combined-checkout responsive UI` step passed all 25 browser cases, including the readiness-timeout/retry case. Earlier red run [37004349213](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37004349213) remains historical, not current status.
- **Scope boundary:** This closes the CI regression only. Real Razorpay account availability refresh and broader provider/device acceptance remain partial under A04; this record does not mark A04 complete.
