# Custom Checkout UI Implementation Notes

Updated: 5 October 2026. Status: Phase 0 audited; all remaining phases authorized by the user on 5 October. The newer authorization removes inter-phase waiting. Use the actual supplied folder and explicit README tokens. New UI-specific accessibility checks are bounded to this implementation, not a reopening of A01-A24. Contact Hangers stays omitted pending the user's number.

## Inputs and Boundaries

- Authoritative supplied design directory confirmed by the user: `/Users/kevin/Documents/Hangers App Daily Iron/Indian Payment Checkout Design (1)/`. Its README, desktop prototype, mobile reference and assets are the design inputs. The goal's input paths now point here. This `design_handoff_razorpay_checkout` directory contains implementation notes only, not a copied design or competing source.
- Canonical plans: `docs/razorpay-custom-checkout.md` and `docs/razorpay-custom-checkout-findings.md`. Their current audited register, finite scope, C requirements, state/action contract and current findings disposition control over historical entries. Neither plan is edited by this revised phased goal.
- Current integration: `src/app/invoice/[slug]/checkout/CustomCheckoutFlow.tsx`, `src/app/invoice/[slug]/RazorpayCustomCheckout.tsx`, `checkout/page.tsx`, `checkout/SavedCards.tsx` and `checkout/razorpay-sdk.ts`. Preserve their existing API contracts and server-owned payment truth.
- Public invoice Pay Now remains the entry to the existing dedicated checkout route. All supported Hangers services and combined outstanding splits remain in scope; this is not an ecommerce cart.
- Existing local runtime verified: CRM localhost:5002, API localhost:5001, PostgreSQL localhost:5432/hangers_db, Razorpay Test. Home/+91 9930367267 and kevinnagda@gmail.com only for any required test activity. No Live, EC2 or production action.
- Historical A register remains 17 accepted, one N/A and six deferred. It is not restarted or reset by this UI goal. Phase acceptance must not be described as provider activation or production release.

## Screen Ownership

Paths below are relative to `hangers-crm/src/app/invoice/[slug]`.

| Mock screen/element | Existing owner | Intended bounded work |
| --- | --- | --- |
| Invoice Pay Now and return | Invoice page/payment button; `checkout/page.tsx` | Preserve route and invoice selection; no replacement public links. |
| Sticky header, logo, Secure indicator, progress | `checkout/page.tsx`, `checkout/page.module.css` | Shared shell, summary on right at >=900px, consistent tokens and real progress. Header navigation must coordinate with client state. |
| Order summary and combined split | `checkout/page.tsx` | Render server invoice/receivable totals and identifiers, not mock amounts. Pay uses the existing form association/desktop portal. |
| Method list and individual method pages | `RazorpayCustomCheckout.tsx`, its CSS module | Current methodPage state/breadcrumb exists; place UPI controls inside their list section; preserve SDK-only inventory. |
| Recommended saved card | `checkout/SavedCards.tsx` plus method-list composition | Authenticated customer data only. No invented recommendation/card; preserve ownership and consent. |
| Card and Card EMI form | `RazorpayCustomCheckout.tsx`, `checkout/razorpay-sdk.ts` | Preserve formatter, IIN enrichment, network exclusion, payload and actual plans. Restyle, do not replace validation with mock rules. |
| Netbanking grid/search modal | `RazorpayCustomCheckout.tsx`, its CSS module | Existing native dialog/filter/selection. Finish bottom sheet, backdrop close, focus restoration, initials fallback and full verified artwork coverage. |
| Wallet/Cardless EMI/Pay Later lists | `RazorpayCustomCheckout.tsx` | Current selects must become returned-option radio rows without changing provider codes or submission. |
| CRED and conditional bank transfer | Existing branches in `RazorpayCustomCheckout.tsx` | Preserve real eligibility/instructions when enabled even if not pictured in the mock. No new activation. |
| Provider redirect/UPI wait/processing | `RazorpayCustomCheckout.tsx` emits submission; `checkout/CustomCheckoutFlow.tsx` owns authoritative state | Add presentation only around documented SDK handoff and server status. No custom bank/OTP page, invented QR or timer-based failure. |
| Under review/status checking | `checkout/CustomCheckoutFlow.tsx` | Preserve bounded status reads, reconcile, focus/visibility/online recovery and no-second-charge rules. |
| Received/failed/not completed | `checkout/CustomCheckoutFlow.tsx` and CSS | Only server-supported result states; exact returned failure description and real receipt fields. A closed bank window is not proof of failure. |
| Intro and result animations | Checkout CSS modules and narrowly scoped client presentation | CSS-only, reduced-motion aware. Cosmetic amount animation must end at the exact server amount and not announce intermediate amounts. |

