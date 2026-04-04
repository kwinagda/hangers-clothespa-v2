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

Important backend routing areas:

- auth
- customers
- addresses
- customer orders
- orders
- payments / Razorpay
- metadata
- iron
- delivery
- plant

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

### Staff app

Key staff app entrypoints:

- app boot: `hangers-staff-app/App.tsx`
- API client: `hangers-staff-app/src/services/api.ts`
- auth state: `hangers-staff-app/src/hooks/useAuth.tsx`

## 4. Core Source-of-Truth Rules

These rules matter more than style.

### 4.1 Master data is centralized

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

Primary source:

- `hangers-backend/src/config/master-data.js`
- surfaced by `/metadata`

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
