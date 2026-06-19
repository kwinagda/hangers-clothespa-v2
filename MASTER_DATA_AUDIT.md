# Master Data Audit

Date: 2026-04-04

Scope reviewed:
- `hangers-crm`
- `hangers-app`
- `hangers-staff-app`
- `hangers-backend`

## Current State

The repo is not fully CRM-mastered yet. Multiple frontend and backend surfaces still define business master data locally in code instead of loading it from a central API.

Several of the highest-impact frontend consumers called out in an earlier pass have now been migrated to `/metadata`. The audit below is updated to focus on remaining drift, not screens that already read backend metadata.

## Highest Priority Findings

### Customer App

- Remaining hardcoded trust / support / quick-action content:
  - [hangers-app/src/screens/HomeScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/HomeScreen.tsx)
- Hardcoded order status labels and icon maps:
  - [hangers-app/src/screens/HomeScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/HomeScreen.tsx)
  - [hangers-app/src/screens/MyOrdersScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/MyOrdersScreen.tsx)
  - [hangers-app/src/screens/OrderTrackingScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/OrderTrackingScreen.tsx)
- Hardcoded payment/status display maps:
  - [hangers-app/src/screens/PaymentHistoryScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/PaymentHistoryScreen.tsx)
  - [hangers-app/src/screens/WalletScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/WalletScreen.tsx)
- Hardcoded profile menu structure:
  - [hangers-app/src/screens/ProfileScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/ProfileScreen.tsx)

### CRM

- Hardcoded order statuses, plant statuses, editable statuses:
  - [hangers-crm/src/app/dashboard/orders/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/orders/page.tsx)
- Hardcoded staff role presentation metadata:
  - [hangers-crm/src/app/dashboard/staff/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/staff/page.tsx)
- Hardcoded payment methods, customer tags, Daily Iron status maps, address defaults:
  - [hangers-crm/src/app/dashboard/customers/[id]/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/customers/[id]/page.tsx)
  - [hangers-crm/src/app/dashboard/orders/new/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/orders/new/page.tsx)

### Staff App

- Hardcoded plant status filters, colors, labels:
  - [hangers-staff-app/src/screens/plant/PlantOrdersList.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantOrdersList.tsx)
- Hardcoded plant dashboard stage cards:
  - [hangers-staff-app/src/screens/plant/PlantDashboard.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantDashboard.tsx)
- Hardcoded plant order detail stages and issue types:
  - [hangers-staff-app/src/screens/plant/PlantOrderDetail.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantOrderDetail.tsx)
- Hardcoded delivery dashboard status mapping:
  - [hangers-staff-app/src/screens/delivery/DeliveryDashboard.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/delivery/DeliveryDashboard.tsx)

### Backend

- Entire service catalog still seeded in code:
  - [hangers-backend/prisma/seed.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/prisma/seed.js)
- Hardcoded delivery status labels and failure reasons:
  - [hangers-backend/src/controllers/delivery.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/delivery.controller.js)
- Hardcoded plant statuses, labels, issue types:
  - [hangers-backend/src/controllers/plant.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/plant.controller.js)
- Hardcoded RBAC role-permission map:
  - [hangers-backend/src/middleware/rbac.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/middleware/rbac.js)
- Hardcoded language lists and message/template maps:
  - [hangers-backend/src/controllers/auth.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/auth.controller.js)
  - [hangers-backend/src/services/whatsapp-notifications.service.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/services/whatsapp-notifications.service.js)
  - [hangers-backend/src/controllers/iron.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/iron.controller.js)
- Hardcoded default address label:
  - [hangers-backend/src/controllers/addresses.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/addresses.controller.js)

## Remediation Strategy

### Phase 1

Create a centralized metadata API in backend and migrate first-order consumers:
- order statuses
- staff roles
- marketing triggers
- marketing audiences
- payment methods
- address labels
- customer tags
- languages

### Phase 2

Move all list-like master data in frontend screens to metadata calls:
- CRM orders/staff/marketing/customers/new-order
- customer app home/profile/saved-addresses/orders/tracking
- staff app plant/delivery screens

### Phase 3

Move backend business-rule constants into metadata/settings tables where operationally appropriate, while keeping code-level enums only where required for correctness.

## Changes Started In This Pass

This pass begins centralizing metadata with a backend metadata API and migrates the highest-impact consumers first.

## Hardening Follow-Up

Date: 2026-04-05

Additional context from the backend / UI hardening pass:

- Customer pickup booking now resolves pricing from backend `Service` records by `serviceId` instead of trusting client-submitted unit prices.
- Staff administration now enforces role hierarchy server-side for updates, deactivate/reactivate actions, and PIN resets.
- Razorpay payment creation/verification now uses backend-calculated balance due and blocks duplicate payment-ID reuse.
- Staff wallet application now verifies customer-to-order ownership and respects write-offs when computing remaining balance.
- Challan and vendor-bill PDF endpoints are no longer public.
- Settings and staff-wallet routes are now restricted beyond bare `staffAuth`.
- Legacy `phaseA` attendance / receivable / return-order bugs have started to be corrected, but that controller remains a high-risk audit area.
- `phaseA` routes now have initial role-based tightening for finance/admin/office/plant-transfer actions instead of relying on bare authentication.
- `phaseA` report/search fixes now include corrected revenue/payment aggregations, garment counting, and order amount filtering; remaining logic in that controller still needs line-by-line review.
- Remaining frontend async surfaces continue to be migrated away from silent failures toward explicit retry / toast states.

Source-of-truth rule reinforced:

- Master data must stay centralized behind the existing backend master-data / metadata API.
- Do not add a new database, sidecar store, or parallel master-data source for labels, statuses, roles, payment methods, or similar business configuration.

## Hardening Follow-Up 2

Date: 2026-04-05

Additional fixes completed after the previous audit note:

- CRM:
  - recurring pickups page now exposes load/create/toggle failures instead of failing quietly
  - promotions page now exposes metadata/coupon/loyalty/upcharge failures and validates create actions in UI
  - return-order page now exposes metadata/create failures and validates custom reasons
- Staff app:
  - delivery order detail now shows a real retryable error state when the order payload fails to load
  - plant order detail now clears stale metadata-derived stage/issue state if metadata loading fails
- Customer app:
  - Daily Iron screen now has an explicit retryable load error state instead of alert-only failure handling
  - My Orders / Order Tracking / Payment History / Saved Addresses / Profile now clear or fall back safely when metadata lookups fail
  - payment WebView response parsing now surfaces malformed gateway responses instead of silently swallowing them
