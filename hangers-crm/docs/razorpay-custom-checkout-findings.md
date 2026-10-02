# Custom Checkout Build Findings

## Current Findings Disposition - 3 October 2026

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
| Dependency/disposition | Razorpay response, merchant activation, supported device, unavailable evidence, or none. Only F11 and F35 are currently deferred for Razorpay responses. |

For a finding required by the active A-item, tick its subtasks as they are verified and close it before advancing to the next A-item. Unrelated findings stay open for the later findings phase. A source edit alone is not completion.

This is a chronological evidence register; the bullets below are the current disposition. Do not read older headings such as “Deferred”, “Current Repair Instruction”, or a dated “pending CI” sentence as today's status without checking this section and the master plan's Current Audited Task Register. Preserve dated evidence, but the newest exact-SHA/runtime evidence controls. Checkboxes in Reviewed Repair Progress mean source work was reviewed; they do not mean the linked A01-A24 acceptance is complete.

**New-finding workflow:** any issue discovered while completing an A01-A24 task goes here under that A-item as an unchecked, lettered subtask with symptom, reproducible evidence, impact/risk, bounded fix, and acceptance criteria. If it affects acceptance or safe completion of the active A-item, resolve and verify it before advancing. Otherwise leave it recorded for the later findings phase; do not interrupt the active task with unrelated repairs. Resolved findings remain checked here with closure evidence; dated failure notes stay historical.

| Finding(s) | Current disposition | What remains |
| --- | --- | --- |
| F01-F02 | Earlier claims superseded: same-order retry source path is implemented; approved Razorpay-hosted artwork mapping is integrated. | Retry lifecycle acceptance remains in A13-A15; active UI artwork review remains in A03/C10. |
| F03-F09 | Source boundaries were repaired or kept explicitly separate as recorded below; no activation is inferred. | A11/A12 activation/lifecycle and A17 delivery acceptance remain active. |
| F10, F12-F16, F19-F27, F30-F34, F36-F45 | Bounded source repairs are recorded in Reviewed Repair Progress and Authorized Repair Integration. Older “not repaired” statements are historical. | Relevant runtime/provider/accessibility/recovery portions stay open under the master task register. F17's test fixture edits are not themselves test evidence. |
| F28 | Cleared in the observed local runtime; later local HTTP evidence confirms the registered capabilities route responds. The earlier screenshot was not proof of a missing route. | None for the route symptom; broader checkout method/runtime readiness remains A04. |
| F29 | Active source/concurrency review item; it is not a Razorpay-support deferral. | Verify the order-create/recovery race and its bounded concurrent acceptance case before calling it closed. |
| F11, F35 | **The only two items deferred pending Razorpay support replies.** F11 asks for authoritative EMI processing-fee units/applicability; F35 asks whether/how Custom Checkout provider listeners can be detached. | Record each exact reply, update its contract, then finish its bounded acceptance. Do not block unrelated tasks. |
| F18, F46, F48, F49, F52, F57-F59, F63-F65 | Active, conditional, or report-only evidence gaps; none is deferred awaiting the two Razorpay replies. | Follow the finite A01-A24 register. Do not infer unsupported behavior or provider guarantees. |
| F47, F50-F51, F53-F56, F61-F62 | Resolved for the specific defect/contract scope described in their dated entries. | Broader A17/A22/A23 acceptance is not closed by these scoped repairs. |
| F60 | Partially resolved release-control gap. | A24 still needs green exact-SHA CI, review/approval and separately authorized release/migration/post-check gates. |
| F66 | Resolved at source/test SHA `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30`; both exact-SHA CI jobs passed in run [37009102219](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37009102219). | Broader live account readiness/runtime acceptance remains under A04; this scoped CI regression is closed. |

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

**A01 verification status (3 October 2026):** The earlier note calling A01 CI verification blocked by the read-only smoke-check rule was incorrect and is withdrawn. That rule was supplied under “Codex tool update checks”; these are product integration tests, not tool smoke checks. Exact-SHA PR #10 run [37055637233](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37055637233), commit `9d1ce4332d8dd411cfbd9f73a611db66bbd273d5`, passed Backend and CRM. Its disposable `hangers_test` combined-checkout integration passed 6/6, and the other A01-related receivables and journey CI checks passed. A01 and findings A01-a through A01-g are closed. No local or production database was changed. A02 is closed. A03's two manual findings are deferred pending an existing Test checkout; A04 is active under the finite A-item rule.

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

