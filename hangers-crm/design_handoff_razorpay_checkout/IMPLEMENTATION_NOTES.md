# Custom Checkout UI Implementation Notes

Updated: 5 October 2026. The redesign phases are implemented and bounded UI acceptance checks pass. Product implementation commit: `3514f3a832615f50263f9ab0f05523a332b955d8`; exact tested PR head: `08868568948b8d3590823022b26a3b0fb6790a3b` (CI run `37255411577`). This is not a production deployment or renewed A01-A24 acceptance.

## Source and Scope

- The authoritative design input is `/Users/kevin/Documents/Hangers App Daily Iron/Indian Payment Checkout Design (1)/`. Treat all current files, additions and replacements recursively in that exact directory as the design source. Read its current README first. Do not substitute copies, earlier versions or this notes directory.
- The supplied desktop/mobile HTML files are visual and interaction references. The CRM implementation stays in existing React/Next components and CSS modules under `hangers-crm/src/app/invoice/[slug]/checkout/`; do not ship prototype HTML.
- Existing public invoice Pay Now, checkout routes, API contracts, and server-owned payment truth remain authoritative. This is for Hangers service invoices across supported service types, not an ecommerce cart.
- The canonical `docs/razorpay-custom-checkout.md` and `docs/razorpay-custom-checkout-findings.md` were not changed by this redesign handover. Their payment acceptance and deferred provider/release items are not closed by UI fixtures.
- No production/EC2 deployment, real or Test payment, local database mutation, public-share creation/revocation, WhatsApp/email send, or payment-status mutation was performed in this continuation.

## Screen Ownership

Paths below are relative to `hangers-crm/src/app/invoice/[slug]`.

| Screen/element | Existing owner | Implemented contract |
| --- | --- | --- |
| Public invoice Pay Now and return | Invoice page; `checkout/page.tsx` | Preserves the existing invoice link and dedicated checkout route. |
| Header, logo, progress, responsive shell | `checkout/page.tsx`, `checkout/page.module.css` | Shared shell; summary and Pay action on the right at desktop widths; one column on narrow public checkout pages. |
| Invoice/order summary and Pay action | `checkout/page.tsx`, payment-action portal | Uses server invoice total, identifiers and allocation data; no mock amount or split. |
| Method list, individual pages and bank search | `RazorpayCustomCheckout.tsx`, its CSS module | Renders returned methods; breadcrumbs/back behavior; native search dialog filters all returned bank codes. |
| Card, eligibility and EMI | `RazorpayCustomCheckout.tsx`, `checkout/razorpay-sdk.ts` | Keeps Razorpay formatter, SDK validation/submission, IIN enrichment and returned plans; card credentials go to Razorpay, not CRM. |
| Saved cards | `checkout/SavedCards.tsx` | Requires authenticated payer and server-provided card data; does not claim provider token acceptance from UI mocks. |
| Provider handoff and pending/result screens | `RazorpayCustomCheckout.tsx`, `checkout/CustomCheckoutFlow.tsx` | Existing SDK submission with server-verified status, guarded recovery and real receipt references. |

## Design Decisions

| Prototype content or behavior | Shipped decision |
| --- | --- |
| Coupons, Hangers credits, savings, delivery slot, GST split, session timer, offers/no-cost tags, fixed bank counts, Track order and Test-mode hints | Omitted; they are demo content without the required checkout contract. |
| Sample methods, banks, providers, plans or amounts | Never used as availability. Razorpay-ready methods and server invoice data determine what renders and submits. |
| Logos | Configured Razorpay artwork first; otherwise Razorpay-hosted bank-code artwork for returned bank codes. A failed image uses initials plus the returned label. Images never decide payment availability. No third-party URLs or guessed bank inventory. |
| UPI QR, app intent, bank redirect and OTP | Existing Razorpay SDK/provider handoff remains in control. No synthetic QR, Hangers-built bank page, fake app deep link or Hangers OTP form. |
| Success, failure and retry | Server status/verification controls outcome. Provider descriptions and real receipt data are used; no unsupported no-debit claim, timer-driven result or unsafe replacement order. |
| Contact Hangers | No new contact number or button was invented; the user has not provided the approved support number. |