- Backend:
  - duplicate legacy challan endpoints under `phaseA` were removed from route mounting to eliminate route drift against the dedicated challan controller
  - challan routes now require role-appropriate access instead of bare `staffAuth`
  - challan creation now rejects duplicate order IDs, non-ready orders, and orders already tied to active challans
  - challan item receiving now validates ownership, quantity bounds, and no longer compares against a nonexistent `totalQty` field
  - vendor-bill creation now rejects duplicate challan IDs and challans not ready for billing
  - vendor-bill payment now rejects double-pay attempts
  - settings updates now whitelist supported keys and numeric values
  - `phaseA` coupon / loyalty / upcharge / recurring-pickup / return-order flows now have stronger input validation and existence checks
  - recurring pickup listing now includes inactive rows so paused schedules remain operationally visible
  - return-order creation now preserves original-order lifecycle history instead of cancelling the original order

## Hardening Follow-Up 3

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend:
  - `phaseA` cashbook entries now validate entry type, amount, and description before write
  - `phaseA` expenses now validate category, description, amount, and date; delete now checks existence first
  - `phaseA` transfer creation/update now validates plant combinations, bag counts, order existence, status values, and disallows regressing received transfers
  - `phaseA` coupon validation now validates code/order value input instead of trusting request shape
  - `phaseA` customer-tag updates now check customer existence
  - `phaseA` campaign creation now validates name/message/audience and send now blocks empty messages
  - `phaseA` reports/search now validate date/page/limit/amount inputs more defensively
  - `phaseA` automation create/update/toggle now validate required fields/channel/delay and check existence
  - backend CORS handling now explicitly allows configured origins plus no-origin/native requests instead of a broad static list only
- CRM:
  - `orders/new` now surfaces metadata/search/selected-customer fallback failures more explicitly and clears stale stats on partial fallback
  - customer detail page now surfaces metadata load failure instead of silently proceeding with stale options
  - Plant challans now surfaces plant-partner metadata failure instead of silently clearing defaults

## Hardening Follow-Up 4

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend auth/session:
  - auth middleware now preserves the extracted active token on `req.authToken` after validation
  - customer logout now revokes the active session token consistently even when the request did not use an `Authorization` header
  - staff logout now revokes the active session token consistently for both bearer-token and CRM-cookie flows
  - customer and staff login flows now trim older sessions so session tables do not grow unbounded per account
  - CRM auth cookie max-age now aligns with the configured staff JWT/session expiry instead of a separate hardcoded lifetime

Verification for this follow-up:

- `npm run build` in `hangers-crm`

## Hardening Follow-Up 14

Date: 2026-04-05

Referral program was rebuilt into a stronger qualified-reward model using the same master database:

- previous referral behavior credited both parties immediately at signup / OTP verification
- this was hardened into a pending-to-rewarded lifecycle:
  - referral code captured at signup
  - invalid or inactive referral codes are rejected
  - referral row created in `PENDING` state
  - no wallet reward at signup
  - reward issued only after the referred customer’s first qualifying order
- qualifying rule now implemented:
  - order must be `DELIVERED`
  - order payment status must be `PAID`
  - order total must meet the configured minimum qualifying amount
  - only the first qualifying order can unlock the reward
- reward is now configurable from CRM using the existing `settings` table in the same master database:
  - `referral_reward_percent`
  - `referral_reward_cap`
  - `referral_min_order_amount`
  - `referral_program_enabled`
- backend defaults when settings are absent:
  - reward percent `20`
  - reward cap `200`
  - minimum order amount `300`
- reward is now wallet credit based on qualifying order value rather than a flat signup bonus
- referral lifecycle fields were added to the existing `referrals` table in the master database:
  - status
  - reward percent
  - qualified timestamp
  - rewarded timestamp
  - qualifying order id
- reward qualification is now checked from existing order/payment flows:
  - order delivered transitions
  - CRM/staff payment recording
  - delivery cash collection
  - Razorpay verification
- customer app referral copy was aligned with the true rule
- CRM referrals page now also acts as the operational control panel for referral settings
- CRM customer profile now shows pending referral count and the current rule summary
- no separate referral database, shadow settings store, or external reward ledger was introduced

Verification for this follow-up:

- `npx prisma generate` in `hangers-backend`
- `npx prisma db push` in `hangers-backend`
- backend controller/service load check for auth/referral/customer logic
- backend restarted on port `5001`
- CRM restarted on port `5002`
- `/api/v1/metadata` on port `5001` returned HTTP 200
- `/dashboard/referrals` on port `5002` returned HTTP 200

## Hardening Follow-Up 13

Date: 2026-04-05

Additional CRM customer/referral visibility work completed after the previous follow-up:

- customer profile backend now exposes more CRM-visible state from existing master data only:
  - `notificationSummary` derived from the current customer preference fields (`notifWhatsApp`, `notifPush`, `pushToken`, `preferredLanguage`)
  - `paymentSummary` and recent `paymentEvents` derived from existing `payments` rows linked by `customerId` and/or `order.customerId`
- CRM customer profile now shows:
  - notification preference visibility for WhatsApp, push, push-token presence, and preferred language
  - recent payment-event visibility with amount, method, order, reference, collector, timestamp, and status
- a dedicated CRM referrals page was added at `/dashboard/referrals`
- backend route `GET /api/v1/customers/referrals/report` was added under the existing customer route surface with existing `customers.view` permission protection
- the referrals report is backed only by existing `referrals` and `customers` tables and returns:
  - summary totals
  - top referrers leaderboard
  - recent referral activity
  - optional date filtering
- no new database, reporting store, or side table was introduced for referral analytics or payment visibility

Verification for this follow-up:

- backend controller/route load check for the modified customer controller and routes
- `/api/v1/metadata` on port `5001` returned HTTP 200
- clean CRM restart after deleting `hangers-crm/.next`
- `/dashboard/referrals` on port `5002` returned HTTP 200
- `/dashboard/customers/test` on port `5002` returned HTTP 200 to confirm the profile route compiled after the changes

## Hardening Follow-Up 13

Date: 2026-04-05

Additional CRM page-load hardening completed after the previous follow-up:

- customer detail page now defensively normalizes wrapped arrays for orders, addresses, Daily Iron logs, bills, rates, and customer metadata option lists before rendering
- plant challans page now normalizes plant partner metadata, order search results, challan detail payloads, and vendor-pricing service catalog payloads before list/filter/render logic
- customer pricing page now normalizes catalog sections/items before rendering the rate-card UI, reducing the chance of a blank page from partial or wrapped catalog responses
- dashboard layout auth bootstrap now tolerates slightly different auth / staff-role metadata shapes instead of assuming only one exact response structure
- marketing page action handlers now unwrap created campaign / automation records and send-count responses more defensively so local list state does not become malformed after successful actions
- attendance page now falls back to safe empty lists when staff or attendance fetches fail, preventing page-state poisoning after a fetch failure
- representative CRM routes were probed after restart and returned HTTP 200:
  - `/login`
  - `/dashboard`
  - `/dashboard/customers`
  - `/dashboard/orders`
  - `/dashboard/orders/new`
  - `/dashboard/recurring`
  - `/dashboard/plantchallans`
  - `/dashboard/finance`
  - `/dashboard/marketing`
  - `/dashboard/pricing`
  - `/dashboard/reports`

Verification for this follow-up:

- clean CRM restart after deleting `hangers-crm/.next`
- representative CRM route probes returned HTTP 200 on port `5002`

## Hardening Follow-Up 14

Date: 2026-04-05

Additional CRM runtime guidance captured after the previous follow-up:

- localhost CRM instability was traced to a dev/build workflow conflict where `next build` and `next dev` both wrote to the same `.next` directory
- this caused intermittent missing chunk / missing manifest failures and white-page `500` responses on otherwise valid CRM routes
- operational guidance for future work:
  - do not run `npm run build` on top of a currently running CRM dev server
  - if a build is needed, stop CRM dev first, run build, then restart `npm run dev`
  - when the dev runtime is already corrupted, recover by killing the process on `5002`, deleting `hangers-crm/.next`, and restarting CRM

Verification for this follow-up:

- clean CRM restart after removing `hangers-crm/.next`
- `http://localhost:5002/login` returned HTTP 200
- `http://localhost:5002/dashboard/reports` returned HTTP 200

## Hardening Follow-Up 13

Date: 2026-04-05

Additional CRM page fixes completed after the previous follow-up:

- challan/vendor pricing page:
  - fixed vendor pricing to load against the real flattened catalog response shape
  - stabilized vendor pricing category selection and cleaned up bill modal reset behavior
  - refreshed the page header/shell into the newer CRM workspace style
- recurring pickups page:
  - fixed monthly recurring pickup creation by supporting `dayOfMonth`
  - made weekly/monthly schedule fields conditional to the selected frequency
  - improved schedule display in the recurring list so it reflects daily/weekly/monthly patterns correctly
  - refreshed the page header/shell into the newer CRM workspace style

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load check for:
  - `src/middleware/auth.js`
  - `src/controllers/auth.controller.js`
  - `src/controllers/staffAuth.controller.js`

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load check for:
  - `src/controllers/phaseA.controller.js`
  - `src/routes/phaseA.routes.js`
  - `src/routes/challan.routes.js`

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load check for:
  - `src/controllers/phaseA.controller.js`
  - `src/controllers/challan.controller.js`
  - `src/controllers/settings.controller.js`
  - `src/routes/challan.routes.js`

## Hardening Follow-Up 5

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend plant flow:
  - plant order listing now validates `page`, `limit`, and status filter inputs
  - plant stage updates now block backward jumps, same-stage no-ops, and multi-step skips in the plant workflow
  - plant issue flags now validate `itemIndex` bounds and issue-type input more defensively
- Backend iron flow:
  - iron subscription list/status filters now validate against allowed statuses
  - iron log period endpoints now reject inverted/invalid date windows
  - iron bill sending now blocks zero-value bills
  - iron bill payment now validates payment method and caps payment application at balance due
  - customer monthly iron log queries now validate month/year bounds
  - iron staff routes are now restricted to operational CRM roles rather than generic staff auth
- Backend orders/payments/checkout:
  - order listing now validates pagination and date filters
  - order creation/add-items now validates item payloads and blocks negative pricing / missing service names
  - order status updates now block backward progression through the main workflow
  - payment controller now validates payment method, daily summary date input, and receivable balances against write-offs
  - checkout coupon/loyalty validation now validates request numeric inputs and supports current percent coupon naming safely

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load check for:
  - `src/controllers/plant.controller.js`
  - `src/controllers/iron.controller.js`
  - `src/controllers/orders.controller.js`
  - `src/controllers/payments.controller.js`
  - `src/controllers/checkout.controller.js`
  - `src/routes/plant.routes.js`
  - `src/routes/iron.routes.js`
  - `src/routes/orders.routes.js`

## Hardening Follow-Up 6

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- CRM:
  - staff page now surfaces staff-role metadata load failures with a toast and clears stale role options instead of silently failing
  - iron applications page now surfaces language-label metadata load failures with a toast and clears stale label mappings
  - order-detail page now surfaces metadata load failures, clears stale derived metadata state, and avoids quietly rendering outdated labels/options
- Customer app:
  - Book Pickup now alerts when saved addresses fail to load and falls back to manual-address entry instead of silently degrading
  - Book Pickup now alerts when pickup-draft restore fails instead of silently swallowing local draft errors

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load check for:
  - `src/controllers/plant.controller.js`
  - `src/controllers/iron.controller.js`
  - `src/controllers/orders.controller.js`
  - `src/controllers/payments.controller.js`
  - `src/controllers/checkout.controller.js`
  - `src/controllers/auth.controller.js`
  - `src/controllers/staffAuth.controller.js`
  - `src/middleware/auth.js`
  - `src/routes/plant.routes.js`
  - `src/routes/iron.routes.js`
  - `src/routes/orders.routes.js`

## Hardening Follow-Up 7

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend platform/security:
  - API entrypoint now disables `x-powered-by`, trusts the first proxy hop, accepts comma-separated `ALLOWED_ORIGINS`, applies stricter Helmet defaults, and reduces overly broad JSON/urlencoded body-parser limits
  - centralized error handler now returns a generic 500 message outside development instead of leaking raw server error text
  - JWT service now supports explicit expiry overrides and parses expiry values more defensively
  - staff PIN login now aligns session expiry with JWT expiry configuration via `JWT_STAFF_PIN_EXPIRES_IN` fallback logic and trims stale staff sessions after PIN login
- Customer/staff apps:
  - customer and staff auth API services now log secure-storage read/clear failures instead of silently swallowing them
  - customer/staff logout helpers now log failed remote logout attempts before clearing local session state
  - customer Book Pickup draft persistence now logs local draft save/reset/clear failures instead of failing silently

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend module load check for:
  - `src/services/jwt.service.js`
  - `src/middleware/errorHandler.js`
  - `src/controllers/staffPinAuth.controller.js`
  - `src/controllers/staffAuth.controller.js`