- **Status:** Deferred; waiting for a valid existing Test checkout to be opened in Kevin Chrome.
- **Evidence:** Source inspection confirms labelled form controls, a `fieldset`/`legend` payment-method group, `aria-invalid`/`aria-describedby` field errors, visible focus styling, and status/alert roles. Existing automated browser tests verify keyboard radio selection and invalid-card focus/error association. Existing Kevin Chrome evidence is an accessibility-tree inspection, not a VoiceOver session; it does not prove what a screen-reader user hears when methods load, an error/retry appears, the checkout changes to pending, or capture confirmation replaces the form. F59 independently notes focus continuity is unverified. Current Kevin Chrome inventory has no checkout tab open, so no read-only manual session was available in this pass.
- **Impact:** A screen-reader user may miss a dynamic payment-state change or lose their place when the form is replaced, despite correct static labels and automated DOM assertions.
- **Bounded acceptance:** On an already-open valid Test checkout in Kevin's Chrome profile, use macOS VoiceOver to traverse the heading/progress, invoice and amount summary, payment-method group, required fields, primary action, error/retry state, pending/status action, and captured confirmation if an existing captured fixture is available. Record the exact observed announcements and focus destination for each available state. Do not create a new invoice/share/order, submit payment, or treat DOM accessibility-tree output as VoiceOver evidence. If a required state is unavailable, record that exact state as deferred; do not synthesize payment state in local data.
- **Acceptance subtasks:**
  - [ ] Obtain read-only access to a currently valid Test checkout without creating or changing a fixture.
  - [ ] Record VoiceOver announcements and focus continuity for the available required states.
  - [ ] Fix only a reproduced A03 accessibility defect and run its focused regression once; otherwise record the observed pass and close this finding.
- **Dependency/disposition:** User-controlled fixture/session availability. No payment submission is required. Do not create a replacement fixture; A04 proceeds while this evidence is deferred.

#### A03-b - Active-form zoom, reflow and contrast are not verified at the written level

- **Status:** Deferred; waiting for a valid existing Test checkout to be opened in Kevin Chrome.
- **Evidence:** CI checks no horizontal overflow at 320/720/1440 CSS-pixel viewports, active payment-method visibility and keyboard selection. A 720px viewport is not a browser-zoom test. The 200% Chrome observation covered a paid confirmation, not the active payment form. Existing contrast measurements cover pending/paid screens and selected controls, not all normal text and interactive states in the active form. CSS/source inspection is not rendered-page acceptance. Current Kevin Chrome inventory has no checkout tab open, so no read-only active-form inspection was available in this pass.
- **Impact:** A customer using magnification or needing higher contrast could encounter clipped fields/actions or unreadable active-form content even though the paid/pending and narrow-viewport cases pass.
- **Bounded acceptance:** On the same already-open valid Test checkout, inspect the active form at 200% browser zoom and 320 CSS-pixel reflow; verify no horizontal scrolling, clipped/covered fields, hidden required actions, or obscured keyboard focus. Measure normal-text contrast in the active form and its error/disabled/selected states against rendered backgrounds against the plan's 4.5:1 target. Record one set of screenshots/measurements and exact browser zoom/viewport. Merchant header branding is already in the A03 scope; payment-network artwork belongs to A05/C10 and performance belongs to A23, so neither reopens this finding.
- **Acceptance subtasks:**
  - [ ] Obtain read-only access to a currently valid Test checkout without creating or changing a fixture.
  - [ ] Record active-form reflow, visible controls/focus and rendered contrast at the specified zoom/width.
  - [ ] Fix only a reproduced A03 layout/contrast defect and run its focused regression once; otherwise record the observed pass and close this finding.
- **Dependency/disposition:** User-controlled fixture/session availability. Do not create an invoice/share/order or submit payment for this check. A04 proceeds while this evidence is deferred.

## A04 Findings

#### A04-a - SDK listener detachment cannot be implemented without a documented provider contract

- **Status:** Deferred pending Razorpay support response F35.
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

**Prior exact-SHA source reconciliation:** HEAD `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30` ran as Actions run [37009102219](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37009102219); Backend and CRM both succeeded. Its 25 browser cases covered readiness timeout/retry but not script-load failure; that gap is now closed by A04-b above. F66 is resolved for that prior regression. Earlier red run [37004349213](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37004349213) is retained as historical evidence. F65's former “outbox CI pending” statement is superseded: the disposable-DB journey/webhook/outbox integration passed in Backend CI. Read-only local `pg_isready` and `prisma migrate status` observations are historical snapshots, not claims about current local service state.

### A05 Findings

