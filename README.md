# Hangers Clothes Spa v2

Operational workspace for the Hangers Clothes Spa platform.

## Repository Layout

This repository contains the full working stack:

- `hangers-app`
  Customer mobile app built with Expo / React Native
- `hangers-staff-app`
  Staff mobile app for plant and delivery flows
- `hangers-crm`
  CRM and operations dashboard built with Next.js
- `hangers-backend`
  Node.js / Express backend with Prisma and PostgreSQL

## What Is Included

- master-data and metadata consolidation across apps
- customer, CRM, staff, and backend payment consistency fixes
- customer-app branding, typography, UX redesign, and navigation polish
- Daily Iron customer and CRM flows
- backend response-shape hardening and referral / payment-history fixes

## Prerequisites

- Node.js 18+ recommended
- npm
- PostgreSQL for the backend Prisma database
- Expo tooling for the mobile apps

## Environment Setup

Create these local env files before running the workspace:

- `hangers-backend/.env`
- `hangers-app/.env`
- `hangers-staff-app/.env`
- `hangers-crm/.env.local`

Example env templates are included here:

- [hangers-backend/.env.example](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/.env.example)
- [hangers-app/.env.example](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/.env.example)
- [hangers-staff-app/.env.example](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/.env.example)
- [hangers-crm/.env.example](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/.env.example)

## Local Development

### Backend

```bash
cd hangers-backend
npm install
npx prisma generate
npx prisma db push
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

## Typical Local Ports

- backend API: `http://localhost:3000/api/v1`
- CRM: `http://localhost:3001`
- Expo apps use `EXPO_PUBLIC_API_URL` when set, otherwise they try to resolve the local backend automatically

## Notes

- Root `.gitignore` now ignores generated caches, backup artifacts, and local env files across all subprojects.
- `MASTER_DATA_AUDIT.md` contains the audit context for the master-data migration work.
- This repository intentionally contains all four apps in one workspace because the flows and master data are tightly coupled across customer, staff, CRM, and backend.