## Mock Conflicts and Decisions

| Mock feature/claim | Current code or plan boundary | Decision |
| --- | --- | --- |
| Coupons, Hangers credits, savings, delivery slots, GST split, offers/no-cost tags | No relevant supported checkout contract | Remove from customer checkout, record future work only. |
| Fixed bank count, sample banks/providers/cards and amounts | SDK ready.methods and server invoice are authoritative | No activation inferred from mock or artwork map; real counts/data only. |
| Third-party logos and constructed logo guesses | Approved Razorpay artwork only | Exact verified cdn.razorpay.com mappings, with initials fallback after Phase 1 approval; never load third-party replacements. |
| Diners card and mock 16-digit formatting | Account exclusion and Razorpay formatter | Keep Diners excluded; retain provider formatter, AmEx and documented CVV handling. No local guessed card table. |
| In-page OTP, mocked successful timers | Bank/SDK authentication, server verification | Never collect bank OTP on Hangers; no timer marks paid or failed. |
| Add UPI ID/Collect | Current Intent and Razorpay QR contracts | Absent; no Collect substitute. |
| Native-app handoff determined only by width | Runtime platform/app discovery currently controls safe submission | Width controls layout only. Desktop narrow windows must not acquire fake installed mobile apps. |
| 15-minute session/countdown | No authoritative session deadline in current contract | Remove session timer. Pending ring may only use a documented actual SDK timeout; expiry remains unconfirmed, not failed. |
| Track order/Download receipt/Test-mode hints | Explicit new-goal exclusions | Omit; retain View invoice and receipt details. Test-mode safeguards remain in code/config, not demo hints. |
| Failed means no funds debited | Provider/server status does not guarantee this statement | Exact provider description plus sanitized technical details; never make a no-debit claim. |
| Retry unconditionally creates an order | Existing reservation/reconcile and canResumeCheckout guards | Reuse/check server-confirmed resumable order; no arbitrary cooldown unlocks a second charge. |
| Always display saved card/save toggle | Existing customer authentication and consent contract | Only signed-in eligible payer; public invoice possession is not authentication. A11 provider lifecycle stays deferred. |
| Invented service/support number | Current page reads configured contact; new goal requires asking user | Do not invent. Ask which approved number to display; omit contact action in revised UI until answered. |
| Always show static success receipt/split | Server CAPTURED data and actual allocations | Show real amount/time/references and expandable split only when returned. |

## Data and Existing Integration Sources

| Needed data/action | Current source | UI boundary |
| --- | --- | --- |
| Invoice, customer, order, payable amount, combined allocation | Server checkout page/public invoice; create-order checks amount/currency | Browser/mock cannot change billed amount or split. |
| SDK bootstrap, mode/key, configuration and artwork | GET payment/custom/capabilities; backend razorpay-custom-capabilities.service.js | Optional REST methods failure must not prevent validated SDK bootstrap. Never print secrets. |
| Activated methods/banks/wallets/providers/networks | Razorpay SDK ready.methods; optionKeys/enabled filtering | No unknown or explicitly disabled method fallback. |
| UPI apps and Intent restrictions | getSupportedUpiIntentApps; runtime platform checks; feeBearer/upi_intent flags | Only returned supported apps; unavailable device remains unavailable. |
| Desktop UPI QR | Existing createPayment with upi.qr/timeout | QR remains Razorpay-generated; do not build a synthetic inline QR. |
| Card network/validity and IIN | SDK setFormatter network/validation events; POST custom/card-eligibility | PAN/CVV go only to SDK; CRM sees IIN prefix for enrichment, not full credentials. F46 unresolved lookup stays explicit. |
| EMI plans/installment | Returned emi_plans, IIN eligibility, SDK emi.calculator | F11 fees remain unresolved; no fabricated charges, offers or no-cost label. |
| Saved-card eligibility/consent/tokens | Authenticated /customer/payments/razorpay/saved-cards config/list/consent/prepare endpoints | Preserve customer/mode binding; do not imply real token acceptance from mocks. |
| Payment submission | Existing create-order + instance.createPayment + callback_url | Netbanking/wallet/Pay Later go to provider; client callback is not paid. |
| Payment truth/recovery | GET payment/status, POST reconcile, POST verify; server/webhooks | Existing status/resumability controls payment actions. |
| Downtime | GET custom/downtime with instrument identifiers | Only current matched evidence; no generic stale-warning spam. |
| Bank artwork | Backend razorpay-brand-assets.js merged into capabilities configuration | 41 exact supplied bank mappings verified HTTP 200/image-gif; FINO supplied URL returned 403. Artwork does not activate banks. |
| Offers | No supported offer presentation in this UI scope | Not needed; remove mock offer claims rather than invent an API dependency. |

