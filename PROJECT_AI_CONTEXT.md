# Project AI Context

This file is for future AI work inside this repository.

It is not a literal dump of every line in the repo. That would be noisy and low-value.
It is the highest-signal context needed to understand what this workspace is, how it is built, how code should be written here, what must not drift, and where future changes should start.

## 1. What This Repository Is

This is a multi-app operational workspace for **Hangers Clothes Spa**.

It contains:

- `hangers-app`
  Customer mobile app built with Expo / React Native
- `hangers-staff-app`
  Staff mobile app for plant and delivery workflows
- `hangers-crm`
  CRM / operations dashboard built with Next.js
- `hangers-backend`
  Node.js / Express backend with Prisma

This repo is not a collection of isolated apps. The customer app, staff app, CRM, and backend all describe the same real-world entities:

- customers
- orders
- order stages
- addresses
- payments
- wallet / referrals
- Daily Iron subscriptions, logs, and bills
- staff roles and operational permissions

## 2. Product Goal

The system is a full-stack laundry / garment-care operations product.

Core customer flows:

- phone OTP login
- book pickup
- track order
- pay for orders
- use wallet / referral credits
- view payment history
- manage saved addresses
- enroll in Daily Iron

Core operations flows:

- CRM order creation and customer management
- plant-stage movement and scan-based handling
- delivery assignment and delivery tracking
- pricing and master-data driven catalog / statuses
- finance, bills, and reconciliation

## 3. Architecture Summary

### Backend

Main backend:

- Express API under `hangers-backend/src`
- Prisma schema in `hangers-backend/prisma/schema.prisma`
- shared master data in `hangers-backend/src/config/master-data.js`

Important backend routing areas (post-ultraplan refactor, commit `c4a5945`):

- auth
- customers / addresses
- customer orders (customer-facing)
- orders (CRM-facing)
- payments / Razorpay
- metadata
- iron (Daily Iron)
- delivery
- plant / challan
- cashbook / expenses / AR ledger
- transfers / attendance
- coupons / loyalty / upcharges
- recurring pickups
- campaigns / automations
- reports / search
- wallet (staff-side)
- security / audit log
- realtime (SSE)

**phaseA.controller.js was deleted.** All its endpoints now live in the 13 domain-specific controllers above. Do not refer to phaseA in new code or routes.

### Customer app

Key customer app entrypoints:

- app boot: `hangers-app/App.tsx`
- navigation: `hangers-app/src/navigation/AppNavigator.tsx`
- API client: `hangers-app/src/services/api.ts`
- auth state: `hangers-app/src/hooks/useAuth.tsx`
- theme: `hangers-app/src/utils/theme.ts`

### CRM

Key CRM entrypoints:

- API client: `hangers-crm/src/lib/api.ts`
- dashboard layout: `hangers-crm/src/app/dashboard/layout.tsx`
- UI component library: `hangers-crm/src/components/ui/` (11 components synced to claude.ai/design)

The CRM has a standalone UI component library (`Button`, `Badge`, `StatCard`, `PageHeader`, `EmptyState`, `ErrorState`, `InlineLoader`, `SkeletonLine`, `SkeletonCard`, `TableLoader`, `PaginationControls`). These are the ONLY shared UI primitives in the CRM — do not create new ad-hoc components if an existing one covers the use case.

The design system is synced to claude.ai/design project `68e80ff6-61ab-4f72-9ea5-facbb2cc753c` ("Hangers CRM Design System"). Config lives in `.design-sync/config.json`. To re-sync: rebuild with `package-build.mjs` and re-upload via DesignSync tool.

### Staff app

Key staff app entrypoints:

- app boot: `hangers-staff-app/App.tsx`
- API client: `hangers-staff-app/src/services/api.ts`
- auth state: `hangers-staff-app/src/hooks/useAuth.tsx`

## 4. Core Source-of-Truth Rules

These rules matter more than style.

### 4.1 Master data is DB-backed

Use backend metadata / master data for:

- order statuses
- payment methods
- payment statuses
- staff roles
- address labels
- customer tags
- languages
- Daily Iron statuses
- recurring frequencies / weekdays
- report types
- order workflow rules
- role service access
- report/payment/service option lists

Primary source:

- runtime source: `Setting` rows managed through `hangers-backend/src/services/masterData.service.js`
- bootstrap-only defaults: `hangers-backend/src/config/master-data.js`
- surfaced to clients by `/metadata`

Operational rule:

- Do not introduce a second source of truth for business master data.
- Do not create new side databases, local persistence layers, or parallel config stores for master data.
- If a frontend needs business options or labels, it should come from the existing backend metadata surface and API calls.
- If backend behavior needs new business-controlled values, extend the existing DB-backed master-data / metadata flow instead of inventing a separate store.
- Do not hardcode runtime business behavior, statuses, workflows, payment methods, vendor rates, role permissions, report types, or fake fallback values in controllers or frontend pages.
- `config/master-data.js` is allowed only as first-run bootstrap seed data; after startup the database is the source of truth.

Do not reintroduce local hardcoded business enums if metadata already exists.

### 4.2 Canonical values matter more than labels

UI should display labels from metadata.
Behavior and writes should use canonical values.

Examples:

- use `CASH`, not `"Cash"`
- use `UPI`, not `"UPI / GPay"`
- use `PAID`, `PARTIAL`, `UNPAID`
- use metadata status keys, not visible customer labels

Never compare on rendered label strings when business logic depends on values.

### 4.3 Order-level payment truth matters

A major historical bug in this repo was cross-build mismatch because one screen used raw payment rows while another used `order.paymentStatus`.

When a screen needs "is this order paid / partial / unpaid?", prefer order-level payment truth unless the requirement is explicitly "show raw transaction ledger."

### 4.4 Response envelopes are normalized at the client layer

Frontend clients now normalize API payloads so screens can safely read either:

- `r.data.something`
- `r.something`

Important files:

- `hangers-app/src/services/api.ts`
- `hangers-crm/src/lib/api.ts`
- `hangers-staff-app/src/services/api.ts`

Do not casually undo this normalization.
When adding new screens, still code defensively, but prefer the normalized shape.

## 4.5 Keep Project Memory In Repo

When meaningful audit or hardening work is completed, update the repository memory files instead of leaving the state only in chat:

- `PROJECT_AI_CONTEXT.md` for durable engineering rules, architecture notes, and high-signal guardrails
- `MASTER_DATA_AUDIT.md` for remaining drift and migration status

Future sessions should read these files first and continue from the recorded state.

## 5. Important Domain Conventions

### 5.1 Order statuses

Canonical source:

- `ORDER_STATUSES` in `hangers-backend/src/config/master-data.js`

Important status flags already exist there:

- `customerBucket`
- `customerTrackVisible`
- `plantManaged`
- `plantTimeline`
- `plantQueue`
- `plantSelectable`
- `plantDashKey`

If future logic needs grouping or behavior, prefer extending metadata in `master-data.js` rather than scattering more local arrays.

### 5.2 Payments

Payment methods:

- `CASH`
- `UPI`
- `CARD`
- `RAZORPAY`
- `ONLINE`
- `COD`
- `OTHER`
- `WALLET`
- `Pay Later`
- `SPLIT`

Payment statuses:

- `UNPAID`
- `PARTIAL`
- `PAID`

### 5.3 Languages

Canonical values:

- `ENGLISH`
- `HINDI`
- `MARATHI`

Use labels for display, values for persistence.

### 5.4 Daily Iron

Core statuses:

- `PENDING_REVIEW`
- `ACTIVE`
- `PAUSED`
- `CANCELLED`

Daily Iron is not a decorative feature. It has:

- customer subscription state
- garment logs
- monthly bills
- CRM management flows

## 6. UI / UX Direction

The current direction is intentional, not generic.

### 6.1 Customer app style

Recent work pushed the customer app toward:

- stronger branded headers
- better typography alignment with CRM
- less default-system visual language
- larger, clearer cards
- consistent spacing
- useful content earlier on the screen
- consistent press motion and page-entry motion

Shared customer-app motion utilities:

- `hangers-app/src/components/PageMotion.tsx`
- `hangers-app/src/components/AnimatedButton.tsx`
- `hangers-app/src/components/StaggerItem.tsx`

Use these where they help, but do not force them onto layout-sensitive controls if they distort alignment.

### 6.2 Avoid top-heavy layouts

A real issue in this codebase:

## 7. Recent Hardening Notes

Latest hardening passes added a few high-value guardrails that should not be regressed:

- Delivery endpoints now scope riders to their assigned orders, require delivery confirmation codes / OTP verification, and rate-limit OTP send/verify flows.
- Payment recording no longer creates fake overpayment rows and CRM write-offs must be honored when computing order payment truth.
- Customer pickup booking must not trust client-submitted prices. Resolve item pricing from backend services using canonical `serviceId` values.
- Staff admin flows need role hierarchy checks. Managers should not be able to update, deactivate, reactivate, or reset PINs for manager / super-admin accounts, or promote staff into elevated roles.
- Razorpay order creation / verification must use current backend balance due, not raw order total or client-submitted payment amounts, and duplicate payment IDs must not be re-recorded.
- Wallet application from staff surfaces must verify the order belongs to the same customer and must respect write-offs when computing balance due.
- Sensitive operational exports such as challan / vendor-bill PDFs should not be public endpoints.
- Settings and staff-wallet mutation surfaces must not be open to every authenticated staff user; restrict them to appropriate office/admin roles.
- Legacy `phaseA` routes should be treated as least-privilege surfaces, not generic authenticated staff utilities. Finance, attendance, campaign, automation, and transfer endpoints need explicit role gates.
- Legacy `phaseA` surfaces still contain audit debt. Attendance, receivables, and return-order flows have already needed correctness fixes and should be treated as high-risk until fully reviewed.
- `phaseA` reporting/search code has had real legacy bugs: wrong field names, wrong amount filters, and incorrect aggregation logic. Treat analytics/report/search outputs as suspect until their controller paths are explicitly reviewed.
- UI reliability work now favors explicit error states over silent failures on metadata, search, wallet, address, challan, and similar async screens.
- Top-level CRM/customer/staff entry screens should surface metadata/session/load failures instead of silently degrading. Shell/layout screens matter as much as detail screens because they hide systemic issues.

- oversized hero/header sections
- useful content pushed too far below the fold
- list-heavy screens feeling cramped because the visible area starts too low

Design rule:

- header should establish identity and context
- critical controls and data should appear early
- do not waste first-screen space on decorative blocks

### 6.3 Do not produce generic “AI app” layouts

Avoid:

- default white cards with no hierarchy
- purple gradients
- generic dashboard sameness
- overusing tiny pill chips everywhere

Prefer:

- strong brand blue / structural contrast
- cleaner information hierarchy
- compact but readable sections
- deliberate motion, not motion for its own sake

## 7. Coding Rules For Future AI Work

### 7.1 Inspect before editing

Before changing behavior:

- inspect the screen
- inspect the corresponding API client
- inspect the backend route/controller
- inspect metadata/master data if status/method/role values are involved

Do not assume a frontend issue is only frontend.

### 7.2 Preserve cross-app consistency

If you change:

- order status behavior
- payment logic
- address shape
- staff role meaning
- Daily Iron behavior

check all affected surfaces:

- customer app
- staff app
- CRM
- backend

### 7.3 Do not reintroduce duplicate sources

Historical risk classes in this repo:

- response-shape mismatch
- old field names vs new DB shape
- fallback arrays overriding metadata
- business logic using old enums
- partial migration across apps
- mixed sources for same entity
- label/value confusion

When modifying code, actively guard against those failures.

### 7.4 Keep writes canonical

If a form shows display labels, still submit canonical values.
This is especially important for:

- payment methods
- statuses
- languages
- recurring settings
- plant/staff roles

### 7.5 Don’t “clean up” by deleting real work

This repository has contained a lot of active, broad changes.
Before removing files or rewriting large areas:

- verify whether they are junk, generated output, or real app code
- only remove backups, caches, duplicate nested app copies, or generated artifacts when confirmed

## 8. Key Files To Understand First

If future AI has limited time, start here:

### Repository-level

- `README.md`
- `PROJECT_AI_CONTEXT.md`
- `MASTER_DATA_AUDIT.md`

### Backend

- `hangers-backend/prisma/schema.prisma`
- `hangers-backend/src/config/master-data.js`
- `hangers-backend/src/index.js`
- `hangers-backend/src/controllers/orders.controller.js`
- `hangers-backend/src/controllers/customer-orders.controller.js`
- `hangers-backend/src/controllers/razorpay.controller.js`
- `hangers-backend/src/controllers/metadata.controller.js`
- `hangers-backend/src/controllers/iron.controller.js`
- `hangers-backend/src/services/wallet.service.js` (centralized wallet)
- `hangers-backend/src/services/sse.service.js` (SSE real-time)
- `hangers-backend/src/middleware/asyncHandler.js`
- `hangers-backend/src/middleware/idempotency.js`
- `hangers-backend/src/queues/index.js` (BullMQ)

**Deleted** (do not reference or recreate):
- `hangers-backend/src/controllers/phaseA.controller.js`
- `hangers-backend/src/routes/phaseA.routes.js`
- `hangers-backend/src/validation/phaseA.schemas.js`

### Customer app

- `hangers-app/src/navigation/AppNavigator.tsx`
- `hangers-app/src/services/api.ts`
- `hangers-app/src/hooks/useAuth.tsx`
- `hangers-app/src/utils/theme.ts`
- `hangers-app/src/screens/HomeScreen.tsx`
- `hangers-app/src/screens/MyOrdersScreen.tsx`
- `hangers-app/src/screens/BookPickupScreen.tsx`
- `hangers-app/src/screens/PaymentHistoryScreen.tsx`
- `hangers-app/src/screens/ProfileScreen.tsx`
- `hangers-app/src/screens/IronServiceScreen.tsx`

### CRM

- `hangers-crm/src/lib/api.ts`
- `hangers-crm/src/app/dashboard/orders/new/page.tsx`
- `hangers-crm/src/app/dashboard/customers/[id]/page.tsx`
- `hangers-crm/src/app/dashboard/finance/page.tsx`
- `hangers-crm/src/app/dashboard/iron/`

### Staff app

- `hangers-staff-app/src/services/api.ts`
- `hangers-staff-app/src/screens/delivery/`
- `hangers-staff-app/src/screens/plant/`

## 9. Known High-Risk Areas

These areas deserve extra caution:

- addresses
- order stage progression
- payment history vs payment status truth
- plant status handling
- Daily Iron logging / billing
- any place using `r.data...` assumptions without checking client normalization
- role-based visibility and route access

## 10. Prompting Guidance For Future AI

If you are another AI working in this repo:

### When user asks for a fix

Do:

- trace the full path: UI -> client -> API -> controller -> data model
- verify whether the bug is actually source-of-truth drift
- check other apps that show or mutate the same entity