## Hardening Follow-Up 8

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend customer/admin surfaces:
  - CRM customer routes now require `customers.view` / `customers.edit` permissions instead of broad staff authentication
  - CRM customer listing now validates pagination more defensively
  - CRM customer create now enforces valid 10-digit customer phone input and rejects too-short names
  - CRM customer update now validates customer tag, DOB, and existence before update
  - CRM-added customer addresses now validate label, pincode, coordinates, and explicit default handling
  - pricing catalog upsert now rejects invalid or negative prices and duplicate service names within the same category
  - public service listing now rejects empty category filters instead of treating them as ambiguous input
  - customer-owned address create/update now validates label, pincode, coordinates, and explicit default handling more defensively

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend module load check for:
  - `src/controllers/customers.controller.js`
  - `src/controllers/services.controller.js`
  - `src/controllers/addresses.controller.js`
  - `src/routes/customers.routes.js`
  - `src/routes/services.routes.js`
  - `src/routes/addresses.routes.js`

## Hardening Follow-Up 9

Date: 2026-04-05

Additional fixes completed after the previous follow-up:

- Backend route access:
  - order routes now require explicit order permissions/roles for list, stats, create, status updates, item edits, deletes, and payment recording instead of broad `staffAuth`
  - payments routes now require finance roles instead of any logged-in staff
  - checkout validation routes now require office roles instead of any logged-in staff
- Dependency/security cleanup:
  - removed unused `html-pdf-node` from backend, eliminating the old vulnerable nested Puppeteer tree
  - upgraded backend Express to `4.22.1`
  - upgraded CRM Next.js to `15.5.14`
  - refreshed customer/staff app lockfiles with package-lock-only audit fixes
  - all four project lockfiles now report zero `npm audit` vulnerabilities
- CRM compatibility:
  - order-detail page now uses `useParams` instead of the older client-page `params` prop shape required before the Next 15 upgrade
  - CRM `next.config.js` now sets `outputFileTracingRoot` to avoid incorrect workspace-root detection with multiple lockfiles

Verification for this follow-up:

- `npm audit --json` reports zero vulnerabilities in:
  - `hangers-backend`
  - `hangers-crm`
  - `hangers-app`
  - `hangers-staff-app`
- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend module/route load check for:
  - `src/controllers/customers.controller.js`
  - `src/controllers/services.controller.js`
  - `src/controllers/addresses.controller.js`
  - `src/routes/customers.routes.js`
  - `src/routes/services.routes.js`
  - `src/routes/addresses.routes.js`
  - `src/routes/orders.routes.js`
  - `src/routes/payments.routes.js`
  - `src/routes/checkout.routes.js`

## Recommended Next Phase

Date: 2026-04-05

After this hardening pass, the recommended next work is no longer another broad audit.

- treat the security/correctness hardening phase as largely complete
- move to targeted feature work, specific bug fixing, or workflow improvements
- add focused tests around auth/session, order lifecycle, payments/write-offs/wallet, delivery OTP, and challan/vendor billing
- follow with narrower cleanup of dead code, duplicated helpers, and stale comments
- use manual smoke testing for login, order flows, payments, delivery, and CRM critical paths before release/deployment work
- push-notification future work:
  - CRM currently has push-status visibility only; manual CRM-triggered push sending is not implemented
  - backend contains automatic push hooks for selected order-status events, but `expo-server-sdk` is not yet installed/configured, so push delivery should not be treated as fully live
  - future implementation should stay on the existing backend/master-data path:
    - enable Expo push delivery in backend
    - add backend endpoint(s) for manual/test push sends
    - add CRM controls such as test push or template-based manual push
    - avoid creating a side notification database/store

## Go-Live Guidance

Date: 2026-04-05

Current recommendation is not to jump straight to a full public rollout.

- treat the next phase as release-readiness and controlled pilot work
- complete manual end-to-end smoke testing with production-like data before broader launch
- validate production env/config for auth, payments, OTP/notifications, CORS/app URLs, and secure session behavior
- prefer a small internal or trusted-customer pilot before opening to all live customers
- ensure backup, rollback, and operational support handling is defined before a broad launch

## Hardening Follow-Up 10

Date: 2026-04-05

Additional CRM UX/runtime work completed after the previous follow-up:

- CRM UX/layout cleanup:
  - login page now uses a single larger logo instead of duplicated logo treatments
  - sidebar branding is center-aligned with the logo at the top and `CRM WORKSPACE` centered below
  - removed the sidebar helper sentence about grouped navigation
  - floating `New Order` CTA is hidden on `/dashboard/orders/new`
  - removed the duplicate standard `New Order` button from the main dashboard so the floating CTA remains the primary create action there
- CRM dashboard redesign:
  - dashboard home was redesigned into a more industry-style operations layout with clearer KPI, workflow, quick-action, Daily Iron, and recent-order sections
  - redesign uses existing APIs only and stays aligned with the current master-data/backend structure
- CRM reports redesign:
  - reports page was redesigned into a reporting workspace on top of the existing report endpoint and current supported report types
  - suggested future report categories shown in the UI are informational ideas based on existing master database coverage only; no new backend report types or separate reporting store were created
- CRM plant challans pricing:
  - vendor pricing now supports vendor-wise rate card download and CSV bulk upload from the CRM page
  - upload stays on the existing master-data path only by calling `/vendor-prices/bulk`, which upserts into the current backend vendor price table; no new database/store was introduced
- CRM array-shape reliability:
  - several CRM list pages were hardened to normalize wrapped array responses before using pagination or filters
  - this closes the same runtime bug class seen in recurring pickups, plant challans, marketing, and customer detail-adjacent CRM pages, where pages assumed a raw array and failed on `.slice`/`.filter`
- CRM customer pricing:
  - customer-facing pricing now supports CSV rate-card download and bulk upload on `/dashboard/pricing`
  - upload stays on the existing services catalog flow by replacing the catalog through `PUT /services`; no new database/store was introduced
- CRM referrals visibility:
  - referral program remains wallet-credit based at signup and is separate from coupon validation
  - CRM customer detail now shows referral code, referral source, referral count, and recent earned referral credits using current master DB data
- CRM runtime stability note:
  - intermittent white page / `500` / Webpack runtime crashes were traced to corrupted `.next` output after recent framework/UI changes
  - clean recovery was:
    - stop the current process on port `5002`
    - delete `hangers-crm/.next`
    - restart CRM dev server
  - this restored `/login` and `/dashboard` successfully

Verification for this follow-up:

- `rm -rf .next && npm run build` in `hangers-crm`
- fresh CRM dev-server restart on port `5002`
- `/login` on port `5002` returned HTTP 200 after the clean restart
- `/dashboard` on port `5002` returned HTTP 200 after the clean restart

## Hardening Follow-Up 11

Date: 2026-04-05

Additional reporting/runtime fixes completed after the previous follow-up:

- Report date-range correctness:
  - fixed a timezone-boundary bug where CRM quick-range presets such as “This Month” could send the previous calendar date because of `toISOString()` conversion
  - CRM reports page now formats local `YYYY-MM-DD` values directly for preset ranges and initial date state
  - backend report controller now parses `from` / `to` as local day boundaries instead of mixing plain date parsing with a UTC end-of-day suffix
  - result: monthly and other date-based report ranges now stay aligned with the intended local calendar period
- Localhost runtime state:
  - backend was brought up cleanly on port `5001`
  - CRM was brought up cleanly on port `5002`

Verification for this follow-up:

- `npm run build` in `hangers-crm`
- backend module load check for `src/controllers/phaseA.controller.js`
- `http://localhost:5001/api/v1/metadata` returned HTTP 200
- `http://localhost:5002/login` returned HTTP 200

## Hardening Follow-Up 12

Date: 2026-04-05

Additional CRM UX work completed after the previous follow-up:

- order detail page was redesigned into a more industry-style operations workspace without changing the underlying order actions
- orders list page was redesigned into a cleaner queue/operations screen with KPI summary, clearer filter controls, and the same existing challan/status/print behavior
- customer profile page shell was redesigned with a stronger hero, KPI strip, updated tab treatment, and overview cards aligned with the newer CRM visual language

Verification for this follow-up:

- `npm run build` in `hangers-crm`

## Hardening Follow-Up 13

Date: 2026-04-05

Live referral-program verification completed against the existing master database:

- real test customers were created and linked through the live referral flow:
  - referrer phone `9408571217`
  - referred phone `8408571217`
  - referrer code `HANGRQCQ`
- verified referral lifecycle:
  - signup with a valid referral code created a `PENDING` referral row with `creditAwarded: 0`
  - after the qualifying order was only `DELIVERED`, the referral still remained `PENDING`
  - after the same order was also marked `PAID`, the referral changed to `REWARDED`
- verified reward math:
  - qualifying order total: `₹300`
  - configured reward percent: `20%`
  - credited amount: `₹60` to the referrer and `₹60` to the referred customer
- verified ledger impact:
  - wallet balances increased correctly on both customer records
  - wallet transactions were written with:
    - `REFERRAL_REWARD_REFERRER`
    - `REFERRAL_REWARD_REFERRED`
- live qualifying order used:
  - order id `cmnm0iwjp000ouc6w0hrmmvu2`
  - service `Bedspread-Double`
  - category `DRY CLEAN — HOUSE HOLD`
  - base price `300`
- test/setup findings exposed during live verification:
  - customer signup/OTP flow did not leave a saved address on the created test user, so the test had to create the address through the existing `/addresses` API before booking a pickup
  - the customer pickup API requires the full pickup address string plus optional `savedAddressId`; sending only `addressId` fails with `pickupDate and address are required`
- important conclusion:
  - referral qualification and reward-release logic now works correctly against the live backend and master DB
  - the remaining issues discovered in this live test are setup/API-contract quirks around address handling, not failures in the referral reward lifecycle

Verification for this follow-up:

- live API-driven signup and referral creation completed against backend on port `5001`
- live referral row verified in master DB as `PENDING` before qualification
- live pickup order created through the customer API after creating a saved address through the existing addresses API
- referral remained `PENDING` after `DELIVERED` only
- referral changed to `REWARDED` after `PAID`
- wallet balances and wallet transactions verified in the master DB

## Hardening Follow-Up 14

Date: 2026-04-05

Signup-address flow was aligned with the desired customer journey:

- `/auth/verify-otp` now accepts optional address data for first-time customer registration
- when a brand-new customer signs up with valid address fields, backend now creates the default saved address immediately in the existing `Address` table
- returning-customer OTP login remains unchanged and does not create or overwrite saved addresses
- customer app OTP verification screen now collects:
  - customer name
  - first pickup address line
  - optional second line / landmark
  - city
  - pincode
- this removes the earlier gap where a newly registered customer could exist without any saved address unless the app separately called `/addresses`

Verification for this follow-up:

- backend controller load check passed for `src/controllers/auth.controller.js`
- `npx tsc --noEmit` passed in `hangers-app`

## Hardening Follow-Up 15

Date: 2026-04-05

CRM dashboard collection metric was corrected:

- the dashboard stat previously labeled as revenue/collections was summing `order.totalAmount` for orders created today that were now `DELIVERED`
- this overstated actual collections and was exposed by the live referral test order, which appeared as `₹300` on the dashboard despite having no payment rows recorded for today
- backend fix:
  - `src/controllers/orders.controller.js` now calculates dashboard `today.revenue` and `allTime.revenue` from the `Payment` table
  - failed payments are excluded
- CRM copy fix:
  - dashboard card note now explicitly says `Actual payments recorded today`
- live verification after the fix:
  - master DB `todayCollections` = `0`
  - CRM and backend were restarted successfully and dashboard routes responded again on localhost

Verification for this follow-up:

- backend controller load check passed for `src/controllers/orders.controller.js`
- live payment aggregation in master DB returned `todayCollections: 0`
- backend metadata and CRM dashboard routes were healthy after restart

## Hardening Follow-Up 16

Date: 2026-04-05

Order workflow correction rules were upgraded from a blanket block to a controlled exception model:

- backend order-status updates now support specific approved backward transitions instead of either:
  - allowing dangerous exceptions accidentally, or
  - blocking every backward movement regardless of operational need
- approved backward / restore transitions now include:
  - `PICKED_UP -> PENDING`
  - `PROCESSING -> PICKED_UP`
  - `WASHING -> PROCESSING`
  - `DRYING -> WASHING`
  - `IRONING -> DRYING`
  - `QC -> IRONING`
  - `READY_FOR_DELIVERY -> QC`
  - `OUT_FOR_DELIVERY -> READY_FOR_DELIVERY`
  - `CANCELLED -> PENDING`
- governance added:
  - backward / cancel / restore actions now require a reason note
  - backward / cancel / restore actions now require elevated correction authority (`SUPER_ADMIN`, `MANAGER`, or explicit `orders.edit`)
  - delivered-order correction is treated as high-risk and is restricted to `SUPER_ADMIN`