## Prior Work and Verification (Not New Phase Acceptance)

- Main redesigned shell, right summary/actions, card layout, method breadcrumb and native bank search are already present. Their existence is not proof that every new phase exit passes.
- Prior focused mocked card success/failure/navigation and five-width layout evidence is in `docs/razorpay-custom-checkout-redesign-audit.md`. No new provider payment is needed just for presentation.
- Immediately before this updated phased goal, the requested full-bank artwork mapping was extended to 41 supplied bank identifiers. The bank-artwork unit regression passed 1/1; all added URLs were verified; the local API was restarted and the Test environment verifier passed. Fino remains a truthful image-access limitation. No new payment/ledger/message action occurred.
- Existing TypeScript check passed before this audit. Broader production build previously failed in concurrently edited PublicContentPage.tsx; do not fix or revert unrelated marketing changes silently, and do not call all build gates green.

## Risks and Open Decisions Before Phase 1

1. **Source folder:** new goal names design_handoff_razorpay_checkout; only Indian Payment Checkout Design (1) exists. Recommend using that supplied folder without duplicating or renaming user assets. Confirm it is the intended input.
2. **Accessibility scope conflict:** the canonical finite plan explicitly defers VoiceOver/measured contrast and excludes expanded matrices, while new Phase 6 requests a screen-reader/modal contrast pass. Recommend one bounded modal keyboard/focus and contrast check, with no reopening of A03-a/b or exhaustive device/permutation testing. User must resolve scope before implementation.
3. **Tokens:** README says background #F7F9FC and radii 8/12/16/20; desktop prototype/current CSS use white background/24px and some 650/750 weights. Recommend the README's explicit tokens and weights 400/500/600/700, with white inner surfaces; adjust these in Foundation, not silently during Audit.
4. **Contact:** new goal requires an explicitly supplied Contact Hangers number. Current page uses server configuration. Ask user to approve the number; omit revised contact action until supplied.
5. **Native provider UI:** current QR is in Razorpay's payment window. Without a documented inline-display/intent-reopen contract, show accurate Hangers waiting/recovery state rather than fake QR, fake app deep links or custom OTP. Native mobile handoff remains separately deferred A07-b; do not infer it from viewport tests.
6. **Result back priority:** shared header is currently a server Link, while modal and method state live in the client component. Coordinate these states in a small checkout-scoped client navigation owner; do not create a new backend/payment state machine or expose Pay from an unresolved result.
7. **Components:** Button/Badge exist in src/components/ui; no standalone InlineLoader file was found there. Use the existing component export if present elsewhere; otherwise keep the current accessible LoaderCircle pattern instead of inventing a dependency.
8. **Full bank logo coverage:** 41/42 supplied image URLs work. Keep Fino initials; no guess/repeated CDN probing. Exact account-returned codes outside the supplied verified map also use initials. Current code's Landmark fallback needs a bounded presentation replacement after approval.
9. **Deferred provider facts:** F11/F35/F46, saved-token activation/lifecycle and combined-provider acceptance remain limitations, not tasks to solve by guessed UI or repeated payment submissions.
10. **Git/build:** worktree contains protected concurrent marketing/package/plan edits. Commit only phase-owned files. Exact-SHA checks and final PR screenshots must not be claimed before they exist; no production deployment is authorized by this local phased goal.