Do not:

- patch only one screen if the same data is used across apps

### When user asks for a redesign

Do:

- preserve current behavior
- reduce unnecessary header/hero height
- improve hierarchy and scan speed
- keep motion subtle and consistent

Do not:

- break layout with generic wrappers
- over-animate core list controls
- push important content below the fold

### When user asks for recommendations / ideas

Good idea areas:

- wallet/referral expansion
- customer retention loops
- Daily Iron usability
- billing clarity
- delivery operations visibility
- role-specific dashboards
- operational reporting

Bad idea areas:

- cosmetic-only changes that increase complexity without operational value

## 11. Practical Feature Ideas

These are plausible next steps for this product:

- customer default-address preview and quick edit on home
- customer-specific payment ledger inside CRM
- stronger delivery exception workflows
- customer order timeline with richer milestone explanations
- Daily Iron bill PDF / share flow
- CRM and staff operational alerts from master-data driven rules
- central audit trail for status changes and financial edits
- coupon / loyalty UX refinement across customer + CRM

## 12. Final Rule

The most important principle in this repository:

**Do not let display, behavior, and persistence drift apart.**

If metadata says one thing, a label says another, and the saved value uses a third representation, the system becomes inconsistent fast.

Prefer:

- one canonical value
- one master-data source
- one operational truth for the entity
- thin, defensive frontend adapters
- explicit UI labels mapped from canonical values

## 13. Audit Continuity Notes

Date: 2026-04-05

Latest hardening batch completed:

- CRM recurring, promotions, and return-order screens now surface load/action failures instead of silently failing.
- Staff delivery order detail now has an explicit error state with retry; plant order detail now degrades metadata safely.
- `phaseA.controller.js` now validates coupon, loyalty, upcharge, recurring-pickup, and return-order inputs more defensively.
- Recurring pickups now return paused schedules too, so CRM can resume them instead of losing visibility.
- Return-order creation no longer corrupts the original order by forcing it to `CANCELLED`; it now creates the linked return inside a transaction and appends trace notes on the original order.
- Challan routes now enforce role-based access instead of bare staff authentication.
- Challan/vendor-bill flows now reject duplicate IDs, invalid numeric payloads, invalid state transitions, and non-ready orders/challans.
- Settings updates are now key-whitelisted and numeric-validated instead of accepting arbitrary keys/values.
- The duplicate legacy `phaseA` challan endpoints were removed from mounted routes so the dedicated challan controller is the single live surface.
- Customer app order/profile/address/payment/Daily Iron screens now clear stale metadata state or expose retryable load failures instead of failing silently.
- Remaining `phaseA` cashbook, expense, transfer, tag, campaign, automation, report-date, and advanced-search inputs now have stronger validation and not-found/state guards.
- CRM `orders/new`, customer detail metadata, plant challan plant-partner metadata, and backend CORS origin handling were tightened in this batch.
- Backend auth/session handling now preserves the extracted auth token on the request, uses it consistently during logout, trims old customer/staff sessions, and aligns CRM cookie max-age with JWT/session expiry.
- Plant / iron / orders / payments / checkout controllers received a broader completion pass:
  - plant paging, issue input, and stage transitions are tighter
  - iron logs/bills/status filters/payment methods/date windows are more defensive
  - order listing/items/status/payment flows now validate paging, dates, items, and forward-only workflow progression more strictly
  - payments receivables now respect write-offs
  - checkout coupon/loyalty validators no longer trust raw request values blindly
- Iron staff routes are now restricted to operational roles instead of generic staff authentication.

Verification completed for this batch:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend load checks for plant, iron, orders, payments, checkout, phaseA/challan, and auth controllers/middleware

High-risk remaining areas for future passes:

- deeper backend review outside the already-hardened plant/iron/orders/payments/checkout/delivery/wallet/staff areas
- remaining CRM/customer/staff screens with silent catches or weak validation that are not yet user-facing blockers
- dependency/config/security-header/cookie/CORS review

Non-negotiable rule to preserve in future chats:

- master data remains centralized in the existing backend / metadata flow only
- no second database, no side config store, no new local source of truth for operational master data
- after meaningful fixes, update these project memory files again

Latest follow-up after the above batch:

- CRM `dashboard/staff` now surfaces staff-role metadata load failures with a toast and clears stale role options instead of silently failing.
- CRM `dashboard/iron/applications` now surfaces language-label metadata load failures with a toast and clears stale label mappings.
- CRM `dashboard/orders/[id]` now surfaces metadata load failures, clears stale derived metadata state, and avoids quietly rendering outdated labels/options.
- Customer app `BookPickupScreen` now alerts when saved addresses fail to load, falls back to manual address mode, and alerts if local draft restore fails instead of silently swallowing those failures.

Verification completed for this follow-up:

- `npm run build` in `hangers-crm`

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

Verification completed for this follow-up:

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

## Hardening Follow-Up 19

Date: 2026-05-01

Final legacy-surface tightening in the current Afleo-style hardening cycle:

- `src/controllers/phaseA.controller.js` received another cleanup pass:
  - high-risk mutation/query endpoints now use shared `zod` validation from `src/validation/phaseA.schemas.js`
  - raw `err.message` 500 responses on the remaining common phaseA surfaces were replaced with safer generic backend error responses
- new validation coverage added for:
  - cash book entries
  - expenses
  - transfer orders / transfer status
  - attendance actions
  - coupons / coupon validation
  - loyalty rules / loyalty awards
  - upcharges
  - customer tag updates
  - recurring pickups
  - return orders
  - campaigns
  - reports query
  - advanced search query
  - automations
- JWT/sessionVersion test coverage was expanded with `tests/jwt.service.test.js`

Verification completed for this follow-up:

- `npm test` passed in `hangers-backend` (`21` tests)
- backend load check passed for:
  - `src/controllers/phaseA.controller.js`
  - `src/services/jwt.service.js`
  - `src/validation/phaseA.schemas.js`
- `npm run build` passed in `hangers-crm`
- CRM was restarted cleanly on `5002` after clearing `.next`
- `http://localhost:5002/login` returned `200`
- `http://localhost:5002/dashboard` returned `200`

## Hardening Follow-Up 17

Date: 2026-05-01

Afleo-style backend governance hardening was implemented directly into Hangers without blindly copying Afleo's same-origin assumptions:

- schema governance added in the existing master database:
  - `Customer.sessionVersion`
  - `Staff.sessionVersion`
  - `Staff.mustChangePassword`
  - new `AuthThrottle` model/table for DB-backed auth throttle state
- session enforcement upgraded:
  - customer and staff JWTs now carry `sessionVersion`
  - auth middleware now rejects tokens whose embedded `sessionVersion` no longer matches the current DB record
  - this creates immediate session invalidation after sensitive auth/admin changes instead of waiting for token expiry
- DB-backed auth throttling added:
  - staff password login
  - staff PIN login
  - customer OTP send
  - customer OTP verify
  - failures now persist in the master DB and survive process restarts
- strict validation layers added with `zod` for critical request types:
  - customer OTP send/verify
  - staff login/create/update
  - settings update
  - order status update
- route-layer protection was applied broadly across the live backend:
  - private/authenticated routers now set `Cache-Control: private, no-store`
  - mutating browser requests now pass a trusted-origin check before backend execution
  - important design adaptation:
    - Afleo's literal same-origin model could not be copied directly because Hangers intentionally runs CRM on `5002` and API on `5001`
    - Hangers now uses trusted-origin browser-write protection instead, allowing the configured CRM/customer/staff origins while still rejecting unexpected browser origins
