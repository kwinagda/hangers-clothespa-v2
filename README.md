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
- Next.js
- Node.js + Express
- Prisma
- PostgreSQL
- Axios

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

## Current Direction

Recent work in this repository focused on:

- centralizing master data and metadata usage
- reducing cross-app status / payment mismatches
- hardening API response handling
- redesigning the customer app with stronger branding and better UX density
- expanding Daily Iron flows across backend, customer app, and CRM

## Development Notes

- This is a mono-workspace style repo, not four disconnected projects.
- Many features span all four codebases, so changes often require checking backend + customer app + staff app + CRM together.
- Canonical values matter. Labels should come from metadata, but behavior and persistence should use canonical keys.
- Order-level payment truth is important. Do not casually replace it with raw transaction-only logic.

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