- delivered/cancel protection added:
  - delivered orders cannot be cancelled
  - delivered orders are locked from normal workflow changes
  - the only allowed delivered correction path is `DELIVERED -> READY_FOR_DELIVERY`, and only for super admin with a required reason
- audit trail improved:
  - stage notes now carry prefixes such as `[REVERSAL]`, `[CANCELLED]`, `[RESTORED]`, and `[HIGH_RISK_CORRECTION]`
  - activity log action names now distinguish normal updates from reversals/cancellations/restores/high-risk corrections
- CRM UX updated:
  - order detail page now prompts for a mandatory reason when a correction/cancellation/restore/high-risk change is attempted
  - orders list inline status selector now does the same
  - browser-native prompts were subsequently replaced with CRM in-page modal dialogs for the required reason capture
  - order detail timeline now refreshes immediately after status change by reloading the full order
  - correction stage notes are rendered with cleaner UI labels instead of exposing raw audit prefixes as the main visible text
- source-of-truth rule reconfirmed:
  - CRM does not persist order workflow state on its own
  - all order status reads and writes continue to go through the existing backend API into the same master database only
  - no side workflow store or duplicate status ledger was introduced

Verification for this follow-up:

- backend controller load check passed for `src/controllers/orders.controller.js`
- `npm run build` passed in `hangers-crm`
- backend restarted on `5001`
- CRM restarted on `5002`
- `http://localhost:5001/api/v1/metadata` returned `200`
- `http://localhost:5002/dashboard/orders` returned `200`

## Local Dev Access Note

- current local ports:
  - backend `5001`
  - CRM `5002`
- current local CRM super-admin credential:
  - email `admin@hangers.in`
  - password `Hangers@123`
- this is a local development continuity note only, not a production credential policy

## Hardening Follow-Up 17

Date: 2026-05-01

Afleo-style governance patterns were ported into Hangers on top of the same existing master database instead of introducing any new side store:

- master DB schema expanded to include:
  - `Customer.sessionVersion`
  - `Staff.sessionVersion`
  - `Staff.mustChangePassword`
  - `AuthThrottle`
- all of the above remain in the same existing Prisma/master DB path

What was implemented:

- DB-backed auth throttle state now exists for:
  - customer OTP send
  - customer OTP verify
  - staff password login
  - staff PIN login
- JWT/session hardening now enforces session-version matching in backend auth middleware
- staff role/deactivation/reactivation changes now invalidate active sessions by:
  - incrementing `sessionVersion`
  - deleting `staffSession` rows
- request validation was standardized further with `zod` for:
  - auth payloads
  - staff create/update
  - settings updates
  - order status updates
- private route response handling tightened:
  - private/authenticated route groups now return `Cache-Control: private, no-store`
- browser-origin protection tightened:
  - mutating browser requests now require a trusted configured origin before execution
  - this is intentionally a trusted-origin adaptation, not a blind literal same-origin port from Afleo, because Hangers uses split local origins (`5001` backend, `5002` CRM)

Source-of-truth rule remains unchanged:

- all status updates, auth throttle state, session invalidation state, and settings updates still persist only in the same master database
- CRM/customer/staff/plant/delivery continue to read and write through the existing backend API only
- no extra security database, cache store, or shadow master-data store was created

Verification for this follow-up:

- `npx prisma db push` completed successfully against the existing PostgreSQL master DB
- backend module load check passed for the new middleware/controller/route integration
- `npm run build` passed in `hangers-crm`
- backend restarted on `5001`
- CRM restarted on `5002`
- metadata endpoint and CRM login/dashboard routes returned `200`

## Afleo Gap Check — Residual Items

Date: 2026-05-01

Post-hardening comparison against the Afleo reference confirmed the remaining gaps are now narrower and mostly architectural:

- no real backend automated test layer yet for:
  - session-version invalidation
  - DB-backed throttle behavior
  - trusted-origin browser write protection
  - private `no-store` headers
  - validation schema regressions
- response/error shaping remains inconsistent across several legacy controllers
- schema-based validation is only partial across the backend
- access-denied auditing is not yet as systematic as Afleo
- RBAC governance is still simpler than Afleo's relational model

Source-of-truth note remains unchanged:

- all newly added governance state still lives only in the same master DB
- no second security DB or side master-data store was added

## Hardening Follow-Up 18

Date: 2026-05-01

Second follow-up after the residual Afleo-gap review:

- `ACCESS_DENIED` audit logging was added to the RBAC middleware so denied role/permission checks are now recorded more systematically
- finance-layer validation/response discipline was improved in:
  - `checkout.controller.js`
  - `payments.controller.js`
  - `staff.wallet.controller.js`
- new shared validation file added:
  - `src/validation/finance.schemas.js`
- first automated backend governance tests were added:
  - auth schema tests
  - finance schema tests
  - trusted-origin middleware tests
  - private-cache middleware tests

Verification for this follow-up:

- `npm test` passed in `hangers-backend`
- backend load check passed for the newly normalized controllers and RBAC middleware
- `npm run build` passed in `hangers-crm`
- backend and CRM remained healthy on `5001` / `5002`

## Hardening Follow-Up 19

Date: 2026-05-01

Legacy `phaseA` surface received one more schema/response hardening pass:

- added `src/validation/phaseA.schemas.js`
- high-risk phaseA mutation/query endpoints now use shared schema validation instead of only inline manual checks
- remaining common raw `err.message` 500 responses on the phaseA surface were replaced with safer generic error responses
- JWT/sessionVersion tests were added in `tests/jwt.service.test.js`

Verification for this follow-up:

- backend tests increased to `21` passing tests
- phaseA controller and schema load check passed
- CRM build passed
- CRM restarted cleanly on `5002`

## Hardening Follow-Up 20

Date: 2026-05-01

Final normalization pass after another deep Afleo-vs-Hangers audit:

- remaining backend consistency gaps were closed in:
  - `src/controllers/settings.controller.js`
  - `src/controllers/customer-orders.controller.js`
  - `src/controllers/orders.controller.js`
  - `src/controllers/razorpay.controller.js`
  - `src/controllers/challan.controller.js`
- settings controller no longer uses local raw `ok/bad/err` helpers or exposes raw `e.message`
- customer-orders controller now uses the shared Prisma singleton from `src/config/database.js` instead of opening its own `new PrismaClient()`
- the order-payment write path in `orders.controller.js` now returns normalized `success/badRequest/notFound/error` responses instead of direct raw JSON + runtime message leakage
- Razorpay order creation now logs server-side detail but returns a generic client error message instead of reflecting raw exception text
- challan controller was confirmed normalized onto shared Prisma + shared response helpers across vendor-pricing, challans, vendor bills, and PDF endpoints