## Finite Phase Exit Register

- [x] Phase 0: inspect supplied inputs/current contracts; record screen ownership, conflicts, data sources and risks here.
- [x] All phases authorized; proceed sequentially without further approval pauses. Contact action omitted pending number.
- [x] Phase 1: shared shell/tokens; 360/390/820/1366/1920 layout test passes, TypeScript passes, checkout-scoped ESLint passes, invoice units 29/29 pass. Support action omitted. No payment/provider write.
- [ ] Phase 2 (Partial): six returned non-UPI method pages/breadcrumbs and modal-first Back passed in the initial bounded run. Current CI `37231069849` contradicts keyboard completion: Space did not expose the expected card form, and the retained ArrowDown case still fails. Result Back and authenticated-only Recommended unit fixtures pass. Finite repair cap is exhausted; retain the exact keyboard gap rather than claim full acceptance or restart the bundle. Provider-token lifecycle is not proven by these mocks.
- [x] Phase 3: real method controls, bank modal/artwork and ready-to-pay validation. Bounded redesign CI passes 8/8 at `9a9a629`; actual Test formatter/card readiness was observed in Kevin Chrome. Existing provider limitations are unchanged.
- [ ] Phase 4: server-truthful handoff, status and result presentation.
- [ ] Phase 5: specified CSS motion/reduced-motion without fake state transitions.
- [ ] Phase 6: approved finite QA scope, existing regressions, two comparison screenshots and exact reported check results.
- [ ] Phase 7: shipped/deviation/remaining-item handover and approved contact decision.

After each phase: update this file's actual evidence and report checks before proceeding. All phases are authorized; no inter-phase approval wait is required. Do not reset A01-A24, invent new acceptance tracks, or claim deferred provider/production coverage is complete. New unrelated findings remain recommendations in the separate UI report, not an endless implementation loop.

## Phase 2 Evidence

- The method list keeps provider-generated UPI controls in their own section. SavedCards remains mounted across list/card navigation and displays Recommended only after authenticated card data exists; this does not close the deferred provider-token lifecycle.
- Bounded browser bundle: SDK-only card submission and five-width summary placement passed 2/2. Navigation passed 1/1 after targeting the header Back link rather than the separate invoice-return link. No payment, ledger or notification was written.
- TypeScript, checkout ESLint and invoice units 29/29 passed with Node 24. The browser evidence used the existing localhost API and a temporary Home share with mocked SDK endpoints; it is not native mobile handoff or provider acceptance.
- Existing-profile-only testing remains mandatory. Further interactive checks use Kevin's connected Chrome, not a separate local Playwright browser.
- Recommended presentation fixtures pass 3/3: guest/stale card data hidden, authenticated empty list hidden, authenticated masked card shown. No session, token or selector leaks into markup.
- Result Back fixtures pass 3/3: captured returns read-only methods with no Pay/order preparation; pending stays locked; failed is selectable only when the server explicitly permits resume. Read-only display never triggers automatic order preparation.

## Phase 3 Work and Evidence

Closure update: exact-SHA CI run `37230448565` passes all eight bounded redesign browser checks, TypeScript, checkout lint, build and both navigation/recommendation unit fixtures. Backend checks also pass. Retained browser regressions are 25/26, not green: the keyboard test expects a card-list radio to remain mounted after ArrowDown opens the new card page. The initial bundle and two repair cycles are exhausted; preserve this failure for the final QA disposition rather than run an endless repair loop. The goal is not complete and no release/deployment is claimed. Earlier runs `37229797982` and `37230093599` are historical failed repairs, not current evidence.