- staff admin/session hardening:
  - staff role changes now increment `sessionVersion` and clear existing staff sessions
  - staff deactivation/reactivation now increment `sessionVersion` and clear existing staff sessions
  - PIN change/reset already invalidates staff sessions and now remains aligned with the same session-version model
- order workflow mutation hardening completed:
  - order status updates now use strict payload validation before the existing transition/correction policy runs
  - the correction policy and audit trail still write only through the same backend API into the same master DB

Verification completed for this follow-up:

- `npx prisma db push` in `hangers-backend`
- backend module load check passed for:
  - `src/middleware/origin.js`
  - `src/middleware/privateCache.js`
  - `src/controllers/staffManagement.controller.js`
  - `src/controllers/orders.controller.js`
  - updated route files
- `npm run build` passed in `hangers-crm`
- backend restarted on `5001`
- CRM restarted on `5002` after clearing `.next`
- `http://localhost:5001/api/v1/metadata` returned `200`
- `http://localhost:5002/login` returned `200`
- `http://localhost:5002/dashboard` returned `200`

## Afleo Gap Check — Residual Items

Date: 2026-05-01

A second strict Afleo-vs-Hangers review was completed after the broad hardening pass. Result: Hangers is much closer, but still not fully at Afleo's policy discipline level.

Residual gaps that still remain:

- automated security/regression tests are still largely absent in Hangers
  - unlike Afleo, there is no meaningful backend test suite covering session invalidation, throttle behavior, trusted-origin checks, validation schemas, or private-cache headers
- error/response handling is still inconsistent across backend controllers
  - many controllers still mix custom `res.status(...).json(...)` shapes with shared response helpers
  - legacy controllers like `phaseA.controller.js`, `payments.controller.js`, `checkout.controller.js`, `challan.controller.js`, and `staff.wallet.controller.js` still expose more controller-local response behavior than Afleo-style centralized route errors
- validation is improved but not yet systematic across the whole backend
  - `zod` now exists for auth/settings/order-status/staff update flows
  - large legacy surfaces still rely on manual inline `if` validation instead of shared schemas
- denied-access / security-event audit logging is still partial
  - Hangers logs many success/failure events, but not with Afleo's level of systematic denied-access auditing across all protected routes
- RBAC remains flatter than Afleo
  - Hangers still uses config-driven role defaults plus staff overrides
  - it does not yet have Afleo-style relational role/permission/service-access governance

Important conclusion:

- the current state should be treated as:
  - broad governance hardening done
  - residual architecture/test/governance work still left
- do not claim Hangers now matches Afleo completely
- the remaining work is narrower and mostly backend-governance quality, not broad product correctness triage

## Hardening Follow-Up 18

Date: 2026-05-01

A second Afleo-style cleanup wave was completed immediately after the residual-gap audit instead of stopping at documentation:

- denied-access auditing improved in backend RBAC:
  - `src/middleware/rbac.js` now writes `ACCESS_DENIED` audit events for role-gated and permission-gated route failures
  - denied access now records method/path/required role or permission/current role/request metadata
- legacy finance-style controllers were normalized further:
  - `src/controllers/checkout.controller.js`
  - `src/controllers/payments.controller.js`
  - `src/controllers/staff.wallet.controller.js`
  - these now use shared response helpers more consistently and stop relying on ad hoc inline response shapes for their main paths
- shared `zod` validation was expanded with:
  - `src/validation/finance.schemas.js`
  - coverage added for:
    - coupon validation payload
    - loyalty validation payload
    - payment record payload
    - wallet credit/deduct payload
    - wallet apply payload
- automated backend security/regression tests were added using Node's built-in test runner:
  - `hangers-backend/tests/auth.schemas.test.js`
  - `hangers-backend/tests/finance.schemas.test.js`
  - `hangers-backend/tests/security.middleware.test.js`
  - current coverage focuses on:
    - auth schema validation
    - finance schema validation
    - trusted-origin middleware behavior
    - private no-store middleware behavior
  - backend `package.json` now includes a `test` script

Verification completed for this follow-up:

- `npm test` in `hangers-backend` passed (`12` tests)
- backend load check passed for:
  - `src/middleware/rbac.js`
  - `src/controllers/checkout.controller.js`
  - `src/controllers/payments.controller.js`
  - `src/controllers/staff.wallet.controller.js`
  - `src/validation/finance.schemas.js`
- `npm run build` passed in `hangers-crm`
- CRM was restarted cleanly on `5002` after clearing `.next`
- `http://localhost:5001/api/v1/metadata` returned `200`
- `http://localhost:5002/login` returned `200`
- `http://localhost:5002/dashboard` returned `200`

Latest local-dev access note:

- local backend/CRM ports are currently standardized to:
  - backend: `5001`
  - CRM: `5002`
- local seeded/reset CRM super-admin credential:
  - email: `admin@hangers.in`
  - password: `Hangers@123`
- this credential note is for current local development continuity only and should be changed again before any real staging/production use

Latest order-workflow correction follow-up:

- CRM order status controls were tightened again so they only show contextual legal choices for the current order:
  - current status
  - one legal forward step
  - approved backward correction targets when the user has correction authority
  - cancellation only where backend policy allows it
  - delivered correction target only where high-risk authority allows it
- this replaces the earlier broader `crmEditable`-driven choice set that could show statuses which were editable in general but not valid for the current workflow position
- delivered correction target is now aligned to:
  - `DELIVERED -> READY_FOR_DELIVERY`
  - not `DELIVERED -> OUT_FOR_DELIVERY`
- order detail page and orders list page both use the same correction model and reason-capture modal flow
- important persistence rule remains unchanged:
  - CRM does not store order status changes locally or in any side database
  - every status update still goes through the existing backend API and writes to the same master database only

Latest live referral-test follow-up:

- a real end-to-end referral test was run against the live backend and the existing master database
- live test customers created:
  - referrer phone `9408571217`
  - referred phone `8408571217`
  - referral code used: `HANGRQCQ`
- live behavior verified:
  - signup with valid referral code created a `PENDING` referral row with `creditAwarded: 0`
  - after forcing the qualifying order to `DELIVERED` but leaving payment unpaid, the referral remained `PENDING`
  - after marking the same order `PAID`, the referral moved to `REWARDED`
  - reward applied was `₹60` to each side on a `₹300` qualifying order, matching the configured `20%` rule
  - wallet transactions were created with reasons:
    - `REFERRAL_REWARD_REFERRER`
    - `REFERRAL_REWARD_REFERRED`
- live qualifying order used:
  - order id `cmnm0iwjp000ouc6w0hrmmvu2`
  - service `Bedspread-Double`
  - service category `DRY CLEAN — HOUSE HOLD`
  - service base price `300`
- two setup quirks surfaced during the live test:
  - customer signup/OTP flow did not create a saved address from the signup payload for the test user, so the live test had to create the address through the existing `/addresses` API before booking pickup
  - `/customer/orders/pickup-request` requires the full address string plus optional `savedAddressId`; passing only `addressId` fails with `pickupDate and address are required`
- these were test/setup findings, not referral-reward failures; the referral qualification and reward-release logic itself worked correctly against the live master DB

Latest signup-address follow-up:

- new-customer OTP verification now supports persisting the first pickup address into the existing `Address` table in the master database
- backend change:
  - `src/controllers/auth.controller.js` now accepts optional `address` data on `/auth/verify-otp`
  - for first-time customer creation only, valid address payload is normalized and inserted as the default saved address
  - existing customer login behavior is unchanged
