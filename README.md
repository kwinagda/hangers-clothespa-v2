# Hangers Clothes Spa v2

Hangers Clothes Spa v2 is a full-stack operational workspace for a laundry and garment-care business.

This repository contains the complete product surface:

- customer mobile app
- staff mobile app
- CRM / operations dashboard
- backend API and database layer

## Workspace

- `hangers-app`
  Expo / React Native customer app
- `hangers-staff-app`
  Expo / React Native staff app for plant and delivery teams
- `hangers-crm`
  Next.js CRM and operations dashboard
- `hangers-backend`
  Express + Prisma backend

## Product Areas

- OTP-based customer login
- pickup booking and address management
- order tracking and delivery flows
- wallet, referrals, and payment history
- Daily Iron subscriptions, logs, and billing
- staff roles, plant operations, and delivery assignment
- CRM finance, search, pricing, reports, and customer management

## Important Repo Context

For future AI prompting, project memory, coding conventions, source-of-truth rules, risky areas, and product direction, read:

- [`PROJECT_AI_CONTEXT.md`](./PROJECT_AI_CONTEXT.md)

For the strict master-data migration audit context, read:

- [`MASTER_DATA_AUDIT.md`](./MASTER_DATA_AUDIT.md)

## Tech Stack

- React Native + Expo
- Next.js 15 + React Query v5
- Node.js + Express
- Prisma + PostgreSQL
- TypeScript (CRM + apps)
- BullMQ + Redis (notification and PDF queues)
- Axios
- Zod (validation)
- GitHub Actions (CI)

## Design System

The CRM's 11 UI components are synced to **claude.ai/design** as the "Hangers CRM Design System" project. Designs produced there use real brand components automatically.

- Project ID: `68e80ff6-61ab-4f72-9ea5-facbb2cc753c`
- Component library source: `hangers-crm/src/components/ui/`
- Sync config: `.design-sync/config.json`
- Owned previews: `.design-sync/previews/*.tsx`
- To re-sync after changes: run `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./hangers-crm/node_modules --entry ./hangers-crm/src/components/ui/index.ts --out ./ds-bundle` then re-upload

## Quick Start

### 1. Install dependencies

```bash
cd hangers-backend && npm install
cd ../hangers-app && npm install
cd ../hangers-staff-app && npm install
cd ../hangers-crm && npm install
```

### 2. Create env files

Copy from:

- `hangers-backend/.env.example`
- `hangers-app/.env.example`
- `hangers-staff-app/.env.example`
- `hangers-crm/.env.example`

### 3. Start the backend

```bash
cd hangers-backend
npx prisma generate
npx prisma db push
npm run dev
```

### 4. Start the apps

Customer app:

```bash
cd hangers-app
npm start
```

Staff app:

```bash
cd hangers-staff-app
npm start
```

CRM:

```bash
cd hangers-crm
npm run dev
```

## Default Local URLs

- backend API: `http://localhost:5001/api/v1`
- CRM: `http://localhost:5002`
- customer/staff apps use `EXPO_PUBLIC_API_URL` when set

## Backend API Domains

The backend is now organized into focused domain modules (not a single god-controller):

| Domain | Route prefix |
|---|---|
| Auth | `/api/v1/auth` |
| Customers | `/api/v1/customers` |
| Orders | `/api/v1/orders` |
| Payments | `/api/v1/payments` |
| Delivery | `/api/v1/delivery` |
| Plant / Challan | `/api/v1/plant` |
| Iron (Daily Iron) | `/api/v1/iron` |
| Cashbook | `/api/v1/cashbook` |
| Expenses | `/api/v1/expenses` |
| AR Ledger | `/api/v1/ar-ledger` |
| Transfers | `/api/v1/transfers` |
| Attendance | `/api/v1/attendance` |
| Coupons | `/api/v1/coupons` |
| Loyalty | `/api/v1/loyalty` |
| Upcharges | `/api/v1/upcharges` |
| Recurring Pickups | `/api/v1/recurring` |
| Campaigns | `/api/v1/campaigns` |
| Reports | `/api/v1/reports` |
| Search | `/api/v1/search` |
| Automations | `/api/v1/automations` |
| Wallet (staff) | `/api/v1/wallet` |
| Checkout | `/api/v1/checkout` |
| Razorpay | `/api/v1/customer/payments` |
| Metadata | `/api/v1/metadata` |
| Security / Audit | `/api/v1/security` |
| Real-time (SSE) | `/api/v1/realtime` |

## Running Tests

```bash
cd hangers-backend && npm test   # 24 tests
```

## Current Direction

The platform has completed a full CTO-level hardening and structural overhaul:

- **Security**: 15 confirmed race-condition, financial-fraud, and access-control bugs patched
- **Architecture**: `phaseA.controller.js` (1,037 lines) split into 13 focused domain controllers
- **Infrastructure**: BullMQ queues for notifications and PDFs, SSE real-time order board, centralized wallet service, idempotency keys on payments
- **DB**: 12 composite indexes added; Serializable isolation on referral transactions
- **CRM**: React Query v5, shared UI component library, TypeScript config, GitHub Actions CI
- **Origin protection**: CSRF-style trusted-origin middleware enforced on all mutating staff routes
- **OTP cooldown**: resend cooldowns now enforced at the `AuthChallenge` layer
- **Coupon integrity**: usage limits now atomically checked and incremented

Next focus: targeted feature work, delivery exception flows, and a pre-launch smoke-test pass.

## Development Notes

- This is a mono-workspace repo — changes often span backend + customer app + staff app + CRM together.
- Canonical values matter. Labels come from metadata; behavior and persistence use canonical keys.
- Order-level payment truth is the source of record — do not replace it with raw transaction-only logic.
- Never add a second source of truth for master data; extend `master-data.js` and the `/metadata` surface.
- `phaseA.controller.js` and `phaseA.routes.js` have been deleted. All their endpoints live in domain-specific controllers now.

## Repository Hygiene

The root `.gitignore` is configured to ignore:

- `node_modules`
- Expo / Next build output
- `.env` files
- logs
- `.DS_Store`
- `*.tsbuildinfo`
- backup artifacts

## Maintainer

- Kevin Nagda