#### A05-a - Test IIN lookup fails and Razorpay's length instructions conflict

- **Status:** Deferred pending provider clarification; no unsupported fallback.
- **Evidence:** Prior read-only Test-key lookup for `41002800` and `410028` returned Razorpay's `The requested URL was not found on the server.` response through the documented SDK endpoint; see F46. The current official IIN page's supported-length table says non-tokenized IINs are 6–8 digits, but its path-parameter explanation says non-tokenized IINs are 6 digits and tokenized IINs are 9 digits. Current frontend sends up to the first 8 PAN digits and accepts 6–8 for non-tokenized lookup; it does not send a full PAN. Official reference: https://razorpay.com/docs/api/payments/cards/iin-api/ (reviewed 3 October 2026).
- **Impact:** Custom card eligibility/network and issuer identification cannot be represented as provider-verified when the Test endpoint errors; choosing one conflicting documented length or adding an alternate route would be a guess.
- **Bounded remedy:** Keep the documented existing 6–8 input boundary and fail closed when the lookup is unavailable. Resume only when Razorpay clarifies the accepted length and the 404 cause or a successful read-only provider response establishes the contract; then run one focused lookup-contract regression. No payment, local data write or alternate IIN endpoint.
- **Acceptance subtasks:**
  - [x] Confirm the current implementation sends only a 6–8 digit prefix and rejects unknown/error responses without guessing a network.
  - [x] Recheck the current official IIN page and record the conflicting length statements.
  - [ ] Record provider clarification or successful Test lookup for the supported input.
  - [ ] Add/update the focused contract regression only after that authoritative answer; run it once.
- **Dependency/disposition:** Razorpay clarification for F46 and the official page's conflicting length language. No code change is justified until resolved.

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

### A07 Findings

#### A07-a - UPI Intent was not disabled for Customer Fee Bearer

- **Status:** In progress; documented guard and focused regressions added, exact-SHA CI pending.
- **Evidence:** The official Razorpay UPI Intent mobile-web page states UPI Intent is not available on the Customer Fee Bearer (CFB) model. The UI previously treated only explicit `upi_intent` method flags as authoritative and could expose discovered app choices when the configured fee bearer was `CUSTOMER`.
- **Impact:** A customer on CFB could be offered an Intent flow that Razorpay documents as unavailable, despite the UI otherwise following the returned method list.
- **Bounded remedy:** Derive one `upiIntentUnavailable` guard from the provider's explicit method flags plus the already-loaded fee-bearer configuration. When fee bearer is `CUSTOMER`, disable only the Intent-specific mobile app path; do not suppress desktop UPI QR or unrelated methods. Do not infer the fee-bearer value when it is `UNVERIFIED`.
- **Acceptance subtasks:**
  - [x] Confirm the provider's documented CFB restriction and trace the UI method gate.
  - [x] Add the CFB guard without changing desktop UPI QR or other methods.
  - [x] Add focused unit cases for CFB and either returned method snapshot disabling Intent.
  - [ ] Run exact-SHA CI once and record the result; rerun only if a concrete failure is fixed.
- **Dependency/disposition:** Exact-SHA CI. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/ (reviewed 3 October 2026).

#### A07-b - Installed-app Intent and QR handoff/return lack supported-device acceptance

- **Status:** Deferred pending a supported-device Test checkout session.
- **Evidence:** Existing browser tests mock supported-app identifiers and `createPayment`; they prove request construction and fail-closed UI, not that Android/iOS launches an installed UPI app or returns through success, cancellation or timeout. Desktop QR is likewise mocked; no user-device handoff was run in this pass.
- **Impact:** A browser mock cannot prove operating-system app switching, the bank/UPI app result, or return to the checkout page. No actual handoff success or failure is claimed.
- **Bounded remedy:** On an already-existing authorized Test checkout and supported device, run one matrix for an available Android/iOS app and desktop QR: initiate only on user click; observe handoff; return/cancel once; verify the existing attempt status before any retry. Do not create a new order or submit a Live payment for this evidence.
- **Acceptance subtasks:**
  - [x] Review the official device-specific app list and the existing mocked coverage.
  - [ ] Capture one supported Android/iOS Test Intent launch and return/cancel result.
  - [ ] Capture one desktop Test QR render/scan-return result.
  - [ ] Record device/browser, selected identifier and resulting provider references/status without exposing customer secrets.
- **Dependency/disposition:** User-controlled supported device and existing Test checkout. No new test invoice/order/payment is created by this deferred finding.
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