- customer app change:
  - `src/screens/OTPVerifyScreen.tsx` now shows name + first-address fields when `isNewUser` is true
  - `src/services/api.ts` now sends that address payload to `/auth/verify-otp`
- intended result:
  - after signup, a brand-new customer can immediately have a saved default pickup address instead of needing a separate `/addresses` call first
- this stays on the same master DB and existing `Address` model; no new store or shadow address table was created

Latest dashboard-metric follow-up:

- CRM dashboard `Today's Revenue` / `Collections Today` previously summed `order.totalAmount` for orders created today that were now `DELIVERED`
- that was misleading because it counted delivered order value, not actual money collected
- concrete example exposed:
  - the live referral test order for `₹300` appeared in dashboard revenue even though there were no payment rows recorded for today
- fix applied:
  - `src/controllers/orders.controller.js` now computes `today.revenue` and `allTime.revenue` from the `Payment` table instead of delivered order totals
  - dashboard copy in `hangers-crm/src/app/dashboard/page.tsx` now says `Actual payments recorded today`
- verified after the fix:
  - live master DB `todayCollections` was `0`
  - dashboard routes were restarted and returned HTTP 200 again on port `5002`

Latest order-workflow correction follow-up:

- order status updates no longer use a blanket "never move backward" rule
- backend now uses a controlled correction model in `hangers-backend/src/controllers/orders.controller.js`:
  - allowed backward transitions are explicit and limited:
    - `PICKED_UP -> PENDING`
    - `PROCESSING -> PICKED_UP`
    - `WASHING -> PROCESSING`
    - `DRYING -> WASHING`
    - `IRONING -> DRYING`
    - `QC -> IRONING`
    - `READY_FOR_DELIVERY -> QC`
    - `OUT_FOR_DELIVERY -> READY_FOR_DELIVERY`
    - `CANCELLED -> PENDING`
  - cancellations are limited to pre-delivery states only
  - delivered orders cannot be cancelled
  - delivered orders are locked from normal workflow changes; only super admins can perform the one allowed high-risk correction path `DELIVERED -> OUT_FOR_DELIVERY`
  - backward / cancel / restore / delivered-correction actions now require a reason note
  - backward / cancel / restore actions require elevated correction authority (`SUPER_ADMIN`, `MANAGER`, or explicit `orders.edit`)
  - delivered-order correction requires stronger admin control (`SUPER_ADMIN` only)
- auditability added:
  - order-stage notes now record prefixes like `[REVERSAL]`, `[CANCELLED]`, `[RESTORED]`, and `[HIGH_RISK_CORRECTION]`
  - activity log action now distinguishes between normal updates, reversals, cancellations, restores, and high-risk delivered corrections
- CRM updates:
  - both order detail and orders list now prompt for a required reason before sending reversal/cancel/restore/high-risk status changes
  - delivered-to-cancel attempts are blocked in the UI before hitting the backend
  - browser-native prompts were later replaced with proper in-page CRM modals for correction reasons
  - order detail now reloads the full order after status change so the workflow timeline/stage history updates immediately without a manual refresh
  - correction stage notes in the order timeline are rendered with cleaner badges (`Reversal`, `Cancelled`, `Restored`, `High-risk correction`) instead of showing raw bracketed prefixes as the primary text

Latest CRM customer-visibility follow-up:

- customer profile visibility was extended without introducing any new data store:
  - backend `customers/:id` now also returns:
    - `notificationSummary`
    - `paymentSummary`
    - recent `paymentEvents`
  - these are derived from the existing `customers`, `payments`, `orders`, and referral rows in the current master database only
- CRM customer profile (`src/app/dashboard/customers/[id]/page.tsx`) now shows:
  - notification preferences visibility:
    - WhatsApp enabled/disabled
    - push enabled/disabled
    - push-token presence / preview
    - preferred messaging language
  - payment activity visibility:
    - total recorded amount from recent payment rows
    - payment event count / online payment count
    - recent payment events with method, amount, order number, reference, collector, timestamp, and status
- a dedicated CRM referrals page was added:
  - route: `/dashboard/referrals`
  - file: `src/app/dashboard/referrals/page.tsx`
  - sidebar navigation now links to it from the Overview group
  - data comes from new backend route `GET /api/v1/customers/referrals/report`
- backend referrals report endpoint returns:
  - summary totals
  - top referrers leaderboard
  - recent referral activity
  - optional `from` / `to` filtering
- all of this remains inside the existing backend/master-data flow; no new referral DB, no shadow reporting store, and no side payment store were introduced

Verification completed for this follow-up:

- backend controller/route load check for `customers.controller.js` and `customers.routes.js`
- `http://localhost:5001/api/v1/metadata` returned HTTP 200
- fresh CRM dev-server restart on port `5002` after clearing `.next`
- `http://localhost:5002/login` returned HTTP 200
- `http://localhost:5002/dashboard/referrals` returned HTTP 200
- `http://localhost:5002/dashboard/customers/test` returned HTTP 200 (route compiled)

Latest referral-program hardening follow-up:

- referral logic was upgraded from an MVP signup-credit flow to a more industry-style qualified referral flow
- previous behavior:
  - both parties received wallet credit immediately at signup / OTP verification
  - this was vulnerable to abuse and also mismatched the customer-app messaging
- current behavior:
  - referral code is captured at signup
  - invalid or inactive referral codes are now rejected instead of being silently ignored
  - a referral record is created in `PENDING` state
  - no wallet credit is awarded at signup
  - reward is released only after the referred customer completes their first qualifying order
  - qualifying order rule implemented now:
    - order must be `DELIVERED`
    - payment status must be `PAID`
    - order total must meet the configured minimum order amount
    - only the first qualifying order for that referred customer can unlock the reward
- referral reward is now configurable from CRM via `/dashboard/referrals`
  - settings are stored in the existing `settings` table in the same master database
  - keys added:
    - `referral_reward_percent`
    - `referral_reward_cap`
    - `referral_min_order_amount`
    - `referral_program_enabled`
  - default rule used by backend when settings are absent:
    - `20%` reward per side
    - capped at `₹200`
    - minimum qualifying order `₹300`
- reward remains wallet-credit based, but is now calculated from qualifying order value instead of a flat signup bonus
- backend reward trigger now runs from the existing order/payment flow only:
  - order status updates to `DELIVERED`
  - payment completion paths (`payments`, `delivery cash`, `Razorpay`) when the order becomes fully paid
- schema changes were applied inside the same master database only:
  - referral records now track status / qualification / reward lifecycle fields
  - no new side database or external referral store was introduced
- customer app referral copy was updated to match actual behavior:
  - rewards now describe the first qualifying delivered-and-paid order
  - referral entries can show pending vs rewarded
- CRM customer profile referral card now also shows:
  - pending referral count
  - live program rule summary
- wallet labels were updated so referral rewards show clearer reasons than a single generic `REFERRAL`

Verification completed for this follow-up:

- `npx prisma generate` in `hangers-backend`
- `npx prisma db push` in `hangers-backend`
- backend controller/service load check for referral/auth/customer logic
- backend restarted on port `5001`
- CRM restarted on port `5002` from a clean `.next`
- `http://localhost:5001/api/v1/metadata` returned HTTP 200
- `http://localhost:5002/login` returned HTTP 200
- `http://localhost:5002/dashboard/referrals` returned HTTP 200

Latest CRM load-failure audit follow-up:

- completed another CRM page-level audit specifically for “page fails to load because the API response shape is slightly different” issues
- additional CRM pages hardened in this pass:
  - `dashboard/customers/[id]` now normalizes wrapped arrays for orders, addresses, Daily Iron logs, bills, rates, and metadata option lists before rendering
  - `dashboard/plantchallans` now normalizes plant partner metadata, order search results, challan detail payloads, and service catalog payloads before vendor-pricing and receive-item rendering
  - `dashboard/pricing` now normalizes catalog sections/items before building the customer pricing view so a wrapped or partial catalog payload does not white-screen the page
  - `dashboard/layout` now tolerates slightly different auth / staff-role metadata shapes during session bootstrap instead of assuming `r.data.staff` and raw `staffRoles`
  - `dashboard/marketing` create/send flows now unwrap created campaign/automation records and send counts more defensively so local page state does not become malformed after successful actions
  - `dashboard/attendance` now clears to safe empty lists if staff or attendance fetches fail instead of leaving unhandled promise failures behind
- representative CRM route probes after this pass returned HTTP 200 for:
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
- CRM was restarted again after the audit from a clean `.next` state and is currently running on port `5002`

Important CRM dev-runtime note for future chats:

- repeated white-page / `500` CRM failures on localhost were traced to the current workflow of running `npm run build` and `npm run dev` against the same `hangers-crm/.next` directory
- concrete failure signatures included:
  - `Cannot find module './778.js'`
  - missing `.next/routes-manifest.json`
  - routes returning `500` while port `5002` was still occupied
- practical rule:
  - do not run `npm run build` while relying on a currently-running CRM dev server
  - if a build is needed, stop the dev server first, run the build, then restart `npm run dev` cleanly
- standard recovery path when CRM goes white / `500`:
  - kill the current process on `5002`
  - remove `hangers-crm/.next`
  - restart `npm run dev`
- latest verification after clean recovery:
  - `http://localhost:5002/login` returned HTTP 200
  - `http://localhost:5002/dashboard/reports` returned HTTP 200

Latest CRM operations-page follow-up:

- `src/app/dashboard/plantchallans/page.tsx`
  - fixed vendor-pricing catalog loading to use the actual flattened `servicesAPI.getCatalog()` response instead of assuming a nested catalog payload shape
  - vendor-pricing category selection now initializes and stays stable when plant/catalog data changes
  - vendor-bill modal now clears notes after successful bill creation
  - plant challans page got a stronger operations-style hero/header to match the newer CRM design language
- `src/app/dashboard/recurring/page.tsx`
  - recurring pickup creation now supports monthly schedules properly by sending `dayOfMonth` when frequency is `MONTHLY`
  - weekly/monthly schedule controls now render conditionally instead of forcing everything through a day-of-week field
  - recurring list now shows a human-readable schedule column (`Every day`, weekday label, or `Day N of month`) instead of a weekly-only day label
  - recurring page header was refreshed into the same workspace/hero pattern used across the redesigned CRM screens

Verification completed for this follow-up:

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

Updated remaining open areas after this follow-up:

- dependency/config/security-header/cookie/CORS review is still the highest-value platform pass left
- some low-signal local persistence / silent catch paths still exist in non-critical frontend storage helpers
- broader backend surfaces not yet reviewed to the same depth still need a final controller-by-controller sweep

Latest platform/security follow-up after the above note:

- Backend `src/index.js` now disables `x-powered-by`, trusts the first proxy hop, parses `ALLOWED_ORIGINS` in addition to the known app URLs, adds stricter Helmet defaults, and reduces overly broad body-parser limits.
- Backend `src/middleware/errorHandler.js` no longer leaks raw 500-level error messages outside development.
- Backend `src/services/jwt.service.js` now supports explicit expiry overrides and parses expiry values more defensively instead of assuming only a narrow subset of formats.
- Backend `src/controllers/staffPinAuth.controller.js` now aligns PIN-session lifetime with JWT expiry configuration via `JWT_STAFF_PIN_EXPIRES_IN` fallback logic and trims old staff sessions after PIN login.
- Customer/staff app auth services now log non-blocking secure-storage failures instead of silently swallowing them.
- Customer app auth/logout refresh helpers and Book Pickup draft persistence now surface local storage failures in logs rather than failing completely silently.

Verification completed for this follow-up:

- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend module load check for:
  - `src/services/jwt.service.js`
  - `src/middleware/errorHandler.js`
  - `src/controllers/staffPinAuth.controller.js`
  - `src/controllers/staffAuth.controller.js`

Updated remaining open areas after this follow-up:

- dependency-version and package vulnerability review still needs either lockfile/registry audit access or a manual package-by-package pass
- broader backend controllers/routes not yet reviewed to the same depth still need a final completion sweep
- some low-impact frontend screens may still contain non-user-facing fallback debt, but the most important silent failure and auth/storage surfaces have been reduced further

Latest customer/admin completion follow-up after the above note:

- CRM customer routes now require `customers.view` / `customers.edit` permissions instead of broad staff authentication.
- `customers.controller.js` now validates pagination more defensively, enforces valid 10-digit customer phones on CRM create, rejects too-short names, validates customer tags and DOB on update, checks customer existence before update, and validates CRM-added address label/pincode/coordinates.
- `services.controller.js` now rejects empty category filters, invalid/negative service prices, and duplicate service names within the same category during catalog upsert.
- `addresses.controller.js` now validates address labels, pincodes, coordinates, and boolean-style default handling more defensively for customer-owned address create/update flows.

Verification completed for this follow-up:

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

Updated remaining open areas after this follow-up:

- dependency/package vulnerability review is still the biggest security task not yet fully completed
- some backend surfaces are now lower risk but still not all reviewed to exactly the same depth as the hardest-hit financial/delivery/controller areas
- residual frontend work is mostly low-severity fallback debt rather than core workflow correctness

Latest closeout follow-up after the above note:

- Backend route-level permission hardening:
  - `orders.routes.js` now requires explicit order permissions/roles for list, stats, create, status updates, item edits, deletes, and payment recording instead of broad `staffAuth`
  - `payments.routes.js` now requires finance roles instead of any logged-in staff
  - `checkout.routes.js` now requires office roles instead of any logged-in staff
- Dependency/security hardening:
  - backend removed unused `html-pdf-node`, which was pulling in an old vulnerable Puppeteer tree
  - backend Express was upgraded to `4.22.1`
  - CRM Next.js was upgraded from `14.2.5` to `15.5.14`
  - customer and staff app lockfiles were refreshed with package-lock-only audit fixes
  - all four project package audits now report zero known vulnerabilities
- CRM Next 15 compatibility:
  - `hangers-crm/src/app/dashboard/orders/[id]/page.tsx` now uses `useParams` instead of the older client-page `params` prop shape
  - `hangers-crm/next.config.js` now sets `outputFileTracingRoot` to the CRM directory to avoid incorrect workspace-root detection with multiple lockfiles

Verification completed for this follow-up:

- `npm audit --json` now reports zero vulnerabilities in:
  - `hangers-backend`
  - `hangers-crm`
  - `hangers-app`
  - `hangers-staff-app`
- `npm run build` in `hangers-crm`
- `npx tsc --noEmit` in `hangers-app`
- `npx tsc --noEmit` in `hangers-staff-app`
- backend module/route load checks for:
  - `src/controllers/customers.controller.js`
  - `src/controllers/services.controller.js`
  - `src/controllers/addresses.controller.js`
  - `src/routes/customers.routes.js`
  - `src/routes/services.routes.js`
  - `src/routes/addresses.routes.js`
  - `src/routes/orders.routes.js`
  - `src/routes/payments.routes.js`
  - `src/routes/checkout.routes.js`