## Verification

- Exact-head [CI run 37255411577](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37255411577) passed Backend and CRM jobs for `08868568948b8d3590823022b26a3b0fb6790a3b`. The checkout implementation is in ancestor commit `3514f3a832615f50263f9ab0f05523a332b955d8`; the exact-head change after it is test-only.
- CRM job passed type-check, build, checkout lint, invoice state/navigation tests, 26/26 responsive/recovery browser cases, 9/9 redesigned method-control cases, and 3/3 result-screen cases.
- CI retained seven screenshots in the PR-associated [custom-checkout visual QA artifact](https://github.com/kwinagda/hangers-clothespa-v2/actions/runs/37255411577/artifacts/11322970238). Inspected 390px and 1366px captures: mobile is one column; desktop summary/Pay panel is on the right. The methods capture shows the returned methods and UPI handoff. The Next.js development badge in the capture is development tooling, not checkout UI.
- Browser coverage includes responsive widths 360, 390, 820, 1366 and 1920; method navigation; card field error/focus association; bank search filtering/focus restoration and the visible/accessibility label for a selected bank; and server-state result/retry guards. CI source-color contrast assertions pass. This is not a manual VoiceOver certification.
- The existing Kevin Chrome profile was read on `http://localhost:5002`: its accessibility tree showed Home QA, 45 returned banks, six wallets and other account-returned methods; payment summary appears after checkout content in the tree and visually on the right at desktop width. Read-only CRM login and API health checks returned HTTP 200.
- That already-open local invoice displayed a safe transient payment-status warning during inspection. No status retry or payment action was activated and no order/payment/data changed. It is recorded as a separate existing recovery limitation below.
- PR #10 remains open and Draft. No merge or production release is claimed.

## Finite Phase Exit Register

- [x] Phase 0: audited the current supplied folder, README, design references, existing routes, data sources and mock conflicts.
- [x] Phase 1: built shared branded shell, README tokens, focus/touch/reduced-motion rules, desktop right-hand summary and responsive public checkout layout.
- [x] Phase 2: implemented account-returned method list, individual method navigation, breadcrumbs/back behavior and UPI section; current retained keyboard/browser suite passes 26/26.
- [x] Phase 3: implemented card, netbanking, wallet, card EMI, cardless EMI and Pay Later presentation while preserving SDK option identifiers and availability.
- [x] Phase 4: implemented provider handoff, processing/review/captured/failed/not-completed screens and guarded status/retry actions; 3/3 result-screen browser cases pass.
- [x] Phase 5: implemented CSS-only intro/result/handoff motion with reduced-motion support; focused motion tests are included in the passing exact-SHA suite.
- [x] Phase 6: bounded responsive, keyboard/dialog, source-color contrast and result checks pass; screenshots are retained as the PR-associated artifact. No CRM mobile-responsiveness work was added.
- [x] Phase 7: this handover and the separate audit state what shipped, deviations and later review items.

## Later Review, Not Redesign Blockers

- `UI-L07`: a previously inspected Home QA Test attempt was tied to an older public-share ID. A status request using the newer share and the old attempt ID returned 404. The UI did not rebind/reset the attempt or create a replacement provider order. Fix through the canonical backend ownership/recovery finding; do not hide it with a visual-test workaround.
- One Razorpay-provided Fino artwork URL returned 403 in an earlier bounded availability check. The UI follows the supplied initials fallback with the account-returned bank label. Any other inaccessible artwork uses the same fallback.
- Provider token lifecycle, actual external bank/app return behavior, Razorpay support answers and other A01-A24 deferred items remain governed by the canonical plan. No UI mock or CI screenshot proves provider acceptance.