**F65 current-status correction:** the following dated F65 paragraph's reference to SHA `8b768dd` and red CRM CI is historical. The current source/test SHA and all-green CI are `4c9374b1c9c7dcf4f75b9405b5d94b084f8efd30` / run `37009102219`; the observability limitations listed there remain open.

## Acceptance Findings - 1 October 2026

- F65 (observability/correlation; updated 2 October 2026): source review found fragmented ActivityLog/AuditLog, signed webhook inbox/worker outcomes and notification outbox stages, but no single durable parent across retries. Current implementation adds nullable `paymentJourneyId` to checkout attempts; new attempts receive an opaque Hangers ID, legacy attempts acquire one on their next logged transition using a conditional update/re-read, and each `auditAttemptTransition` inserts an allowlisted `RazorpayPaymentJourneyEvent` in the same transaction. Request IDs remain per HTTP hop; W3C Trace Context validates incoming version-00 `traceparent`, creates a distinct server span, and worker operations without HTTP context receive independent trace/span IDs. Provider order/payment IDs are included only after they exist and pass format validation. Confirmed retry, webhook outcomes and payment-notification outbox queue/worker outcomes now correlate to the same attempt/journey; notification logs distinguish provider acceptance from actual handset delivery. Card data, CVV, OTP values, full contacts, tokens, secrets, raw payloads and unrestricted error text are excluded from the new sink. Focused privacy/trace tests are recorded as 10/10 and the Backend release-suite evidence as 137/137. At current exact SHA `8b768dd`, the Backend CI job passed the disposable migration, webhook/retry and outbox integration checks in run `37004349213`; the overall workflow is red because CRM failed F66. Read-only Prisma status finds the local journey-event migration pending on reachable `hangers_db`. Still partial: browser lifecycle telemetry, durations/aggregate metrics, injected DB/logger failure behavior, retention/access controls, historical records, local migration application and production runtime remain open. Existing ActivityLog/AuditLog may still include separate diagnostics subject to their sanitizer; this new sink is stricter. References: https://docs.adyen.com/account/payments-lifecycle/ ; https://www.w3.org/TR/trace-context/ ; https://opentelemetry.io/docs/specs/otel/logs/.

- F61 (resolved 2 October 2026): Razorpay's Custom Checkout payment-method contract documents issuer-keyed `emi_plans` with `min_amount` and a `plans` object; the reviewed contract does not establish `emi_options` or array-shaped responses. The checkout now consumes only the documented structure and fails closed for those alternate shapes. Added focused unit regressions and a CI step. Official source: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/. This addresses response parsing only; actual issuer eligibility, calculator units, fee-bearer terms and Test-mode provider acceptance remain in A09/C14 and F11.
- F62 (resolved 2 October 2026): Razorpay's standard six-digit IIN example omits `tokenised_iin`; the tokenised nine-digit example includes `true`, and the entity example documents a boolean. The normal-IIN-only route therefore continues to accept an absent field, but now rejects any present value other than boolean `false` (including `true`, `null`, or string values). Tests cover omitted, `false`, `true`, `null`, and string cases. Official source: https://razorpay.com/docs/api/payments/cards/iin-api/#iin-entity. This closes response-schema ambiguity at this endpoint; it does not establish issuer/EMI eligibility or provider acceptance.
- F63 (current SDK artifact inspected; public contract still unverified, 2 October 2026): Razorpay's UPI Intent page recommends `getSupportedUpiIntentApps()` but does not document its resolved JavaScript type. Read-only inspection of the then-served official `https://checkout.razorpay.com/v1/razorpay.js` artifact (SHA-256 `68050c39082368f9959872696abfa6d54b6182b965dd46c13e62c5db928b6a04`, 327573 bytes) found `getSupportedUpiIntentApps` returning `Promise.resolve(e)`, where `os()` constructs unique string identifiers with `Array.from(new Set(t))` and normalizes `google_pay` to `gpay`. The existing `Promise<unknown>` boundary and runtime array/string guard match this observed artifact. Because the CDN URL is unversioned and the docs do not promise a stable type, retain the guard; this source observation does not count mocks as supported-device or provider-payment acceptance under A07. No SDK script was executed and no payment was initiated. Official sources: https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/ and https://checkout.razorpay.com/v1/razorpay.js.
- F64 (new, report-only validation traceability question; 2 October 2026): the official Custom Checkout guide and payment-method page specify the card payload fields, show a 3-digit CVV example, and the Test guide says to use any random CVV and a future expiry. They do not define the public `setFormatter`/`formatter.add`/`isValid` JavaScript contract or detailed per-field validation rules. The current card form uses the Razorpay formatter for card number/expiry, applies local month/year shape and non-expiry checks, and only requires CVV to be nonempty; it does not impose a guessed brand-specific CVV length. This is not evidence of a demonstrated payment defect. Keep A05/C09 partial until the formatter contract and supported validation boundary are attributable to official provider documentation or confirmed behavior; do not add brand-specific length/prefix rules or claim provider-backed field validation from mocks. Sources: https://razorpay.com/docs/developer-tools/integrations/custom-checkout/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/ ; https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/test-integration.

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