Updated remaining open areas after this follow-up:

- no active dependency vulnerability backlog remains from `npm audit` in the current lockfiles
- residual work is now mostly lower-severity code-quality/completeness follow-up rather than a major security/correctness audit backlog
- if future work continues, it should be targeted feature work or narrower cleanup, not another broad hardening restart

Recommended future work after the broad hardening pass:

- do not restart another repo-wide audit by default; treat the hardening phase as largely complete
- prioritize targeted feature work, user-reported bug fixes, or specific workflow improvements
- add focused automated coverage around:
  - auth/session handling
  - order lifecycle and status progression
  - payments, write-offs, wallet usage, and receivables
  - delivery OTP flows
  - challan and vendor billing flows
- do a narrower cleanup pass for dead code, duplicated helpers, and stale comments after tests/feature work
- before release/deploy work, do a manual smoke test for login, order creation/update, payments, delivery, and CRM critical paths
- CRM push notifications future work:
  - current CRM only exposes push-notification visibility; it does not yet provide a manual “send push” action
  - backend currently has automatic push hooks for selected order-status changes, but manual CRM-triggered push sending is not implemented yet
  - `expo-server-sdk` is not yet installed/configured in the backend push service, so real push delivery should not be treated as fully live
  - if this is picked up later, implement it on the existing master-data/backend flow only:
    - install/configure Expo push delivery in backend
    - add backend endpoint(s) for manual/test push sending
    - add CRM actions such as “Send Test Push” or template-based manual push
    - keep notification templates/rules centralized behind existing backend/master-data patterns rather than a new side store

Go-live guidance captured for future chats:

- do not treat the current repo state as an automatic full public launch
- recommended path is:
  - manual end-to-end smoke testing with production-like data
  - production env/config validation for JWT, CORS/app URLs, Razorpay, OTP/WhatsApp, notifications, and cookie/session behavior
  - small controlled internal or trusted-customer pilot first
  - observe pilot stability before wider rollout
  - ensure backup, rollback, and operational support ownership exists before opening broadly to live customers
- future chats should frame this as release-readiness / pilot work, not “ship to everyone immediately”

Latest CRM UX/runtime follow-up:

- CRM branding/layout cleanup:
  - login page now uses a single larger logo instead of duplicate logo treatments
  - dashboard sidebar branding is center-aligned with the logo on top and `CRM WORKSPACE` centered below it
  - the sidebar helper sentence about grouped navigation was removed
- CRM action/CTA cleanup:
  - floating `New Order` CTA is hidden on `/dashboard/orders/new` because that page is already the create-order workflow
  - dashboard top duplicate `New Order` button was removed so the floating CTA remains the single primary create action there
- CRM dashboard redesign:
  - `src/app/dashboard/page.tsx` was redesigned into a more industry-style operations dashboard with clearer KPI, workflow, quick-action, Daily Iron, and recent-order sections
  - the redesign stays on top of the existing API/data model only and does not introduce any new database, report store, or shadow reporting structure
  - dashboard summary/actions are backed by existing API calls including `ordersAPI.stats()`, `metadataAPI.getAll()`, and current Daily Iron endpoints
- CRM reports redesign:
  - `src/app/dashboard/reports/page.tsx` was redesigned into a reporting workspace using the existing report API and current master-data-backed report structure
  - supported backend report types remain the current existing set (`sales`, `orders`, `customers`, `payments`, `expenses`, `staff`, `garments`)
  - the “possible next reports” ideas shown in the UI are recommendations only based on current master database coverage; they are not new backend report types and no new reporting database/store was introduced
  - report-tab flicker root cause was the page changing the visible report type before the new payload was ready, which caused structure and metric swaps during tab clicks
  - reports page now caches payloads by `type + from + to` and preloads the current report types for the active date range so switching tabs uses local cached data instead of per-click fetch gaps
- CRM route rename:
  - the former CRM route `/dashboard/ar-challans` was renamed to `/dashboard/plantchallans` to match the actual page purpose and navigation label
  - sidebar/navigation now point to `/dashboard/plantchallans`
  - a legacy redirect stub remains at `/dashboard/ar-challans` so older bookmarks or stale tabs still land on the renamed page
  - vendor pricing on the plant challans page now supports vendor-wise rate card download and CSV bulk upload for the selected plant/vendor
  - bulk upload remains on the existing backend flow only: CRM posts to `/api/v1/vendor-prices/bulk`, and backend upserts into the current `vendorPriceList` table in the master database
- CRM wrapped-array hardening:
  - multiple CRM pages were assuming list APIs returned raw arrays and then calling `.slice`, `.filter`, or `.map` directly on `r.data`
  - this caused runtime crashes such as `campaigns.slice is not a function` and similar failures already seen earlier on recurring pickups and challans
  - affected CRM pages were updated to normalize array payloads defensively before pagination/filtering, including `marketing`, `promotions`, `attendance`, `expenses`, `cashbook`, `finance`, `iron/applications`, `iron/logs`, `staff`, `recurring`, `customers`, `orders`, `advanced search`, dashboard Daily Iron summary, and customer search in `orders/new`
  - keep using defensive array normalization on CRM list pages whenever backend responses may arrive as `{ data: { items: [...] } }`, `{ data: { records: [...] } }`, or similar wrapped shapes
- CRM customer pricing bulk upload:
  - `/dashboard/pricing` now supports customer rate-card download and CSV bulk upload on top of the existing services catalog editor
  - CSV format is `category,name,price`
  - upload remains on the current master-data path only by calling the existing `PUT /api/v1/services` catalog save flow; no new pricing table or separate database/store was introduced
- Referral program clarification:
  - referral codes and coupon codes are separate systems in this project
  - referral reward logic currently runs during customer signup/OTP verification and awards wallet credit to both users; it is not validated through the CRM coupon flow
  - CRM customer profile now surfaces referral visibility using existing backend/master DB data: referral code, referred-by customer, referred-friends count, and recent referral credits
- CRM runtime recovery note:
  - after the Next 15 upgrade and recent UI edits, the CRM dev server intermittently hit white-page / `500` / Webpack runtime failures caused by corrupted `.next` output and missing manifests/chunks
  - concrete failure signatures included missing `.next/routes-manifest.json`, missing cached webpack pack files, and `__webpack_modules__[moduleId] is not a function`
  - recovery path that worked:
    - kill the current listener on port `5002`
    - remove `hangers-crm/.next`
    - restart the CRM dev server with `npm run dev`
  - after the clean restart, `/login` and `/dashboard` returned HTTP 200 again and the CRM resumed loading normally

Verification completed for this follow-up:

- `rm -rf .next && npm run build` in `hangers-crm`
- fresh CRM dev-server restart on port `5002` after clearing `.next`
- `http://localhost:5002/login` returned HTTP 200 after restart
- `http://localhost:5002/dashboard` returned HTTP 200 after restart

Latest report/date-range follow-up:

- CRM reports date presets no longer use `toISOString()` for local date input values because that was shifting the selected range backward across timezone boundaries
- concrete bug fixed:
  - selecting “This Month” could include the last day of the previous month in the report range
- fix applied in both layers:
  - CRM reports page now formats local `YYYY-MM-DD` values without UTC conversion for `Today`, `This Month`, `Last Month`, `Quarter To Date`, and initial default dates
  - backend report controller now parses `from` / `to` as local start-of-day / end-of-day boundaries instead of mixing plain date parsing with a UTC `Z` suffix
