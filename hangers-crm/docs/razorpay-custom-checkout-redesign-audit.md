# Custom Checkout Redesign Audit

Updated: 5 October 2026. Local implementation is in progress; this is not production deployment or renewed A01-A24 acceptance.

## Current Phased Evidence

Current continuation: `37ab468` adds server-gated retry/not-completed screens and real receipt rows. Exact-SHA CI `37247497095` passed redesigned methods 8/8, new result screens 3/3, type/lint/build/units and backend checks. Retained browsers are 24/26: the known ArrowDown mismatch and a payment-reference selector now matching both the new receipt row and the expanded details. Phase 2 keyboard acceptance remains Partial, and full CI is red. These are current limits, not a restart of the finite repair budget. Phase 5 motion is implemented with 11/11 focused handoff/result/motion units and local type/lint passes; rendered motion acceptance remains open.

The tables below include historical observations. Current revision `9a9a629` passed backend CI, checkout TypeScript/lint/build/unit checks and 8/8 bounded redesign browser cases in run `37230448565`. The retained browser bundle is **25/26**, not fully green. Its remaining ArrowDown case expects a method-list radio after selection opens the new method page; keyboard landing/focus and the correct new-page assertion still need final disposition. The initial bundle plus two repair cycles are exhausted; no repeated reassurance reruns or release claims.

- UI-R01 resolved: UPI controls now sit in the UPI section; bounded navigation/layout checks passed.
- UI-L02 updated: inaccessible/missing logos use initials with returned labels, not a generic bank icon. Forty-one verified mappings remain; no guessed bank aliases were added.
- UI-L05 historical build blocker is no longer present in the pushed revision: exact-SHA CI build passed. Concurrent local marketing edits remain protected and are not silently corrected/staged.
- UI-R02 remains open. Submission-driven bank/wallet/provider/UPI waiting presentation is now implemented with focused rendering fixtures, but final result-screen comparison and Phase 4 acceptance are not complete.

The approved existing Home Test invoice was also inspected interactively in Kevin Chrome. Its formatter enabled Pay with a documented Test card; no payment was submitted. The checkout's normal automatic preparation may reuse/prepare its Test order, so the earlier no-provider-order-write statement applies only to the mocked historical bundle, not all subsequent interactive activity.

## Sources and Boundary

The refreshed `Indian Payment Checkout Design (1)/README.md`, desktop/mobile prototypes and supplied branding define the new appearance. Existing payment code and the [master plan](razorpay-custom-checkout.md) define functional behavior. The [canonical findings](razorpay-custom-checkout-findings.md) retain their existing dispositions.

Only the existing localhost:5002 CRM, localhost:5001 API and local hangers_db were used. UI fixtures use Home / +91 9930367267 and kevinnagda@gmail.com. The payment SDK, capabilities, IIN, order preparation and callbacks in the focused browser tests are mocked. No Razorpay payment, new provider order, WhatsApp message, Live configuration or EC2 change was performed.

## Implemented Evidence

| Area | Evidence | Result / limits |
| --- | --- | --- |
| C04 navigation | Existing public Pay action reaches the dedicated checkout. Focused card-success test verifies its callback through the existing server-verification contract. | Pass with mocks; original routes and recovery handlers preserved. |
| C05 layout and branding | White Space Grotesk layout, supplied Hangers logo, Secure badge, customer/contact card, grouped method rows, method breadcrumb, card details and bank search. | Implemented. Desktop summary and associated Pay button are on the right; mobile uses the top summary and bottom action bar. |
| C05 actual data | Existing Home invoice QA-CHECKOUT-46753DDC9F supplies the real local invoice, customer and ₹10 balance. Combined invoice split still comes from summary.receivables. | No demo amounts, coupons, credits, fees, delivery slots or session timers. Combined allocation backend unchanged; no new combined capture claimed. |
| C06 responsive | Focused browser case checks 360, 390, 820, 1366 and 1920 widths, summary placement, form-associated Pay control and horizontal overflow. | Pass. No CRM mobile emulation or broader device/provider acceptance claimed. |
| C06 controls | Native bank search dialog filters only SDK-returned banks and selects SBIN in the mock. Card submission through the external desktop Pay button reaches the original SDK handler. | Pass. Fixed a method-radio click target; expiry/CVV stay side by side on mobile. |
| C06 payment results | Mocked card success renders Payment received; mocked SDK failure preserves the provider description and exposes Check payment status. | Both focused cases passed. Capture, review and failure presentations updated; further visual fidelity review remains below. |
| C10 assets | Existing approved configuration.artwork mapping remains the only payment-logo source. Unmapped enabled network identifiers render as text. | No guessed image URLs; mock artwork is empty, so the screenshots do not prove actual merchant-logo delivery. |
| Source validation | npm exec tsc -- --noEmit; git diff --check. | Passed at this implementation stage. |
| Full application build | npm run build. | Failed in a concurrently edited marketing component, src/components/public/PublicContentPage.tsx: useRef imported without a client boundary. Checkout type-check passed; marketing file left untouched. |