- Wallets, Cardless EMI, Pay Later and returned EMI durations now use labelled native radio rows. Submission continues to use the existing provider identifiers; no methods, plans, fees or validation facts are invented.
- Bank search uses the supplied popular-bank ranking intersected with returned account inventory, then returned alternatives. Full search remains account inventory only. Removed the duplicate legacy dropdown; grid/modal selection populates the same bank submission value.
- Native modal retains browser focus trapping, bottom-sheet/desktop layout, explicit search focus, Escape, backdrop close and trigger focus return. Missing/inaccessible approved artwork uses initials rather than a generic bank icon.
- Kevin Chrome check against the existing Home Test invoice: account returned 45 banks and six wallets; bank filtering and Escape focus return passed, wallet radios rendered, and the documented Test card reached enabled Pay via the actual formatter. No payment was submitted. IIN lookup returned the provider message "The requested URL was not found on the server"; this remains the existing provider lookup limitation, not a fabricated success.
- TypeScript, checkout ESLint, diff whitespace checks and the changed invoice-state unit bundle pass (22/22). Updated the affected browser assertions to radio/grid semantics and added a bounded modal regression; those browser cases are not yet rerun under the approved existing-profile constraint.
- The connector rejected test-script installation as unsupported; no tab script or API fixture was installed. Actual Test APIs were used for the interactive checks instead. Preserve existing local order/ledger evidence; do not reset payment status for screenshots.

## Phase 4 Work (In Progress)

- Added a real submission-driven handoff view: selected returned bank/wallet/provider/app label, UPI approval instructions, processing steps and waiting presentation. The SDK instance and callback listeners remain mounted; only form controls are hidden while submitted. Return-to-payment, status and documented UPI cancel actions retain their existing SDK/server calls. No mock QR, bank OTP page, deep link or paid transition is introduced.
- Re-read [UPI Intent Mobile Web](https://razorpay.com/docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb/): customer-triggered synchronous createPayment, loading until provider response, and payment.cancel are documented. The new UI wraps these existing calls rather than replacing them.
- Countdown remains unimplemented: there is no verified provider expiry in the current UI contract. The legacy desktop SDK payload's timeout is not interpreted as an authoritative deadline or proof of failure. A decorative waiting ring must not pretend to count down. Inline QR/app reopen beyond the existing SDK focus operation remains unproven, not guessed.
- Check-payment-status now says "Checking with Razorpay..." while the existing server read is in progress. Existing server observations/received timestamps stay visible in IST.
- Required final result-screen comparison, not-completed retry presentation, genuine timeout evidence and Phase 4 browser fixtures remain open. This is not Phase 4 completion or a release claim.

Continuation: failed/not-completed screens now hide payable controls while viewing the result. Retry and Choose another method first recover current server status and unlock only the same confirmed resumable order, or server-confirmed absence of any provider order/payment. A captured or unavailable lookup never unlocks retry. Cancellation alone is not a failed result: Not completed requires CREATE_FAILED or a server-confirmed resumable CREATED order without payment ID after local cancellation. Received-payment receipt rows use actual customer/invoice/order/payment references and omit invalid or missing capture timestamps. Technical provider details remain collapsed, including initial server-provided diagnostics. Focused result/handoff unit fixtures pass 9/9; three bounded CI result-screen cases are prepared, not yet accepted.

CI `37231069849` (`79c73ef`) completed: backend and checkout type/lint/build/unit checks passed; retained browsers 25/26; redesign browsers 7/8. The new wallet handoff assertion passed. Phase 2 keyboard acceptance is now explicitly Partial. This is contradictory evidence, not a new task, token-budget reset or a reason for endless repair. Full CI remains red and Phase 6 cannot be closed from these runs.

## Phase 1 Evidence

- README background, summary 20px radius, allowed 400/500/600/700 weights, exact 3px #035a8f focus with 2px offset and reduced motion applied. Existing logo and right-hand Pay association retained.
- Temporary three-hour Home invoice share used only with mocked SDK/payment endpoints. Responsive case passed 1/1; captured/failure provider evidence was not repeated.
- Corrected stale unit assertions to retain the exact new span-based progress structure and README focus color; removed disabled-button opacity reduction. Invoice units pass 29/29.
- Added checkout-scoped ESLint 10/typescript-eslint flat config, following their official configuration docs. It is not a whole-CRM lint claim. One unused existing payment-failed callback parameter renamed without changing behavior.
- Node 26 on the shell generated an engine warning; bundled Node 24.19.0 satisfies the repository engine and is used for subsequent checks. npm audit reports 13 dependency advisories; no broad dependency upgrade/audit-fix was attempted in this checkout UI phase.
- Canonical plan/findings files and concurrent marketing changes remain untouched by this phased goal. Only phase-owned changes are staged.