- expected result after this change:
  - report ranges match the intended local calendar dates and no longer bleed into the previous month because of timezone conversion

Latest localhost runtime state:

- backend is currently running on port `5001`
- CRM is currently running on port `5002`

Verification completed for this follow-up:

- `npm run build` in `hangers-crm`
- backend module load check for `src/controllers/phaseA.controller.js`
- `http://localhost:5001/api/v1/metadata` returned HTTP 200
- `http://localhost:5002/login` returned HTTP 200

Latest CRM page-design follow-up:

- `src/app/dashboard/orders/[id]/page.tsx` was redesigned into an operations-style order workspace with:
  - top summary hero
  - KPI strip for total/garments/collected/outstanding
  - grouped sections for customer context, garments, workflow, payments, delivery assignment, order facts, and print actions
  - existing actions preserved (status update, add items, rider assign, payments, print, return/re-clean)
- `src/app/dashboard/orders/page.tsx` was redesigned into a more standard queue workspace with:
  - operations hero
  - KPI summary cards for result count, visible value, plant-held orders, and missing-item orders
  - clearer filter/control surface
  - cleaner queue/table header while preserving search, status edit, challan selection, print actions, and pagination
- `src/app/dashboard/customers/[id]/page.tsx` was redesigned at the shell level with:
  - customer workspace hero
  - summary KPI strip
  - updated tab bar styling
  - overview tab cards aligned with the newer CRM surface pattern
  - existing wallet, addresses, orders, and Daily Iron flows preserved

Verification completed for this follow-up:

- `npm run build` in `hangers-crm`

## CTO-Level SaaS Hardening + Architecture Refactor

Date: 2026-06-17

Commit range: `1427689` (15 bug fixes) → `36a25ed` (Phase 0/1/2/3 hardening) → `c4a5945` (phaseA decomposition)

### 15 Security / Race-Condition Bug Fixes

All confirmed CONFIRMED-severity findings from the ultra code review were patched:

- **Razorpay amount injection**: removed client-supplied `amount` field path; backend always uses server-computed `balanceDue`
- **Referral race condition**: `processReferralQualification` now runs inside `{ isolationLevel: 'Serializable' }` transaction
- **Staff wallet race condition**: balance reads in `deductWallet` and `applyWalletToOrder` moved inside transactions; typed error codes for every failure path
- **Customer pickup wallet race**: `requestPickup` wallet-balance read moved inside the order-creation transaction
- **Delivery `markFailed` missing guard**: status must be `OUT_FOR_DELIVERY` or `READY_FOR_DELIVERY` before accepting failure
- **Delivery `collectCash` lost-update**: rewritten with `{ increment: amt }` inside an interactive transaction; paymentStatus re-derived from the new total
- **Delivery OTP dead code removed**: dead `otpRecord` fetch removed; `updateMany` used to mark OTPs used; `verifyAuthChallenge` is now the single NOT_FOUND source
- **Origin middleware null-check**: `fetchSiteAllowed` falsy check corrected — `return fetchSiteAllowed === true` instead of `return true` on null
- **Coupon TOCTOU**: `validateCoupon` now atomically checks and increments `usedCount` inside a single transaction
- **Payment write-off ignored in `calculatePaymentState`**: `currentWriteOff` is now added to `balanceDue` and `effectivePaid` computation
- **Order status sequence gaps**: `SENT_TO_PLANT` and `RETURNED` added to `ORDER_STATUS_SEQUENCE`; backward transitions updated accordingly
- **`addItemsToOrder` after terminal state**: DELIVERED/CANCELLED/RETURNED orders now blocked from item edits; `paymentStatus` recomputed after items change
- **Wrong referral fallback**: `r.status || REFERRAL_STATUS.REWARDED` corrected to `r.status || REFERRAL_STATUS.PENDING`
- **OTP cooldown missing**: `createAuthChallenge` now throws `OTP_COOLDOWN` with `secondsLeft` before expiring old challenges; `sendOtpController` catches and returns 400
- **Counter staff can't record payments**: orders payment route changed from `financeAccess` to `crmAccess`

### phaseA God-Object Decomposition

`phaseA.controller.js` (1,037 lines) and its routes/validation files were **deleted**.

13 focused domain controllers were created:

| Controller | Route |
|---|---|
| `cashbook.controller.js` | `/api/v1/cashbook` |
| `expenses.controller.js` | `/api/v1/expenses` |
| `ar-ledger.controller.js` | `/api/v1/ar-ledger` |
| `transfers.controller.js` | `/api/v1/transfers` |
| `attendance.controller.js` | `/api/v1/attendance` |
| `coupons.controller.js` | `/api/v1/coupons` |
| `loyalty.controller.js` | `/api/v1/loyalty` |
| `upcharges.controller.js` | `/api/v1/upcharges` |
| `recurring.controller.js` | `/api/v1/recurring` |
| `campaigns.controller.js` | `/api/v1/campaigns` |
| `automations.controller.js` | `/api/v1/automations` |
| `reports.controller.js` | `/api/v1/reports` |
| `search.controller.js` | `/api/v1/search` |

Each domain has a matching route file and Zod validation schema file. All 13 are registered in `src/index.js`.

### New Infrastructure

- **`src/middleware/asyncHandler.js`**: wraps async route handlers; eliminates try/catch boilerplate
- **`src/middleware/idempotency.js`**: idempotency keys for payment mutation routes; prevents duplicate charges on retry
- **`src/queues/connection.js`**: Redis connection factory with graceful fallback
- **`src/queues/notifications.queue.js`**: BullMQ queue for async WhatsApp/push notifications
- **`src/queues/pdf.queue.js`**: BullMQ queue for async PDF generation (challans, bills)
- **`src/services/sse.service.js`**: Server-Sent Events for the real-time plant/order board
- **`src/services/wallet.service.js`**: centralized wallet credit/debit logic; replaces scattered inline wallet mutations across controllers

### DB Changes

- **12 composite indexes** added to `prisma/schema.prisma` for high-traffic query paths
- `Serializable` isolation now used on referral qualification

### CRM Upgrades

- Upgraded to **React Query v5** with a shared `QueryProvider` wrapper
- Shared UI component library added under `hangers-crm/src/components/ui/`:
  - `Badge.tsx`, `Button.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `PageHeader.tsx`, `StatCard.tsx`, `index.ts`
- Shared query definitions in `hangers-crm/src/lib/queries.ts`

### CI/CD + TypeScript

- **`.github/workflows/ci.yml`**: GitHub Actions CI pipeline (lint, type-check, test, build)
- **`hangers-backend/tsconfig.json`**: TypeScript configuration for the backend

### Verification

- All 13 new domain controllers load cleanly via `node -e require()`
- `npm test` in `hangers-backend`: 24 passing tests
- `npm run build` in `hangers-crm`: passes
- `npx tsc --noEmit` in `hangers-app`: passes
- `npx tsc --noEmit` in `hangers-staff-app`: passes
- `npx prisma db push` applied 12 new indexes
- Backend restarted cleanly on `5001`
- `http://localhost:5001/api/v1/metadata` returned HTTP 200

### Architecture State After This Batch

- No `phaseA.controller.js` — it does not exist and must not be recreated
- Backend is now organized into single-responsibility domain controllers
- Wallet mutations go through `wallet.service.js`
- Payment mutations must use idempotency keys
- Async notifications and PDFs go through BullMQ queues
- Real-time order-board updates go through SSE (`sse.service.js`)
- CRM component library is in `hangers-crm/src/components/ui/`
- React Query state is managed through the shared `QueryProvider`