The three focused cases reached passing results: card SDK-only fields/server verification, exact mocked provider-failure copy, and responsive layout/bank selection. The first two runs did not reach checkout because the temporary share's fractional-day TTL expired immediately. The fixture expiry was corrected explicitly, without changing the share service. The first valid UI run identified an intercepted radio click; its hit target was repaired. The second UI repair adjusted mobile actions/card layout and added unmapped-network text. Only affected checks were rerun. A screenshot recapture was needed because Playwright clears its output directory between runs; no provider action was repeated.

Rendered artifacts: `test-results/checkout-redesign-{360,390,820,1366,1920}.png` and `test-results/checkout-redesign-methods-{390,1366}.png`. These are local mock screenshots, not production evidence. Full-page captures include sticky/fixed elements at the capture viewport's scroll position.

## In-Scope Remaining Review

| Label | Evidence / impact | Blocks redesign completion? | Next bounded action |
| --- | --- | --- | --- |
| UI-R01 | On the method-list view, the existing selected UPI controls still render below the other-method group. The refreshed source places the UPI app/QR controls inside the UPI section. | Yes: visual-source alignment. | Move the existing UPI controls into their section without changing SDK identifiers, QR handoff or intent submission. Review the resulting picker once. |
| UI-R02 | Success/failure callback assertions pass, but the richer source result views and return navigation have not all received a final rendered visual comparison. | Yes: final UI audit. | Compare the changed result presentation against the source, reuse existing capture evidence and record only directly required UI fixes. No new payment or A-item program. |

## Later Review / Approval

| Label | Type | Evidence and impact | Blocks this UI? | Proposed later work |
| --- | --- | --- | --- | --- | --- |
| UI-L01 | Future feature | Prototype Hangers credits/coupons lack checkout allocation/validation support. Showing a usable toggle would misrepresent the payable balance. | No; omitted. | Define a separately approved backend/ledger/idempotency contract before exposing credits. Coupons and ecommerce delivery features are not added by this redesign. |
| UI-L02 | Asset coverage | Fixed for 41 of the supplied 42 bank identifiers: exact Razorpay-hosted mappings cover both the grid and full bank search. All 41 URLs returned HTTP 200 and image/gif. Fino's supplied URL returned HTTP 403/application/xml, so it retains the bank icon and SDK label. Unknown banks and failed images also retain the icon and SDK label. Linked to C10. | No. | Add Fino artwork when a verified accessible Razorpay URL is available. Logos never determine availability. |
| UI-L03 | Existing provider boundary | The desktop QR remains in Razorpay's documented payment window. The prototype's generated inline QR, expiry timer and Hangers OTP page are demo-only. | No functional blocker; visual exception must remain explicit. | A separately reviewed documented inline-QR contract would be required before replacing the existing handoff. Bank OTP remains bank-owned. |
| UI-L04 | Existing provider/auth limitation | Positive saved-card token lifecycle is deferred in canonical A11. No invented saved-card recommendations were added. | No. | Follow the existing A11 activation/auth/consent gates when separately approved. |
| UI-L05 | Deployment defect outside checkout | Full build fails in the protected marketing edit described above. | Blocks full deployment, not local checkout verification. | Marketing owner must establish the correct client/server boundary and pass the build before release. No production deployment claimed. |
| UI-L06 | Tool limitation | Kevin's Chrome profile is available, but its browser policy rejects file:// screenshot preview. | No code blocker. | Use the supplied local screenshot artifacts for review; do not bypass the browser policy or expose another server. A live interactive Kevin-profile checkout audit is not claimed here. |
| UI-L07 | Existing share/attempt API mismatch | The Home QA invoice's current share resolves successfully, but its existing CREATED Test attempt is bound to an older publicShareId. Initial status exposes that attempt; the subsequent request with its attemptId returns HTTP 404 because lookup also requires the current publicShareId. The Chrome Cancel action therefore shows an unconfirmed-status warning rather than the not-completed screen. No payment was submitted. | Blocks this actual local recovery check, not mocked result-screen rendering; unresolved functional finding. | Review the backend's authorized invoice/attempt ownership contract in a separately approved fix. Do not rebind the attempt, reset its status, or create another provider order to hide the mismatch. The existing share was extended three hours only; revoke it when QA finishes. |

Completed A-items and deferred provider/release gates remain unchanged. This report adds no new acceptance tracks or payment test matrix.
