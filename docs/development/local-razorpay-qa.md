# Local Razorpay QA Environment

Payment Gateway QA uses one local path only:

- CRM: `http://localhost:5002`
- API: `http://localhost:5001`
- PostgreSQL: `postgres@localhost:5432/hangers_db` (password is loaded only from `hangers-backend/.env`)
- Razorpay mode: Test only (`RAZORPAY_KEY_ID` starts with `rzp_test_`)

The local backend's `hangers-backend/.env` is the configuration source for the local API and Prisma client. Never print or copy its credential values. Keep the configured database host exactly `localhost`; PostgreSQL may report the resolved loopback address as either `127.0.0.1` or `::1`. Do not substitute another connection host, port/database, staging service, or EC2 when a local check fails.

## Verify Before QA

From the repository root, run:

```sh
node hangers-backend/scripts/verify-local-razorpay-environment.js
```

The command fails closed unless the configured database URL targets `postgres@localhost:5432/hangers_db`, the key ID is Test mode, `DEV_OUTBOX_WORKER=false` and `LOCAL_SKIP_STARTUP_SYNC=true`, a read-only Prisma query confirms `current_database() = hangers_db`, `current_user = postgres`, and a loopback server address on port 5432, the existing API `/ready` reports its live database check healthy and confirms the same local QA profile, and the existing CRM `/login` returns the Hangers login page. A successful connection verifies that the configured password is accepted without printing it. The command does not create or modify database rows, call Razorpay, send notifications, or print credentials.

If a sandboxed shell reports `Operation not permitted` or Prisma `P1001` while the API and PostgreSQL are running, treat that as a local-network permission failure, not permission to switch targets. Rerun this same read-only command with the required local-network access. Do not use a separate database or host as a workaround. `/ready` performs a fresh read-only database identity query on every request; a previous readiness result is not a substitute for running the check now.

For local QA starts, retain `DEV_OUTBOX_WORKER=false` and `LOCAL_SKIP_STARTUP_SYNC=true` so payment tests do not dispatch WhatsApp messages or synchronize shared catalogs/permissions on startup. Keep all payment fixtures in Razorpay Test Mode and use only the approved dry-cleaning QA customer documented in the implementation plan.