The user supplied support reply #21192410, confirmed IIN activation and authorized public Razorpay-hosted artwork. F02's source/approval gate is resolved for the observed catalogue: four card networks, six UPI app brands and four wallet brands are recorded in `hangers-backend/src/services/razorpay-brand-assets.js`, and the checkout renders them by exact enabled/discovered identifiers. This is not provider acceptance or exhaustive artwork coverage; unknown identifiers stay visible as text and C10 remains partial until the active checkout is visually verified. F11 EMI fee interpretation and F35 listener-detachment contract remain the two Razorpay-response dependencies.

New report-only finding: the current IIN documentation's supported-length table permits 6-8 digits for ordinary cards, but path guidance and `invalid_iin_length` examples describe six. Ticket #21192410 recommends eight; the user's subsequent instruction selects the documented 6-8 digit range. Frontend and backend now accept that range, with the browser prefix capped at eight and no guessed fallback. Later acceptance must verify the activated account's behavior and obtain clarification if it returns the documented length error. No live IIN request or test was run.

Artwork coverage gap: discovery may return app identifiers for which the observed catalogue has no logo (for example BHIM or super_money). Preserve those supported choices as labelled controls; do not guess asset paths, hide supported apps or invent artwork. The active UI acceptance must verify current rendering and responsive design; the public dummy preview alone is not evidence that the production checkout is complete.

The user deferred EMI processing-fee interpretation (F11) pending Razorpay clarification and separately requires the SDK listener-detachment contract (F35) to be clarified. Logo asset sourcing is authorized and implemented for the observed catalogue, not pending a provider reply. These two remaining provider dependencies must not stop unrelated acceptance work. Current Orders API documentation describes multiple successful/failed attempts against one unpaid order and disallows further payments once paid. The previously claimed fresh-order warning could not be reproduced on re-read; F01's documentation-conflict rationale is withdrawn. Same-bound-unpaid-order retry is now written with authoritative evidence gates and retained historical payment references. Source review is not runtime acceptance or proof against every late-authorization race.

References: [Orders API](https://razorpay.com/docs/api/orders/create/), [Late authorisations](https://razorpay.com/docs/payments/payments/late-authorisation), [Custom payment methods](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/), [UPI Intent](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb).

On 30 September 2026, re-read [Custom payment methods](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/), specifically Fetch EMI Plans and Calculate EMI. The documented plan shape supplies issuer minimum amount, tenure and annual interest; the calculator returns the same units as its principal argument. This supports the existing SDK calculator and paise display conversion. It does not establish processing-fee field units, tax treatment or applicability. Preserving provider fields is implemented; interpreting them as an all-in customer charge remains F11, not a completed disclosure. No provider account request, test, runtime restart or deployment was performed.

Official evidence for these repairs: [Customer fetch](https://razorpay.com/docs/api/customers/fetch-with-id/), [Customer creation](https://razorpay.com/docs/api/customers/create/), and [Saved-card Scenario 1](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-1/). These references do not establish runtime acceptance.

| ID | Finding / dependency | Build treatment | Later follow-up |
| --- | --- | --- | --- |
| F01 | Earlier retry-conflict claim withdrawn after current Orders API re-read. | Same-bound unpaid-order retry implemented; no replacement order or timer-based proof. | Run the planned late-authorization/concurrency and complete-list evidence cases in the acceptance phase. |
| F02 | Historical discovery-stage gap: approved network/app artwork source and identifier mapping were not yet established. | Resolved for the user-authorized observed Razorpay-hosted catalogue; the active C10 visual-coverage check remains partial. | Verify active checkout rendering and preserve labels for supported identifiers without a mapped asset. |
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
- **F29 - Order-create response can race autonomous recovery.** Recovery worker reported that provider creation attaches its result unconditionally while recovery can transition CREATING to REVIEW. Recorded for later under the explicit new-findings rule; no additional repair assigned. Acceptance must inspect the interaction before release.

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
