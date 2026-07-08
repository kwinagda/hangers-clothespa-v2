# CRM Go-Live Runbook

Scope: backend API, PostgreSQL, Redis, and CRM web dashboard only. Customer and staff mobile apps are intentionally excluded from this launch.

## Required Services

- Backend API host, recommended: Railway.
- PostgreSQL database, recommended: Railway Postgres or managed Supabase/Neon.
- Redis, recommended: Railway Redis. The backend can run without Redis, but queues fall back to synchronous execution.
- CRM host, recommended: Vercel for Next.js, or Railway if you want one platform.
- Production domains:
  - API: `https://api.yourdomain.com`
  - CRM: `https://crm.yourdomain.com`

## Backend Environment

Set these in the backend hosting provider:

```env
NODE_ENV=production
PORT=5001
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

JWT_SECRET=<64+ random chars>
JWT_CUSTOMER_EXPIRES_IN=30d
JWT_STAFF_EXPIRES_IN=12h

CRM_URL=https://crm.yourdomain.com
ALLOWED_ORIGINS=https://crm.yourdomain.com

DEV_MODE=false
WA_DELIVERY_OTP_DEV=false

DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=<temporary strong password, seed once only>

MSG91_AUTH_KEY=<live key>
MSG91_TEMPLATE_ID=<approved otp template id>
MSG91_SENDER_ID=HNGRS

META_WA_PHONE_NUMBER_ID=<optional if using Meta WhatsApp>
META_WA_ACCESS_TOKEN=<optional if using Meta WhatsApp>
META_WA_OTP_TEMPLATE=hangers_otp

RAZORPAY_KEY_ID=<live key id>
RAZORPAY_KEY_SECRET=<live key secret>
```

Generate `JWT_SECRET` locally:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## CRM Environment

Set this in the CRM hosting provider:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

## Deployment Order

1. Create production PostgreSQL and Redis.
2. Deploy backend.
3. Backend start command runs `npx prisma migrate deploy` before starting the API.
4. Seed the production database once:

```bash
cd hangers-backend
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com DEFAULT_ADMIN_PASSWORD='<temporary password>' npm run db:generate
node prisma/seed.js
```

5. Remove `DEFAULT_ADMIN_PASSWORD` from hosted env after seeding.
6. Deploy CRM with `NEXT_PUBLIC_API_URL` pointing to production API.
7. Log in to CRM and change the seeded admin password immediately.

## Smoke Test

- `GET https://api.yourdomain.com/health` returns success.
- `GET https://api.yourdomain.com/api/v1/metadata` returns success.
- CRM `/login` loads on HTTPS.
- Staff login succeeds.
- CRM `/dashboard` loads after login.
- Create or find a test customer.
- Create a test order from CRM.
- Add order items and confirm pricing.
- Record a test cash payment.
- Change order status through the normal workflow.
- Check reports, cashbook, customers, orders, pricing, and staff pages load.

## Production Rules

- Do not use `prisma db push` against production.
- Do not leave `DEV_MODE=true` or `WA_DELIVERY_OTP_DEV=true`.
- Do not keep the temporary seed password in hosting env after first seed.
- Keep `hangers-backend/prisma/migrations` committed.
- Take a database backup before every manual production data import.
