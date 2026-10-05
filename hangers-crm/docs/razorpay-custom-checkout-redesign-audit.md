# Custom Checkout Redesign Audit

Updated: 5 October 2026. Checkout redesign implementation and its finite UI acceptance suite are complete. Product implementation commit: `3514f3a832615f50263f9ab0f05523a332b955d8`; exact tested PR #10 head: `08868568948b8d3590823022b26a3b0fb6790a3b`. This is not a production deployment, provider acceptance, or a restart of A01-A24.

## Scope and Evidence

The current supplied folder `/Users/kevin/Documents/Hangers App Daily Iron/Indian Payment Checkout Design (1)/` is the recursive design source of truth, including its latest README, prototypes, screenshots, replacements and additions. Existing code and the canonical payment plan define payment behavior and server truth. No design files were copied into the application.

Exact-head [CI run 37255411577](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37255411577) passed Backend and CRM for `08868568948b8d3590823022b26a3b0fb6790a3b`. The product UI is in ancestor commit `3514f3a832615f50263f9ab0f05523a332b955d8`; the exact-head change after it is test-only. The CRM job passed type-check, build, checkout lint, state/navigation suites, 26/26 responsive/recovery browser cases, 9/9 redesigned method-control cases and 3/3 result-screen cases. Seven responsive/method screenshots are retained in the [checkout visual QA artifact](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37255411577/artifacts/11322970238).

The retained 390px capture is a single-column public checkout; at 1366px the payment summary and Pay action are in the right-hand column. The methods capture shows the method list and UPI handoff. A read-only inspection of the current Kevin Chrome profile on `localhost:5002` showed Home QA, 45 returned banks, six wallets and other returned methods. Local CRM login and API health returned HTTP 200. The already-open Home checkout displayed a transient status-check warning; no retry, payment, order, database or notification action was taken.

No Test or Live payment, new provider order, local database mutation, public-share mutation, WhatsApp/email dispatch, EC2 operation, production configuration or deployment occurred during this continuation. The browser suites use deterministic SDK/API mocks for payment transitions; they do not establish provider acceptance.

## Checkout Motion Wiring - 5 October 2026

The five supplied clips relevant to payment checkout are now connected from the design source folder: `logo-reveal.mp4` on the first checkout visit, `payment-processing.mp4` during non-UPI payment handoff, `upi-waiting.mp4` while UPI is awaiting app approval, `payment-success.mp4` only after the backend reports `CAPTURED`, and `payment-failed.mp4` only for a definitive `FAILED` status. The app-loading `logo-loop.mp4` and order-tracking `order-journey.mp4` remain outside payment checkout.

- [x] Copy the five source MP4s into the CRM's public checkout-motion path; byte comparisons match the provided originals.
- [x] Wire each clip to the matching checkout state without changing payment requests, status transitions or settlement behavior.
- [x] Keep motion muted, inline and decorative; use the supplied static Hangers logo or existing state icon for reduced motion and playback failure.
- [x] Verify checkout lint, TypeScript, production build, and HTTP 200 delivery for all five clips from the existing `localhost:5002` service.

This continuation verifies implementation, build and asset delivery. It did not create an invoice or submit a Test/Live payment; the earlier CI screenshots predate this local motion addition and are not represented as animation playback evidence.

## Resolved UI Findings

| Label | Resolution |
| --- | --- |
| UI-R01 | UPI controls are grouped under the UPI section, and the method list follows the supplied one-column/mobile and two-column/desktop layout. |
| UI-R02 | Submission handoff and server-backed result presentations are implemented. CI verifies processing/review/captured/failed/not-completed rendering and retry guards; result-screen cases pass 3/3. |
| UI-L02 | Bank artwork comes only from the backend-approved catalogue. No URL is synthesized and no initials/text substitute is rendered; an absent or failed logo is omitted while the Razorpay-returned bank name and selection remain intact. Artwork never enables a payment method. |
| Bank search row label/artwork regression | The selected bank remains identifiable by its visible returned label and Razorpay-hosted artwork; the regression checks the rendered row and accessible selected state. Included in the passing 9/9 method-control cases. |
| Keyboard/method-page regression | Arrow/Space keyboard selection, method re-entry, breadcrumbs/back behavior and modal-first Back are included in the passing 26-case retained browser suite. |
| Desktop summary placement | CI captures and direct visual inspection confirm the summary/Pay panel is on the right at 1366px; narrow public checkout stays one column. CRM pages are outside this responsiveness scope. |

## Later Review Items

These are separate from the completed visual redesign. Do not expand them into repeated checkout or payment testing.

| Label | Owner / reason | Simple impact | Status |
| --- | --- | --- | --- |
| UI-L01: Credits/coupons | Product and backend contract not defined for invoice settlement. | A fake toggle could collect the wrong amount or suggest a discount that is not applied. | Omitted; not a redesign blocker. |
| UI-L02: Fino artwork endpoint | Razorpay-hosted asset returned 403 during a prior bounded check; no approved first-party bank asset is recorded. | The logo is omitted; Razorpay-returned bank selection remains available. | Deferred to Razorpay providing an accessible asset or explicit approval/source for an official first-party asset. No URL guessing or replacement mark. |
| UI-L03: Provider-owned QR/redirect/OTP surfaces | Razorpay SDK/bank owns external authentication and app switching. | Hangers cannot truthfully draw the bank's page, QR or OTP from a mock. | Existing provider handoff remains; external behavior needs provider-backed acceptance, not visual fixtures. |
| UI-L04: Saved-card token lifecycle | Razorpay account activation, payer authentication and consent requirements remain under canonical A11. | Showing a masked card in a mock would not prove that a real token can be stored or reused. | UI remains server/auth-gated; provider lifecycle is deferred. |
| UI-L07: Old-share attempt lookup | Hangers backend ownership/recovery contract. An earlier Home QA attempt was bound to an older public-share ID; requesting that attempt under a newer share returned 404. | That specific stale link could not confirm the attempt; it must not be relabelled failed or replaced with another payment. | Not changed here. Fix through the canonical backend finding; do not rebind/reset the attempt to make a screenshot pass. |
| Support action | User input: no approved Contact Hangers number supplied. | Inventing a number can send a customer to the wrong contact. | Omitted until the approved number is available. |

## Boundaries

- The PR remains open and Draft; no merge or production release is claimed.
- The CI artifact is associated with the PR workflow and retained through 19 October 2026. It contains mock checkout screenshots, not payment-provider evidence.
- Canonical `razorpay-custom-checkout.md` and `razorpay-custom-checkout-findings.md` remain the authoritative implementation and acceptance records. Provider support questions, real token lifecycle, external redirects/UPI acceptance, combined-provider acceptance and A01-A24 dispositions remain there.
- No new acceptance labels or broad test matrix were created. Future work should start from the specific later-review row and its canonical finding.
