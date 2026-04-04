# Hangers Clothes Spa v2

Operational workspace for the Hangers Clothes Spa platform.

## Apps

- `hangers-app`
  Customer mobile app built with Expo / React Native
- `hangers-staff-app`
  Staff mobile app for plant and delivery flows
- `hangers-crm`
  CRM and operations dashboard built with Next.js
- `hangers-backend`
  Node.js / Express backend with Prisma

## Key Work Included

- master-data and metadata consolidation across apps
- customer, CRM, staff, and backend payment consistency fixes
- customer-app branding, typography, UX redesign, and navigation polish
- Daily Iron customer and CRM flows
- backend response-shape hardening and referral / payment-history fixes

## Local Development

### Backend

```bash
cd hangers-backend
npm install
npm run dev
```

### Customer App

```bash
cd hangers-app
npm install
npm start
```

### Staff App

```bash
cd hangers-staff-app
npm install
npm start
```

### CRM

```bash
cd hangers-crm
npm install
npm run dev
```

## Notes

- Root `.gitignore` now ignores generated caches, backup artifacts, and local env files across all subprojects.
- `MASTER_DATA_AUDIT.md` contains the audit context for the master-data migration work.