Deep residual scan result:

- no leftover controller-local `ok/bad/err` response helper pattern remains in backend controllers
- no leftover extra `new PrismaClient()` remains in backend controllers; only the shared singleton in `src/config/database.js` remains
- no targeted residual raw client-facing `err.message` / `e.message` leak remained in the normalized backend surfaces checked in this pass

Verification for this follow-up:

- backend module load check passed for:
  - `settings.controller.js`
  - `customer-orders.controller.js`
  - `orders.controller.js`
  - `challan.controller.js`
  - `razorpay.controller.js`
- `npm test` passed in `hangers-backend` with `21` passing tests
- `npm run build` passed in `hangers-crm`
- backend restarted cleanly on `5001`
- CRM restarted cleanly on `5002`
- `http://localhost:5001/api/v1/metadata` returned HTTP `200`
- `http://localhost:5002/login` returned HTTP `200`
- `http://localhost:5002/dashboard` returned HTTP `200`

Closure state for the Afleo-style hardening scope:

- the actionable governance/security/API-consistency gaps identified during the deep Afleo reference audit have been patched in Hangers
- anything beyond this point is no longer an unresolved hardening defect from that comparison scope; it would be optional architectural redesign or additional future enhancement work

## Afleo DB/API Architecture Check

Date: 2026-05-01

Important distinction after the final hardening audit:

- Hangers is now much closer to Afleo on security/governance controls
- Afleo still remains cleaner at pure DB/API architecture in a few areas that are not the same as unresolved hardening defects

Where Afleo still leads architecturally:

- relational RBAC/data modeling:
  - Afleo has DB-native `UserRole`, `RolePermission`, and `UserServiceAllowance`
  - Hangers still uses a flatter role-default + override model
- audit model:
  - Afleo has a first-class `AuditLog` schema and richer audit query surface
  - Hangers still uses `ActivityLog`, which is improved but less structured
- auth challenge modeling:
  - Afleo has a richer `AuthLoginChallenge` lifecycle in schema
  - Hangers uses simpler OTP/session flows
- route architecture:
  - Afleo is more uniformly built around shared `requireSession` / `requirePermission` guard patterns
  - Hangers is improved but still more controller-oriented
- transaction discipline:
  - Afleo uses explicit serializable transactions in more critical admin/auth flows
  - Hangers uses transactions where needed, but not as systematically at the same architectural layer

Conclusion:

- Afleo is no longer clearly "winning" on the concrete security/hardening gaps that were actionable in Hangers; those were patched
- Afleo still looks more enterprise-clean in backend architecture and governance design
- matching that exactly would now be a broader architectural rewrite/refactor effort, not a remaining hardening fix

## Architecture Refactor Follow-Up

Date: 2026-05-01

DB/API governance refactor completed to close the remaining Afleo-style architecture gaps without leaving the existing master database path:

- new DB-native governance models were added to the existing master database in `prisma/schema.prisma`:
  - `PermissionCatalog`
  - `StaffRolePermission`
  - `StaffServiceAllowance`
  - `AuditLog`
  - `AuthChallenge`
  - supporting enums:
    - `AuthChallengePurpose`
    - `AuthChallengeStatus`
    - `AuditEventStatus`
- `Staff` now has DB-native service-allowance linkage through `StaffServiceAllowance`

New backend architecture layer added:

- `src/services/accessControl.service.js`
  - synchronizes role-permission defaults into DB tables
  - builds effective permissions from DB role bindings + legacy per-staff overrides
  - builds effective service/module access from DB allowances + role defaults
- `src/services/authChallenge.service.js`
  - structured auth challenge lifecycle for verification codes
  - used for customer OTP and delivery OTP flows
- `src/controllers/security.controller.js`
  - admin query surface for:
    - audit logs
    - auth throttles
    - access catalog
    - staff service-access updates
- `src/routes/security.routes.js`
  - mounted at `/api/v1/security`

Route/service architecture improvements:

- `staffAuth` now attaches:
  - `effectivePermissions`
  - `serviceAccess`
- route groups now enforce DB-backed service/module access in addition to role/permission checks, including:
  - CRM/order/customer routes
  - finance routes
  - plant routes
  - delivery routes
  - challan routes
  - settings routes
  - iron routes
  - wallet routes
- backend startup now syncs the permission catalog and role-permission bindings into the master DB

Audit architecture changes:

- `activity.service.js` now writes to both:
  - legacy `ActivityLog`
  - new structured `AuditLog`
- request context now includes route + method for structured audit entries

Auth challenge architecture changes:

- customer OTP send/verify now also runs through `AuthChallenge`
- delivery OTP send/verify now also runs through `AuthChallenge`
- legacy `OtpVerification` is still preserved for compatibility, but the structured challenge lifecycle is now the authoritative governance layer

Verification for this follow-up:

- `npx prisma db push` passed against the existing PostgreSQL master DB
- backend architecture load check passed
- backend tests increased to `24` passing tests
- `npm run build` passed in `hangers-crm`
- backend restarted on `5001`
- CRM restarted on `5002`
- `http://localhost:5001/api/v1/metadata` returned HTTP `200`
- `http://localhost:5002/login` returned HTTP `200`
- `http://localhost:5002/dashboard` returned HTTP `200`

Current conclusion:

- the previous remaining Afleo advantage on backend governance architecture was materially reduced by this refactor
- any further move toward Afleo would now be a larger product/organization design choice, not an obviously missing core DB/API governance layer in Hangers

## CTO-Level SaaS Hardening + Domain Decomposition

Date: 2026-06-17

Commits: `1427689` → `36a25ed` → `c4a5945` (HEAD on main)

### Race-Condition and Financial Integrity Fixes

All 15 CONFIRMED findings from the ultra code review patched and verified:

- Razorpay: client-supplied `amount` removed; backend uses server-computed `balanceDue` exclusively
- Referral qualification: now runs inside `Serializable` transaction
- Staff wallet `deductWallet` / `applyWalletToOrder`: balance reads moved inside transactions; typed error codes for every path
- Customer pickup `requestPickup`: wallet balance read moved inside the order-creation transaction
- Delivery `markFailed`: status guard added (must be `OUT_FOR_DELIVERY` or `READY_FOR_DELIVERY`)
- Delivery `collectCash`: rewritten with `{ increment: amt }` inside interactive transaction; paymentStatus re-derived post-update
- Delivery OTP: dead `otpRecord` pre-fetch removed; `updateMany` used to mark OTPs; `verifyAuthChallenge` is authoritative NOT_FOUND
- Origin middleware: `return fetchSiteAllowed === true` (was `return true` on null)
- Coupon validation: atomically checks and increments `usedCount` inside a single transaction (TOCTOU fix)
- Payment state: `currentWriteOff` now included in `balanceDue` and `effectivePaid`
- Order status sequence: `SENT_TO_PLANT` and `RETURNED` added; backward transitions corrected
- `addItemsToOrder`: blocked on DELIVERED/CANCELLED/RETURNED orders; recomputes `paymentStatus` after add
- Referral fallback: `REFERRAL_STATUS.REWARDED` → `REFERRAL_STATUS.PENDING`
- OTP cooldown: enforced at `AuthChallenge` layer; `OTP_COOLDOWN` typed error with `secondsLeft`
- Payment route access: `financeAccess` → `crmAccess` so `COUNTER_STAFF` can record payments

### Domain Decomposition — phaseA Deleted

`phaseA.controller.js` (1,037 lines), `phaseA.routes.js`, and `phaseA.schemas.js` were permanently deleted.

13 domain controllers now own those endpoints:

- `cashbook.controller.js` / `expenses.controller.js` / `ar-ledger.controller.js`
- `transfers.controller.js` / `attendance.controller.js`
- `coupons.controller.js` / `loyalty.controller.js` / `upcharges.controller.js`
- `recurring.controller.js` / `campaigns.controller.js` / `automations.controller.js`
- `reports.controller.js` / `search.controller.js`

All registered in `src/index.js`.

### Infrastructure Added

- `asyncHandler.js` middleware — eliminates try/catch boilerplate in route handlers
- `idempotency.js` middleware — idempotency key enforcement on payment mutations
- BullMQ queues: `notifications.queue.js`, `pdf.queue.js`, `connection.js` (Redis with fallback)
- `sse.service.js` — Server-Sent Events for real-time plant/order board
- `wallet.service.js` — centralized wallet service; replace any future inline wallet mutations with this

### DB Changes

- 12 composite indexes added to `prisma/schema.prisma`
- `Serializable` isolation level on referral qualification transaction

### CRM Changes

- React Query v5 installed; `QueryProvider` added to layout
- Shared UI library: `hangers-crm/src/components/ui/` (Badge, Button, EmptyState, ErrorState, PageHeader, StatCard)
- `hangers-crm/src/lib/queries.ts` — shared query definitions

### CI/CD

- `.github/workflows/ci.yml` — GitHub Actions pipeline (lint → type-check → test → build)
- `hangers-backend/tsconfig.json` — TypeScript config for backend

### Source-of-Truth Status After This Batch

Source-of-truth rule: unchanged. All data still flows through the existing backend API into the same master PostgreSQL database. No new store, sidecar, or shadow DB was added.

Remaining open items from original audit (still unresolved):

- Customer app hardcoded order status labels and icon maps (HomeScreen, MyOrdersScreen, OrderTrackingScreen)
- Staff app hardcoded plant status filters and delivery dashboard status mapping
- Backend hardcoded delivery failure reasons and plant status labels in controllers
- RBAC role-permission map still partially config-driven (DB-native tables exist but legacy config still used)

These are lower-priority than the security/correctness fixes completed above. They do not break correctness — they are metadata-drift items to clean up in a future targeted pass.

### Current Recommended Next Steps

1. Pre-launch smoke test — login, order create/update, payments, delivery, CRM critical paths
2. Push notification wiring — install `expo-server-sdk` and connect backend queue to Expo push gateway
3. Metadata migration follow-up — move remaining hardcoded status/label maps in customer/staff apps to `/metadata` calls
4. Targeted feature work — Daily Iron bill PDF share, delivery exception flows, CRM push send action

---

## Design System Sync — 2026-06-19

### What Was Done

First-time import of the CRM's UI component library into claude.ai/design.

**Project:** "Hangers CRM Design System"
**Project ID:** `68e80ff6-61ab-4f72-9ea5-facbb2cc753c`
**URL:** https://claude.ai/design/p/68e80ff6-61ab-4f72-9ea5-facbb2cc753c

### Components Synced (11)

| Component | Preview Stories | Styling |
|---|---|---|
| `Button` | AllVariants, AllSizes, States | Tailwind classes |
| `Badge` | OrderStatuses, CustomColor | Inline styles |
| `StatCard` | KPIGrid, LoadingState | Inline styles |
| `PageHeader` | WithActions, Simple | Inline styles |
| `EmptyState` | WithAction, NoAction | Inline styles |
| `ErrorState` | WithRetry, NoRetry | Inline styles |
| `InlineLoader` | DefaultTone, LightTone | Custom CSS classes |
| `SkeletonLine` | ContentSkeleton | Custom CSS class |
| `SkeletonCard` | GridLayout | Custom CSS classes |
| `TableLoader` | Default | Inline + custom CSS |
| `PaginationControls` | Default | Inline styles |

### Config Files Added

- `.design-sync/config.json` — sync config with projectId, componentSrcMap, cssEntry
- `.design-sync/previews/*.tsx` — 11 owned preview files (one per component)
- `.ds-sync/` — converter scripts (not committed to git; staged locally)
- `hangers-crm/ds-compiled-styles.css` — compiled Tailwind output (gitignored)
- `ds-bundle/` — build output (gitignored)

### How to Re-sync After Component Changes

```bash
# 1. Recompile CSS (if globals.css changed)
cd hangers-crm && npx tailwindcss -i src/app/globals.css -o ds-compiled-styles.css && cd ..

# 2. Rebuild bundle
node .ds-sync/package-build.mjs \
  --config .design-sync/config.json \
  --node-modules ./hangers-crm/node_modules \
  --entry ./hangers-crm/src/components/ui/index.ts \
  --out ./ds-bundle

# 3. Validate
node .ds-sync/package-validate.mjs ./ds-bundle --no-render-check

# 4. Upload via DesignSync tool (in Claude Code session)
```

### Notes

- The CRM has no `dist/` build step for the component library (it's a Next.js app). The converter runs in synth-entry mode using `componentSrcMap` to discover all 11 exports.
- The `next-env.d.ts` is the only `.d.ts` file in the project root; `.d.ts` contract generation is weak (stub props). Add `tsc --emitDeclarationOnly` as a future improvement for richer type contracts in the design tool.
- Fallback fonts (Manrope, Outfit, IBM Plex Mono, DM Mono) in CSS variables produce `[FONT_REMOTE]` validator warnings — non-blocking; they are loaded as system fallbacks only.
