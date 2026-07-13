# Hangers CRM Masterbase Audit and Fix Plan

**Audit date:** 12 July 2026  
**Last updated:** 13 July 2026  
**Document version:** 1.31  
**Document status:** Active remediation register  
**Primary scope:** CRM web application and the backend services required to make the CRM the master system of record  
**Code baseline reviewed:** Commit 748adb9 plus the uncommitted CRM/order workflow changes present on 12 July 2026  
**Launch context:** CRM-only launch before customer or staff mobile applications

---

## 1. Purpose

This document is the durable source of truth for closing the gaps found during the repository-wide CRM audit. It is intentionally more detailed than an executive review so that findings, design decisions, acceptance criteria, and dependencies are not lost while fixes are implemented over multiple sessions.

Every remediation must:

1. Keep the CRM and its database as the authoritative masterbase.
2. Preserve financial history rather than overwrite or delete it.
3. Put business rules on the backend, not only in the CRM UI.
4. Be safe under retries, concurrency, multiple API replicas, and worker restarts.
5. Produce an audit trail with actor, time, reason, before state, and after state.
6. Include automated tests and a reconciliation check before the item is marked complete.
7. Update this document when scope or behavior changes.

An item may be changed from Open to Complete only after its acceptance criteria pass in a production-like environment.

---

## 2. Scope and Explicit Exclusions

### 2.1 In scope now

- CRM authentication, users, roles, permissions, and sessions.
- Customer master records, addresses, notes, tags, consent, referrals, loyalty, and wallet.
- Quotations, in-store orders, future channel-ready order intake, order items, stages, statuses, returns, cancellations, and corrections.
- Service catalog, price books, upcharges, discounts, coupons, write-offs, and taxes.
- Payments recorded by CRM, payment allocation, cash, UPI, card, wallet, receivables, refunds, and reconciliation.
- Cashbook, expenses, vendor payables, Daily Iron finance, financial reporting, and accounting foundations.
- Plant partners, challans, item receipt, transfers, vendor rates, vendor bills, and quality exceptions.
- Daily Iron subscriptions, logs, billing, collections, and reporting.
- Delivery assignment and delivery master records required by the CRM, even if a delivery app is added later.
- Campaign, automation, recurring pickup, notification, and worker behavior exposed in the CRM.
- Audit logs, operational logs, reporting, exports, backups, deployment, monitoring, and tests.
- Multi-tenant and SaaS foundations needed to avoid rebuilding the masterbase later.

### 2.2 Explicitly excluded from this remediation phase

- Customer mobile application UI and release configuration.
- Staff, plant, and delivery mobile application UI and release configuration.
- Customer OTP login and delivery OTP implementation.
- Razorpay integration, gateway webhooks, gateway settlement, and gateway-specific payment flows.
- Mobile push-notification client behavior.

OTP and Razorpay findings from the broader audit are intentionally not tracked as launch blockers in this document. Their backend routes should remain disabled or inaccessible in the CRM-only environment until their dedicated phase. Generic payment architecture must nevertheless remain capable of supporting a future CRM-controlled gateway integration.

---

## 3. Confirmed Business Decisions

### BD-001: In-store order starting state

Orders created directly by staff in the CRM for garments already received in the store must start in canonical status PICKED_UP and display the business label Received. The initial stage event may be RECEIVED.

This behavior is correct and must be preserved.

Required technical correction:

- Normalize the source to one canonical value, preferably COUNTER or IN_STORE.
- Do not compare uppercase and lowercase source values inconsistently.
- Guarantee that a CRM in-store order always starts as Received regardless of UI casing.

### BD-002: Future customer-app starting state

Orders created later by customers through an app must start as PENDING. They move to PICKED_UP, displayed as Received, only after pickup or store receipt is confirmed.

### BD-003: CRM is the masterbase

Future mobile applications must consume CRM-owned master data and workflow APIs. Mobile clients must not maintain independent price lists, status sequences, payment truth, customer balances, vendor rules, or report calculations.

### BD-004: Payment gateway sequencing

Razorpay or another gateway will be integrated later from the CRM/payment domain. Gateway work must use the final Invoice, PaymentIntent, Payment, Allocation, Refund, and Settlement design rather than extending the current mutable order totals.

### BD-005: Current launch model

The first launch may operate as one company, but tenant, legal entity, branch, register, and cost-center boundaries must be designed before the product is sold as SaaS or used by multiple independent businesses.

### BD-006: Financial records are never hard-deleted

Payments, invoices, refunds, wallet entries, cash entries, vendor bills, and posted expenses must be reversed or voided with reasons. They must not be physically deleted through normal application workflows.

---

## 4. Executive Assessment

### 4.1 Current product classification

The repository currently represents a capable single-company laundry operations and POS application with a customer directory. It is not yet an industry-grade SaaS CRM or accounting-safe system of record.

### 4.2 Launch recommendation

**Current decision: NO-GO for unrestricted production use.**

A restricted single-branch pilot is acceptable only after every P0 item and the minimum pilot gates in Section 24 are complete.

The active register contains 252 traceable items: 22 P0, 160 P1, 69 P2, and 1 P3 at version 1.0.

### 4.3 Highest business risks

1. Production worker deployment and fresh heartbeat evidence are still external/unverified.
2. Managed PITR, a timed restore drill, and approved RPO/RTO are still absent.
3. Cash register/shift custody and cash handover are not implemented.
4. Double-entry accounting, GST/legal invoice review, fiscal close, and formal statements are not implemented.
5. Organization/branch/register dimensions and tenant isolation are not implemented.
6. Some maker-checker thresholds, RBAC coverage, and CRM visibility rules remain incomplete.
7. Browser E2E, full lifecycle refund/return/challan tests, and the report golden dataset remain incomplete.
8. Production monitoring, alert routing, and operational ownership are not approved.
9. Customer consent/data-rights and governed attachment retention are incomplete.
10. Multi-tenant SaaS onboarding, entitlements, and billing must not start on the single-company schema.

---

## 5. Priority and Status Definitions

| Priority | Meaning | Release rule |
|---|---|---|
| P0 | Stop-ship: security, schema, financial corruption, or materially false product behavior | Must be complete before any real-money pilot |
| P1 | High: operational integrity, reconciliation, access control, or major workflow correctness | Must be complete before broad CRM rollout |
| P2 | Medium: scale, automation, reporting maturity, and structured operational controls | Complete before multi-branch or external SaaS use |
| P3 | Improvement: usability, optimization, or future extensibility | Schedule after the controlled launch |

| Status | Meaning |
|---|---|
| Open | Confirmed gap, not started |
| In Progress | Implementation is active |
| Blocked | External decision or dependency prevents progress |
| Ready for Verification | Code complete; acceptance tests pending |
| Complete | Acceptance criteria and reconciliation passed |
| Deferred | Explicitly moved out of the current phase |

---

## 6. Canonical Masterbase Ownership

The final CRM must own these records and expose them to future channels:

| Domain | Authoritative records |
|---|---|
| Organization | Tenant, legal entity, branch, service area, timezone, currency, tax registration |
| Identity | User, membership, role, permission, service access, session, approval authority |
| Customer | Customer, contact method, address, consent, segment, note, task, interaction, case |
| Catalog | Service, category, price book, price version, upcharge, tax code, turnaround SLA |
| Commercial | Quotation, quotation version, order, order line, adjustment, approval |
| Workflow | Order event, transition, assignment, task, exception, attachment |
| Billing | Invoice, invoice line, credit note, debit note, due date, payment terms |
| Collections | Payment, allocation, refund, reversal, receipt, register, cash handover |
| Stored value | Wallet account, immutable wallet ledger, loyalty account, loyalty ledger |
| Plant | Plant partner, vendor, contract, vendor rate, challan, dispatched unit, receipt, discrepancy |
| Vendor finance | Vendor invoice, three-way match, approval, vendor payment, withholding/tax |
| Daily Iron | Subscription, rate agreement, usage log, bill, invoice link, collection |
| Delivery | Delivery task, assignment history, attempt, address snapshot, proof, cash handover |
| Communications | Template, consent, outbound message, provider attempt, delivery status |
| Governance | Audit event, outbox event, reconciliation run, import batch, export job |
| SaaS | Plan, subscription, entitlement, seat, usage event, tenant invoice |

---

## 7. Canonical Workflows

### 7.1 CRM in-store order

1. Staff selects or creates a customer.
2. Backend validates active services and retrieves effective branch/customer prices.
3. Staff may request a price, discount, or write-off override only within authority limits.
4. Backend creates the order with source COUNTER or IN_STORE.
5. Order starts at PICKED_UP, displayed as Received.
6. Initial immutable workflow event is RECEIVED with actor, branch, register, and timestamp.
7. Optional payment is recorded through the central payment service and allocated to the invoice/order.
8. The transaction creates an audit event and outbox event atomically.
9. Response returns the post-payment, fully refreshed order.

### 7.2 Future customer-channel order

1. Customer channel submits an idempotent pickup request referencing CRM master data.
2. Order starts at PENDING with requested slot and address snapshot.
3. CRM confirms serviceability, capacity, price assumptions, and assignment.
4. Pickup/store receipt moves it to PICKED_UP, displayed as Received.
5. Remaining processing uses the same CRM-owned state machine as in-store orders.

### 7.3 Payment

1. Payment request has a mandatory idempotency key.
2. Backend locks or version-checks the invoice/order.
3. Payment is created with a transaction status such as CAPTURED.
4. Payment is allocated to one or more invoices.
5. Invoice and order balance are derived from allocations, credit notes, and write-offs.
6. Overpayment is either rejected or explicitly credited to a wallet/customer credit account.
7. Receipt, cash/register entry, audit event, and outbox event are part of the same unit of work.

### 7.4 Cancellation and return

1. Cancellation eligibility depends on operational and financial state.
2. A reason code and note are mandatory.
3. Paid value must be refunded, credited, or explicitly retained under an approved policy.
4. Wallet, loyalty, coupon, referral, tax, invoice, and cash effects are reversed through ledger entries.
5. Return/re-clean selects exact garment units and quantities.
6. Liability, disposition, rework cost, photos, owner, SLA, and resolution are tracked.
7. Original records remain immutable and linked to corrective documents.

### 7.5 Plant and vendor flow

1. Orders and garment units are added to one active challan per dispatch.
2. Vendor rate and contract versions are snapshotted on dispatch.
3. Receipt records actual quantities per garment unit.
4. Missing, damaged, or excess units create discrepancies and cases.
5. Order status changes only after the configured receipt rule succeeds.
6. Vendor invoices are matched to dispatched and accepted quantities.
7. Vendor payments create AP and cash/bank ledger entries.

### 7.6 Daily Iron

1. Only ACTIVE subscriptions accept logs.
2. Effective customer/service rate is snapshotted on every log.
3. Duplicate policy is enforced by customer, service, and service date.
4. Monthly period is normalized to calendar or contracted billing boundaries.
5. Generated bill becomes a normal CRM invoice/receivable.
6. Every collection becomes a normal Payment and Allocation.
7. Corrections use void/rebill or credit notes, never silent aggregate edits.

---

## 8. Deployment, Schema, and Data Integrity Register

| ID | Pri | Status | Confirmed gap and evidence | Required fix and acceptance |
|---|---|---|---|---|
| DEP-001 | P0 | Complete | The migration chain now creates the entire Prisma schema, including finance, outbox, reconciliation, Daily Iron, returns, plant partners, garment custody, and delivery master records. | Acceptance passed: `prisma migrate deploy` applied all 33 migrations to an empty PostgreSQL database and `prisma migrate diff` reported schema parity on 2026-07-13. |
| DEP-002 | P0 | Complete | CI previously used prisma db push --force-reset, which masked migration drift, while production start used prisma migrate deploy. | Replaced CI schema push with Prisma validation, migration/schema drift check, and prisma migrate deploy. Disabled the local db:push script so schema changes must use reviewed migrations. Evidence: .github/workflows/ci.yml, hangers-backend/package.json; local npm run db:validate and npm test passed on 2026-07-12. |
| DEP-003 | P0 | Complete | Fresh-install and existing-data upgrade rehearsals are implemented in `scripts/ops/verify-migrations.mjs`. | Both modes passed on 2026-07-13. Upgrade verification preserves row counts and balances and asserts invoice, receipt, refund, wallet, garment-custody, vendor-payable, and delivery-assignment invariants. CI runs the migration checks. |
| DEP-004 | P1 | Open | Migration rollback and expand-contract rules are undocumented. | Adopt additive first migrations, dual-read/write where required, backfill verification, and later cleanup. Acceptance: every destructive migration has backup, rollback, and reconciliation instructions. |
| DEP-005 | P1 | Complete | The API previously began listening before master-data and permission synchronization finished; sync failures were logged but did not fail readiness. | Startup now runs master-data and permission synchronization before opening the port. `/health` is liveness only and `/ready` returns initialization state with masterData/permissions checks. Startup failure exits the process. Evidence: hangers-backend/src/index.js; local `/ready` returned ready=true after sync on 2026-07-13. |
| DEP-006 | P1 | Complete | Production configuration was only partially validated; missing worker, URL, and security configuration could silently degrade behavior. | Fixed locally: startup now validates environment mode, DATABASE_URL, JWT_SECRET strength, production HTTPS origins, DEV_MODE=false, and REDIS_URL. Invalid production config stops startup with a clear non-secret error. |
| DEP-007 | P1 | Open | DB-backed master settings are bootstrapped but arrays are not reconciled or versioned, allowing code and database metadata to drift indefinitely. | Add master-data versions, validation, migration scripts, and an admin-controlled publication process. Acceptance: every active status/method/role is valid in code, DB constraints, and UI. |
| DEP-008 | P1 | Open | An obsolete CustomerAddress table is created by migrations while the current schema uses addresses. | Inventory both tables, migrate any live rows into addresses, verify counts/defaults, then retire the obsolete table through a migration. |
| DEP-009 | P1 | Open | Production deployment runs migrations in the API start command without a separate release gate. | Add a release/migration job with lock, backup confirmation, migration report, and smoke test before application rollout. |
| DEP-010 | P2 | Open | No database schema ownership, migration reviewer, or change log is defined. | Assign owners and require schema design, data migration, rollback, and reconciliation review in every DB-changing PR. |

---

## 9. Architecture and Master Data Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| ARC-001 | P2 | Open | There is no Tenant/Organization entity or tenantId on business records. The product is not tenant-isolated SaaS. | Introduce Organization and tenant-scoped uniqueness/query enforcement before onboarding another business. Acceptance: cross-tenant access tests prove isolation. |
| ARC-002 | P1 | Open | There is no Branch, Store, Register, CostCenter, or LegalEntity model. | Add these entities now, even if one default branch is seeded. Acceptance: every order, invoice, payment, expense, cash shift, challan, and user membership has a branch/legal context. |
| ARC-003 | P1 | Open | Master data is split across JavaScript constants, Setting JSON, Prisma enums, and free strings. | Define one governed source per master domain and generate or validate downstream representations. Acceptance: unsupported metadata cannot be published. |
| ARC-004 | P1 | In Progress | Critical money, payment, invoice, expense, Daily Iron, challan, vendor-payment, garment, quality-issue, and delivery states now have database checks; metadata-backed application validation also fails closed. | Remaining work: eliminate or govern the residual flexible strings and add publication validation for every master domain. |
| ARC-005 | P0 | Complete | Financial fields were migrated from floating point to `Decimal(18,2)` or `Decimal(18,4)` through `20260713173000_fixed_precision_money`. | Fresh and legacy upgrade reconciliation passed with unchanged aggregate money values on 2026-07-13. Server calculations use explicit rounding helpers. |
| ARC-006 | P1 | In Progress | Plant references, invoice/payment allocations, return units, delivery assignments, vendor payments, staff actors, and core financial references now use restrictive foreign keys. | Remaining legacy logical IDs, including some loyalty/referral and order-link fields, still need relational conversion and orphan checks. |
| ARC-007 | P1 | Complete | `DocumentSequence` now issues order, quotation, invoice, receipt, credit note, return case, challan, vendor bill/payment, Daily Iron bill, and quality-issue numbers atomically. | A DB integration test generated 12 numbers concurrently with no duplicates; migration rehearsals passed. Tenant/legal/year scoping remains dependent on ARC-001/ARC-002. |
| ARC-008 | P1 | In Progress | Order, invoice, challan, garment unit, delivery assignment, and several financial aggregates now have versions and/or row locks. | Wallet, vendor bill, configuration publication, and remaining controllers still need consistent compare-and-swap semantics. |
| ARC-009 | P2 | Open | API contracts are implicit in controllers and UI assumptions; there is no OpenAPI contract. | Publish versioned OpenAPI schemas, error codes, idempotency rules, and deprecation policy. |
| ARC-010 | P2 | Open | Incomplete modules cannot be safely disabled by tenant or environment. | Add server-enforced feature flags for campaigns, recurring pickups, Daily Iron, public sharing, plant, delivery, and future gateway modules. |
| ARC-011 | P2 | In Progress | Shared business-time helpers and IST boundary tests now drive core reports and service-date logic. | Store timezone on the future branch/legal entity and migrate the remaining server-local date calculations. |
| ARC-012 | P2 | Open | Currency exists mainly as print configuration rather than a financial dimension. | Add currency to financial documents and lock currency per legal entity/order. Acceptance: all money records carry or inherit an unambiguous currency. |

---

## 10. Orders and Workflow Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| ORD-001 | P0 | Complete | Order and quotation pricing now resolve active services, catalog prices, upcharges, discounts, and zero-value policy on the server. Client names/prices are ignored unless the actor has the explicit override/discount authority and supplies a reason. | DB integration tests prove catalog identity/price ownership and reject an unauthorized override. CRM sends the commercial reason; migrations and tests passed on 2026-07-13. |
| ORD-002 | P1 | Complete | Source defaulted to uppercase COUNTER while status logic compared lowercase counter/walk-in, risking wrong starting status. | Fixed locally: order sources are master-data backed, aliases normalize to canonical source values, CRM/store sources start as PICKED_UP/Received, customer-app sources start as PENDING, and tests cover accepted aliases. |
| ORD-003 | P1 | Complete | createOrder did not use the available Zod order schema, allowing invalid quantities/strings to reach business logic. | Fixed locally for createOrder: current CRM payload is strictly validated before business logic, customer identity is required, empty items are rejected, and schema tests cover rejection/acceptance paths. AddItems still has deeper transactional/pricing gaps tracked under ORD-008. |
| ORD-004 | P1 | Complete | Customer resolution/creation, server pricing, order/lines, invoice, initial stage, settlement/allocation, audit, and outbox are committed in one serializable transaction. | The atomic audit rollback integration test passed; no direct notification is required for transaction success. |
| ORD-005 | P1 | Complete | Order creation re-reads and returns the final committed order with payments and adjustments after settlement. | Payment integration tests prove cached balance and allocations match immediately after commit. |
| ORD-006 | P1 | Complete | Status mutations lock the order, require the client version where applicable, increment version, and write typed stage/audit evidence atomically. | Serializable conflicts fail with 409 and do not create competing history. |
| ORD-007 | P1 | Complete | Unknown or unpublished transitions now fail closed through the canonical workflow transition map; only explicit forward/backward/correction transitions are accepted. | Database status constraints and metadata validation protect supported states. |
| ORD-008 | P1 | Complete | Pickup itemization now locks the order and atomically applies server pricing, creates lines and garment units, updates totals/version, refreshes the invoice, and writes stage/audit evidence. | Empty/settled/ineligible orders are rejected before mutation. |
| ORD-009 | P1 | In Progress | Edits preserve supplied line IDs, lock plant/challan-referenced history, version invoice changes, and refuse fulfillment-linked deletion. | Remaining work: replace pre-fulfillment line deletion/tag cascade with explicit voided order-line revisions so even printed-but-not-dispatched tag identity is retained. |
| ORD-010 | P1 | Complete | Repricing below captured receipts, credits, or posted write-offs is blocked. Refund and credit-note workflows must be posted first, preventing an unexplained overpayment state. | Acceptance is enforced in the locked order/invoice transaction. |
| ORD-011 | P0 | Complete | Cancellation previously only changed operational status and stage; paid/write-off/wallet orders could become cancelled without reversal documents. | Launch-safe guard added: cancellation is blocked for any order with captured payments, recorded paid amount, write-off amount, or wallet movement. Captured payment status values come from DB-backed master data. Full refund/reversal documents remain future enhancement, but the CRM can no longer create a cancelled paid order with unbalanced finance. Evidence: orders.controller.js cancellation guard; local tests passed on 2026-07-13. |
| ORD-012 | P0 | Complete | Orders in configurable pending/cancelled statuses previously could be hard-deleted; Payment cascaded on order deletion. | Normal hard delete removed from the CRM path. DELETE now archives/cancels eligible orders without deleting order rows, items, stages, or history; orders with payment, wallet, or plant records are refused and must use correction/reversal flow. Payment-to-order FK is migrated back to `ON DELETE RESTRICT`. Evidence: no `prisma.order.delete` remains in order controller search; local Postgres `Payment_orderId_fkey` reports restrict (`confdeltype = r`) after migration `20260713122500_restrict_payment_order_delete`. |
| ORD-013 | P1 | In Progress | ReturnCase/ReturnLine now select exact garment tags and quantities and capture reason, condition, responsibility, disposition, priority, SLA, and financial resolution. | Remaining work: governed photo attachments and a full resolution/compensation UI. |
| ORD-014 | P1 | Complete | Only delivered non-return source orders are eligible. A partial unique database index prevents more than one active return case per original order, and selected units are relationally linked. | Historical returns were backfilled as resolved cases; migration rehearsal passed. |
| ORD-015 | P1 | In Progress | Pickup and delivery now use separate versioned `DeliveryAssignment` histories and no longer depend on `assignedToId` as the authoritative task record. | Remaining work: split legacy order creator/owner into explicit `createdById` and `ownerId`, then retire the compatibility cache. |
| ORD-016 | P1 | Open | Pickup/delivery dates can be invalid or logically reversed; no branch timezone or cutoff is enforced. | Centralize date validation, reject impossible dates, and store promised/actual timestamps separately. |
| ORD-017 | P2 | Open | Pickup slots are free strings with no capacity, service area, blackout, or branch calendar. | Add ServiceArea, SlotTemplate, SlotCapacity, Holiday, and Reservation records. |
| ORD-018 | P2 | Open | No turnaround SLA, breach timer, owner escalation, or exception queue exists. | Calculate promised dates from service/branch rules and surface at-risk/breached orders with ownership. |
| ORD-019 | P1 | In Progress | Workflow, return, refund, adjustment, quality, receipt, and delivery events now store structured reason codes and optional narrative. | Remaining work: governed admin reason masters and conversion of residual note-only controllers. |
| ORD-020 | P1 | Complete | OrderStage now carries eventType, from/to status, reasonCode, actor, metadata, and timestamp; critical workflows write immutable typed events atomically. | Core lifecycle reconstruction no longer requires parsing note prefixes. |
| ORD-021 | P2 | In Progress | `GarmentUnit` now models one physical piece with immutable tag, brand, color, condition notes, special care, custody state, and version. | Remaining work: controlled photo/attachment storage and liability acknowledgement versions. |
| ORD-022 | P1 | Complete | Critical order, payment, refund, plant, Daily Iron, and delivery mutations enqueue durable deduplicated outbox events inside their business transaction. | The worker drains/retries outbox events and records heartbeat/stuck-event health. |
| ORD-023 | P2 | Open | Order search/status filtering can rely on stored paymentStatus that may be stale. | Filter via canonical invoice/balance projections or reconciled materialized fields with drift alarms. |
| ORD-024 | P2 | Open | There is no bulk operation safety model for status updates, repricing, assignment, or export. | Add preview, authorization, batch record, idempotency, partial-failure reporting, and rollback/compensation. |

---

## 11. Pricing, Discounts, Coupons, and Loyalty Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| PRC-001 | P1 | Open | Service has one mutable basePrice with no price book, effective date, branch, customer tier, or revision. | Add PriceBook and PriceBookItem versions. Snapshot applied version and rate on every line. |
| PRC-002 | P1 | Open | Price and line discount overrides have no authority threshold or approval. | Define role/staff limits and an ApprovalRequest workflow. Acceptance: out-of-policy orders cannot post until approved. |
| PRC-003 | P1 | Open | Upcharges stored on order lines are client-provided JSON and are not validated against active master upcharges. | Store structured OrderLineUpcharge rows referencing a versioned upcharge master. |
| PRC-004 | P1 | Open | Coupon validation increments usedCount before an order is committed; abandoned checks consume quota. | Implement coupon reservation, commit, release, and redemption ledger tied to customer and order. |
| PRC-005 | P1 | Open | Order creation does not persist validated coupon code/discount consistently, despite CRM sending them. | Recalculate coupon eligibility and discount inside the order transaction; never trust the UI total. |
| PRC-006 | P1 | Open | No per-customer coupon usage, stackability, service exclusions, channel rules, or first-order policy exists. | Add promotion eligibility rules and database-backed redemptions. |
| PRC-007 | P1 | Open | Loyalty validation previews a discount but never debits points, and automatic earning is not connected to delivery. | Create signed loyalty ledger entries for earn, redeem, expire, reverse, and manual adjustment. Derive the point balance. |
| PRC-008 | P1 | Open | Loyalty configuration exists in both Setting keys and LoyaltyRule. | Choose one authoritative ruleset with version/effective dates and migration of existing settings. |
| PRC-009 | P1 | Open | Discounts can reduce an order to zero without a reason or approval policy. | Define maximum discount by role/service/customer tier and require structured reason/approval. |
| PRC-010 | P1 | Open | Tax display settings exist, but there is no tax calculation engine. | Add tax category, SAC/HSN as applicable, inclusive/exclusive pricing, place of supply, CGST/SGST/IGST calculations, and immutable invoice tax lines. |
| PRC-011 | P2 | Open | Service deactivation and renaming have no impact analysis or history UI. | Preserve revisions, show affected future quotes/recurring plans, and prevent destructive replacement. |
| PRC-012 | P2 | Open | No margin floor compares customer price with plant/vendor cost. | Add configurable minimum margin and approval for below-cost work. |

---

## 12. Payments, Wallet, Write-Off, and Receivables Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| PAY-001 | P0 | Complete | Payment.status previously defaulted to PENDING, CRM manual payment creation omitted status, and reports counted all statuses except FAILED. | Added DB/master-data backed payment transaction statuses with countsAsCollection, changed Payment default to CAPTURED through migration, normalized legacy PENDING/SUCCESS rows to CAPTURED, and made CRM/manual/delivery/Razorpay receipt writers explicitly store CAPTURED. Evidence: migration 20260712143000_payment_status_captured_default, metadata API exposes paymentTransactionStatuses, local prisma validate and npm test passed on 2026-07-12. |
| PAY-002 | P0 | Complete | Posted allocations, refund allocations, credit notes, and financial adjustments are canonical. Order/invoice cached totals are synchronized from ledgers and daily reconciliation reports drift rather than taking a maximum. | Legacy and fresh verification report zero allocation/cache variance; concurrent collection integration tests passed. |
| PAY-003 | P1 | Complete | `payment.service.js` now owns CRM order, delivery cash, Daily Iron, wallet split, write-off, refund, locking, allocation, receipt, and cache synchronization behavior. | Duplicate direct payment writers in active CRM flows were removed. |
| PAY-004 | P1 | Complete | Mandatory financial-write idempotency is database-backed with actor/scope/key/request hash, processing lease, replay, conflict detection, and expiry. | CRM APIs generate idempotency keys for order, payment, refund, expense, plant, vendor, transfer, and delivery writes. |
| PAY-005 | P1 | In Progress | Payment/order/invoice rows are locked in serializable transactions and conflicts fail safely; concurrent over-collection tests pass. | Add a bounded server-side retry wrapper for serialization/deadlock errors where replay is provably safe. |
| PAY-006 | P1 | Complete | Payment is customer-scoped and `PaymentAllocation` links posted receipt value to invoices/orders; invoices accept multiple receipts and the schema supports allocation across invoices. | Reconciliation rejects missing invoice links and over-allocation. |
| PAY-007 | P1 | In Progress | Immutable refund Payments, source links, RefundAllocations, posted CreditNotes, and explicit wallet disposition are implemented without editing the original receipt. | Remaining work: generic receipt void/reissue and non-refund charge-correction UI. |
| PAY-008 | P1 | In Progress | Separate captured receipt rows can settle one invoice and CRM checkout supports wallet plus an external tender. | Remaining work: a single checkout UI for multiple simultaneous external tenders and one consolidated receipt. |
| PAY-009 | P1 | Complete | Active receipt flows reject overpayment. Refund-to-wallet requires an explicit disposition and creates linked ledger evidence; no endpoint silently clips or credits excess value. | Integration tests prove an additional receipt cannot over-collect a settled order. |
| PAY-010 | P1 | Complete | WalletTransaction now stores actor/approver, before/after balances, idempotency key, reference, expiry, reversal link, reason code, and restrictive relations. | Opening balances were backfilled to ledger entries and migration reconciliation reports zero wallet variance. |
| PAY-011 | P1 | Complete | Wallet mutations use one locked central service with conditional balance checks and ledger/cache updates in the same transaction. | Direct CRM wallet mutations no longer bypass the service. |
| PAY-012 | P1 | Complete | The invalid raw `Customer` debit path was replaced with transaction-safe operations against mapped customer records. | Wallet and migration reconciliation tests pass. |
| PAY-013 | P1 | In Progress | Live customer finance/stats and AR now derive from invoices and allocations instead of `ordersDue`. | Remove the residual legacy `Customer.ordersDue` column after import consumers are confirmed retired. |
| PAY-014 | P1 | In Progress | Write-offs are posted as immutable `FinancialAdjustment` rows with creator, approver, reason, reversal relationship, and invoice-balance effect. | Remaining work: configurable approval limits and double-entry journal posting. |
| PAY-015 | P1 | Complete | Counter staff could record order payments through a CRM-only route guarded by broad role names rather than an explicit cashier permission. | Fixed locally: payment collection now requires `finance.collect_payment`; Manager, Accounts, and Counter Staff receive that permission from DB-backed role master data. Finance payment API still requires FINANCE service access, while order-level CRM payment collection uses the narrow permission. |
| PAY-016 | P1 | Complete | Normalized method/reference fingerprints and unique idempotency keys reject duplicate manual/provider references while preserving the original display reference. | Database uniqueness protects concurrent duplicates. |
| PAY-017 | P1 | In Progress | Every allocated captured receipt receives an immutable numbered Receipt with allocation/invoice/customer snapshot and reissue/print metadata. | Remaining work: CRM reprint audit, receipt void/reissue workflow, and customer sharing. |
| PAY-018 | P1 | In Progress | Scheduled and on-demand reconciliation now checks orders, invoices, receipts, refunds, wallet, write-offs, vendor AP, garment custody, delivery assignments, outbox, and idempotency locks and stores each run. | Remaining work: production worker deployment and a complete CRM exception-resolution screen/day-close gate. |

---

## 13. Finance and Accounting Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| FIN-001 | P1 | In Progress | Canonical numbered Invoice/InvoiceLine snapshots now separate billing from operational orders and Daily Iron bills; revisions preserve pre-edit snapshots. | Remaining work: prohibit mutation of legally posted invoices and use debit/credit/rebill documents for every post-finalization change. |
| FIN-002 | P1 | Open | There is no chart of accounts or double-entry journal. | Add Account, JournalEntry, JournalLine, fiscal period, posting rules, and balanced-entry constraint. |
| FIN-003 | P1 | Open | GST/legal invoice fields and tax reporting are absent. | Add legal entity GSTIN, customer tax identity, SAC/HSN, tax breakup, invoice series, place of supply, and compliant print/export. Obtain accountant validation. |
| FIN-004 | P1 | In Progress | AR is based on invoice issue/due dates, payment terms, posted allocations, credits, write-offs, and due-date aging buckets. | Remaining work: formal statement, dispute, dunning, and historical as-of snapshots. |
| FIN-005 | P1 | Complete | AR and customer finance now include all non-void order and Daily Iron invoices less posted allocations, credits, refunds, and write-offs. | Legacy upgrade verification rejects any commercial source without an invoice. |
| FIN-006 | P1 | Open | CashBook treats OPEN as cash-in and CLOSE as cash-out. | Add Register and CashShift with opening declaration, transactions, closing count, denominations, expected amount, variance, handover, and approval. |
| FIN-007 | P1 | Open | Cash payments are not tied to an open register/shift. | Require cashier, branch, register, and shift for cash collection. |
| FIN-008 | P1 | In Progress | Expenses are retained, submitted for approval, maker-checker approved, posted, or voided with reason/actor/audit; hard delete was removed. | Remaining work: vendor/tax/attachment controls and journal posting/payment state. |
| FIN-009 | P1 | In Progress | Vendor bills now carry governed partner, vendor invoice reference/date, due date, accepted-quantity total, approval, paid amount, partial/paid status, and immutable challan linkage. | Remaining work: tax/withholding, controlled attachments, and a distinct vendor-invoice/batch abstraction. |
| FIN-010 | P1 | In Progress | Numbered VendorPayment and VendorPaymentAllocation records capture amount, method, reference, actor, partner, partial allocation, and audited AP balance updates. | Remaining work: maker-checker payment approval and double-entry cash/bank/AP posting. |
| FIN-011 | P1 | Complete | Refunds create linked immutable refund payments, RefundAllocations, and posted CreditNotes against the source invoice; return financial disposition is explicit. | Migration reconciliation verifies refund, allocation, and credit-note linkage. Tax reversal remains dependent on FIN-003. |
| FIN-012 | P2 | Open | There is no bank statement import or bank reconciliation. | Add BankAccount, StatementImport, StatementLine, Match, Reconciliation, and unresolved exception flow. |
| FIN-013 | P2 | Open | There is no fiscal period close or post-close lock. | Add period status, closing checklist, authorized reopen, and adjustment journal policy. |
| FIN-014 | P2 | Open | P&L, balance sheet, cash flow, tax summary, and trial balance cannot be produced reliably. | Derive formal financial statements from the journal after FIN-002. |
| FIN-015 | P2 | Open | Branch, service, vendor, and cost-center dimensions are absent from financial entries. | Add mandatory accounting dimensions for management profitability reporting. |
| FIN-016 | P2 | Open | Attachments are represented as ungoverned strings/URLs. | Use controlled object storage with MIME/size checks, malware scan, signed access, retention, and audit. |

---

## 14. Customer CRM Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| CUS-001 | P1 | Complete | Customer spend and finance stats derive from invoice/customer and posted payment allocations; Payment.customerId is required and backfilled. | Upgrade verification rejects payments without customers and reconciles allocations. |
| CUS-002 | P1 | In Progress | Customer summaries now separate invoiced sales, collections, outstanding, credits/refunds, and write-offs. | Contribution margin and fully defined net revenue remain dependent on accounting/cost dimensions. |
| CUS-003 | P1 | Open | There is no duplicate detection or merge workflow beyond globally unique phone. | Add normalized phone/email/address matching, duplicate suggestions, audited merge, and alias/source preservation. |
| CUS-004 | P2 | Open | Customer contact data is limited; email, alternate phones, preferred contact window, and communication validity are absent. | Add ContactPoint records with type, verification, priority, validity, and consent. |
| CUS-005 | P1 | Complete | Default-address selection is serialized in one transaction and a partial unique index enforces at most one default per customer. | A concurrent DB integration test proves only one competing default insert can commit. |
| CUS-006 | P1 | Open | Addresses are not linked to service area/version and orders often store only a free-text snapshot. | Validate serviceability and store a structured immutable order address snapshot. |
| CUS-007 | P1 | Open | Notification booleans do not represent consent evidence, purpose, source, policy version, or withdrawal time. | Add Consent records per channel/purpose with lawful basis and immutable history. |
| CUS-008 | P2 | Open | There is no unified customer interaction timeline for calls, visits, messages, orders, cases, and tasks. | Add Interaction and Task entities and render a chronological CRM timeline. |
| CUS-009 | P2 | Open | Complaints and service recovery are stored in notes/return orders rather than cases with SLA. | Add CustomerCase, category, severity, owner, status, SLA, resolution, and compensation links. |
| CUS-010 | P2 | Open | Corporate customers are only a tag; there are no organization accounts, contacts, contracts, credit limits, or consolidated billing. | Add Account/Company, contacts, branches, contract pricing, credit policy, PO references, and statements. |
| CUS-011 | P1 | Complete | Referral lifetime counts and credits now use database aggregates independent of the recent-detail page limit. | Customer summary no longer derives lifetime totals from the last ten rows. |
| CUS-012 | P1 | Open | Referral rewards lack comprehensive fraud controls, reversal policy, and customer-credit reconciliation. | Add qualification version, anti-self-referral rules, device/household review where lawful, reversal links, and audit. |
| CUS-013 | P2 | Open | Tags overwrite the current segment without history or rule provenance. | Add SegmentMembership with source, effective period, rule/manual actor, and history. |
| CUS-014 | P2 | Open | Customer ownership, next action, lead stage, and retention workflow are absent. | Add owner/team, lifecycle stage, next task, churn risk, and follow-up queues where relevant to the business. |
| CUS-015 | P1 | Open | Data export, correction, retention, anonymization, and deletion-request workflows are absent. | Implement DPDP-aligned data-rights workflows while retaining legally required financial evidence. |
| CUS-016 | P2 | Open | Imports do not use a governed batch/entity-level error and rollback model. | Add ImportBatch, source, mapping version, validation report, row result, dedupe policy, and reversible staging. |

---

## 15. Quotations Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| QTE-001 | P1 | Complete | Quotation state is now DRAFT -> SENT -> APPROVED/REJECTED/EXPIRED; CONVERTED is reserved for conversion. Server catalog/override pricing applies to create and draft edit. | Invalid transitions fail closed and CRM only renders valid actions. |
| QTE-002 | P1 | Complete | Conversion requires APPROVED state, non-expired validUntil, and at least one server-priced line. | Unapproved and expired quotations return controlled business errors. |
| QTE-003 | P1 | Complete | Conversion locks and conditionally claims the quotation inside one serializable/idempotent transaction before linking the new order. | A competing conversion cannot create a second linked order. |
| QTE-004 | P1 | Complete | Manual status mutation cannot set CONVERTED; only the successful conversion transaction writes it together with convertedOrderId. | The status UI and backend transition map both enforce the rule. |
| QTE-005 | P2 | Open | Quotation edits overwrite the current document without customer-visible revisions. | Add QuotationVersion, revision number, price snapshot, validity, and immutable sent versions. |
| QTE-006 | P1 | Complete | Shared quotation link pointed to an authenticated CRM page rather than a secure customer document. | Fixed locally: quotation sharing now creates a random hashed expiring PublicShareToken with purpose QUOTATION_VIEW, serves a customer-safe `/quotation/:slug` document through `/api/v1/public/quotations/:slug`, increments access metadata on use, and no longer shares `/dashboard/quotations/print`. Evidence: backend tests, Prisma validation, and CRM TypeScript check passed on 2026-07-13. |
| QTE-007 | P2 | Open | No acceptance record, signer, timestamp, terms version, or purchase-order reference exists. | Add explicit acceptance/rejection evidence and terms snapshot. |

---

## 16. Plant, Challan, Transfer, and Vendor Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| PLT-001 | P1 | In Progress | Governed `PlantPartner` records now own immutable code, name/legal/tax/contact/address/payment terms and active status; all plant prices, challans, bills, transfers, units, and issues use foreign keys. | Remaining work: contract/rate versions, bank details, SLA terms, and partner-admin CRM UI. |
| PLT-002 | P1 | Complete | Active challan membership is tracked explicitly and a partial unique database index permits only one active challan per order. | Orders are locked and rechecked inside serializable dispatch. |
| PLT-003 | P1 | Complete | Challan numbers use atomic `DocumentSequence`; scan/max generation was removed. | Concurrent sequence integration tests passed. |
| PLT-004 | P1 | Complete | Dispatch resolves the governed partner rate snapshot and refuses every missing or zero vendor cost before any order state changes. | The entire dispatch rolls back with the unpriced service list. |
| PLT-005 | P1 | Complete | Vendor unit cost is snapshotted on ChallanItem at dispatch. Rate changes only recalculate DRAFT records and cannot rewrite dispatched/received history. | Migration and code-path review passed. |
| PLT-006 | P1 | Complete | Manual status can only mark processing; PARTIAL/RECEIVED are derived from cumulative immutable receipt quantities and exact unit movements. | Orders transition only when every dispatched unit is received. |
| PLT-007 | P1 | Complete | Challan receipt locks the challan and atomically writes receipt header/lines, exact garment movements, quantities, membership closure, order stage/audit/outbox, and status/version. | Partial receipt cannot leave half-committed state. |
| PLT-008 | P1 | In Progress | Posted cumulative receipts cannot decrease and fully received challans are immutable. | Remaining work: an authorized discrepancy/correction receipt workflow instead of the current hard refusal. |
| PLT-009 | P1 | Complete | Receipt-driven order transitions write structured stages, atomic audit events, outbox notifications, and versions in the same transaction. | Direct post-commit notification dependence was removed. |
| PLT-010 | P1 | Complete | Vendor bill value is calculated only from accepted received quantities at each snapshotted unit cost. | Zero accepted value and ineligible challans are rejected. |
| PLT-011 | P1 | Complete | Selected challans are locked, partner/status/bill linkage is rechecked, and linkage is committed with the bill in one serializable transaction. | A challan cannot be attached to two bills. |
| PLT-012 | P1 | In Progress | Vendor bill settlement now requires approval and creates numbered partial VendorPayment/Allocation records rather than a paid flag. | Remaining work: accounting journal/bank dimension and maker-checker vendor-payment approval. |
| PLT-013 | P1 | Complete | One `GarmentUnit` with an immutable unique tag is created per physical quantity, including legacy backfill. | Printing now emits one tag per unit; quantity reduction voids unused units rather than reusing identity. |
| PLT-014 | P1 | Complete | Plant scanning queries exact unique GarmentUnit tags; bag tags are the only parsed order-level format. | The prior guessed order-number/index scan path was removed. |
| PLT-015 | P2 | In Progress | Transfers now use governed from/to partner foreign keys, strict status transitions, serializable audit, and idempotency. | Remaining work: TransferLine/garment units, dispatch/receipt discrepancies, and signatures. |
| PLT-016 | P2 | In Progress | Structured numbered PlantQualityIssue now tracks order/unit/challan/partner, type, severity, responsibility, state, reporter, resolver, and resolution and puts a unit on issue hold. | Remaining work: photo evidence, owner/SLA, vendor liability amount, and cost recovery UI. |
| PLT-017 | P2 | In Progress | Challans now record dispatchedAt, processedAt, receivedAt and receipt timestamps; unit custody records carry dispatch/receipt time. | Remaining processing/ready timestamps and SLA dashboard metrics still need explicit events. |

---

## 17. Daily Iron Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| IRON-001 | P1 | Complete | ACTIVE_IRON_SUB_STATUSES included PAUSED, allowing new usage logs for paused subscriptions. | Fixed locally: only ACTIVE subscriptions can accept new Daily Iron logs; PAUSED remains a valid subscription status but is excluded from log-eligible statuses. |
| IRON-002 | P1 | Complete | Effective rate precedence now uses customer `ironRateOverride` before service rate and snapshots rate source, amount, and pricing metadata on every log. | Invalid/non-positive effective rates are rejected. A formal contract entity remains a later enhancement. |
| IRON-003 | P1 | Complete | Seeded Daily Iron services were active with zero rates and could be logged as zero-value usage. | Fixed locally: Daily Iron log creation now requires an active DAILY_IRON service with a positive rate; zero/TBD rates remain configurable but are non-billable and blocked from logging. |
| IRON-004 | P1 | Complete | Service dates are normalized, future dates and excessive backdating are blocked, batch duplicates are rejected, and a unique customer/service/date constraint plus idempotency protects retries. | Daily Iron integrity migration and tests passed. |
| IRON-005 | P1 | Complete | Unbilled logs are voided with actor, reason, timestamp, audit, and retained row; billed logs require credit/rebill. | CRM delete now posts a correction rather than deleting usage. |
| IRON-006 | P1 | Complete | Billing periods are canonical calendar month boundaries with unique subscription/customer period rules. | Upgrade migration normalized existing periods and passed. |
| IRON-007 | P1 | Complete | Daily Iron bill and standard invoice numbers use atomic document sequences. | Scan/max generation was removed. |
| IRON-008 | P1 | Complete | Daily Iron bills create/refresh canonical Invoice and InvoiceLine snapshots linked to exact eligible logs. | Paid invoices require credit/rebill rather than silent regeneration. |
| IRON-009 | P1 | Complete | Daily Iron collection uses the central Payment/Allocation/Receipt service and synchronizes the standard invoice. | No direct paidAmount-only writer remains in the CRM bill flow. |
| IRON-010 | P1 | Complete | Payment locks the bill/invoice, is idempotent, supports partial receipts, and rejects rather than caps overpayment. | Central payment concurrency rules apply. |
| IRON-011 | P1 | Complete | Bill issue and communication delivery are separated; send actions enqueue durable outbox work and only successful worker processing updates notification state. | Mutation audit and delivery attempts are retained. |
| IRON-012 | P1 | Complete | Daily Iron invoices, receivables, payments, refunds, cashbook entries, customer finance, and core reports use the common invoice/payment ledger. | AR no longer excludes the module. |
| IRON-013 | P1 | Open | Customer.ironSubStatus duplicates IronSubscription.applicationStatus. | Remove or make one a derived projection with consistency checks. |
| IRON-014 | P2 | Open | Subscription pause/cancel has no effective date, reason, billing cutoff, or reactivation history. | Add SubscriptionStatusEvent and effective billing rules. |
| IRON-015 | P2 | Open | There is no contracted billing cycle, minimum charge, carry-forward, credit note, or statement model. | Add plan/rate terms and reuse standard invoice/credit/statement components. |

---

## 18. Delivery Masterbase Register

These items define CRM master records only. Mobile delivery implementation is out of scope.

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| DEL-001 | P1 | In Progress | Versioned `DeliveryAssignment` records now distinguish PICKUP and DELIVERY, preserve reassign/cancel/complete history, and are authoritative for execution. | Remaining work: explicit order creator/owner fields and removal of the legacy assignedTo compatibility cache under ORD-015. |
| DEL-002 | P2 | Open | There is no route, stop sequence, capacity, zone, or promised delivery window. | Add RoutePlan, Stop, service zone, slot, capacity, ETA, and dispatcher ownership. |
| DEL-003 | P1 | In Progress | `DeliveryAttempt` now records assignment/order/actor/outcome/reason/notes/confirmation method/time; failure closes the assignment and returns the order for reassignment. | Remaining work: address/contact outcome, evidence, fees, and dispatcher reschedule UI. |
| DEL-004 | P1 | In Progress | Completion, failure, and cash collection require an active authoritative assignment and run in locked idempotent transactions; cash uses central allocation. | Remaining work: configurable delivery-credit/payment exception policy and combined route-close handling. |
| DEL-005 | P1 | Open | Delivery cash is not tied to register/route handover and has no immutable handover reconciliation. | Add rider cash custody, route close, handover, receiver, variance, and approval records. |
| DEL-006 | P1 | In Progress | Structured delivery attempts and deliveredAt are available and core delivery completion writes explicit timestamps. | Audit every dashboard/report query and remove residual updatedAt fallback logic. |
| DEL-007 | P1 | Open | Delivery address is not a fully structured immutable snapshot separate from pickup address. | Store pickup and delivery snapshots, contact instructions, serviceability version, and correction history. |
| DEL-008 | P2 | In Progress | CRM delivery completion records a controlled confirmation method/reference, actor, assignment, attempt, and timestamp without requiring the excluded OTP/mobile flow. | Remaining work: configurable proof policy, governed file evidence/location, exception approval, and retention. |
| DEL-009 | P2 | Open | No delivery SLA/attempt cost/customer-notification metrics exist. | Add on-time, first-attempt, failed-attempt, route, and collection KPIs from structured events. |

---

## 19. Reporting and Analytics Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| RPT-001 | P0 | Complete | paidValue previously added writeOffAmount and labeled the result Collected. | Reports now calculate collections from captured payment states only, keep write-offs as a separate `writeOff` amount, and show/export the split in order-wise and customer-wise reports. Evidence: authenticated local `sales` and `overview` report responses returned separate `paid` and `writeOff` fields on 2026-07-13. |
| RPT-002 | P0 | Complete | Reports and dashboard previously included every payment status except FAILED, including default PENDING. | Reports, dashboard collection totals, daily payment summary, and cashbook now filter by captured statuses from the DB-backed master payment transaction status list. Evidence: reports.controller.js, orders.controller.js, payments.controller.js, cashbook.controller.js; local API metadata verified on 2026-07-12. |
| RPT-003 | P1 | Complete | Posted invoice sales and captured payment collections are queried and dated independently; order bookings no longer determine collection period. | Core overview, sales, income, order, customer, and payment reports use the canonical ledgers. |
| RPT-004 | P1 | In Progress | Pending payment and AR use invoice balance/due date rather than order creation and expose aging. | Remaining work: reconstruct historical as-of balances for arbitrary past dates. |
| RPT-005 | P1 | Complete | Shared business-time helpers use the configured Asia/Kolkata calendar for report boundaries and grouping. | Midnight/month boundary tests pass. Branch-specific timezone remains dependent on ARC-002. |
| RPT-006 | P1 | Complete | Customer sales/finance aggregates group by stable customer ID and attach the current display label separately. | Referral and customer totals also use DB aggregation. |
| RPT-007 | P1 | Open | Customer-wallet report ignores the requested date range and shows only current balances. | Label it current snapshot or implement as-of ledger balance. |
| RPT-008 | P1 | Open | Cash-up totals add OPEN, IN, OUT, and CLOSE as positive values. | Base reports on CashShift expected/declared/variance semantics. |
| RPT-009 | P1 | Open | Cancellation reason is inferred from full notes. | Use structured cancellation/return reason codes. |
| RPT-010 | P1 | Open | Loyalty points are added as positive regardless of earn/redeem/reversal type. | Use signed ledger direction and report earned, redeemed, expired, reversed, and outstanding separately. |
| RPT-011 | P1 | Complete | Core finance reports read all standard invoices/payments and include Daily Iron source documents. | AR, cashbook, overview, sales, income, and customer finance share the same ledger. |
| RPT-012 | P1 | Complete | Payment.customerId is required/backfilled and customer metrics derive through invoice allocations and net refund effects. | Migration verification rejects missing customer references. |
| RPT-013 | P1 | Open | Delivered-today and operational counts sometimes filter createdAt/updatedAt rather than actual event timestamps. | Use deliveredAt or event records consistently. |
| RPT-014 | P1 | Open | CRM loads every configured report concurrently on date or selected-report change; endpoints load full datasets. | Fetch only visible/summary reports, add pagination, query aggregation, caching/materialized views, and cancellation. |
| RPT-015 | P2 | Open | Exports are client-side summaries without job status, access audit, row count, or reproducible snapshot. | Add server-side ExportJob with filters, as-of time, permissions, signed download, retention, and audit. |
| RPT-016 | P2 | Open | There is no metric dictionary or data lineage. | Publish definitions for bookings, sales, collections, outstanding, write-offs, refunds, returns, margin, and active customers. |
| RPT-017 | P2 | Open | No scheduled reports, role-scoped dashboards, anomaly alerts, or saved views exist. | Add governed saved reports/subscriptions after metric definitions stabilize. |
| RPT-018 | P2 | Open | No vendor/service/branch contribution-margin reporting exists. | Combine posted net revenue with snapshotted fulfillment cost and financial dimensions. |
| RPT-019 | P2 | Open | Reports do not expose freshness, last reconciliation, or known exceptions. | Display data-as-of, reconciliation status, and unresolved variance count. |

---

## 20. Users, RBAC, Sessions, Audit, and Privacy Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| USR-001 | P0 | Complete | New staff had mustChangePassword=true, but there was no password-change route and no enforcement. Seed instructions requested an impossible password change. | Added authenticated current-password change with strong password validation, current-password verification, password reuse rejection, session-version rotation, old session deletion, fresh session/cookie issuance, and audit logging. Staff with `mustChangePassword=true` are blocked from all staff-authenticated routes except profile, logout, and password change. CRM now redirects forced-change users to `/change-password`. Evidence: staff auth controller/route/middleware and CRM change-password page; local tests/typecheck passed on 2026-07-13. |
| USR-002 | P1 | Complete | Seeded super admin was not explicitly forced to change password. | Seeded super admin now sets `mustChangePassword: true`, and backend middleware blocks non-password/logout actions until the password is changed. Evidence: prisma/seed.js and staff auth middleware; local tests/typecheck passed on 2026-07-13. |
| USR-003 | P1 | Complete | Staff login returned the bearer token in JSON even when CRM uses an HttpOnly cookie. | Fixed locally: staff login and forced password-change responses now return profile/access data only, while the bearer remains in the HttpOnly cookie and server session. Regression test asserts no token field in the browser auth payload. |
| USR-004 | P1 | Complete | Full JWT bearer tokens were stored in staff session rows. | Fixed locally: new staff sessions store SHA-256 tokenHash plus sessionId only; raw token column is nullable and kept only for legacy transition lookup. Logout/auth middleware resolve by hash/jti. |
| USR-005 | P1 | Complete | JWTs had no unique jti, so identical simultaneous logins could generate the same token and violate uniqueness. | Fixed locally: staff tokens now require a cryptographically random jti, stored as StaffSession.sessionId with a unique DB index. Tests prove jti is required and session data stores hash instead of raw token. |
| USR-006 | P1 | Open | There is no CRM MFA for managers, finance, or super admins. | Add configurable MFA and require it for elevated roles before broad production use. |
| USR-007 | P1 | Open | Role permission synchronization only inserts bindings and never removes obsolete role permissions. | Reconcile desired bindings transactionally, show diff, and require approval for privilege changes. |
| USR-008 | P1 | Open | Many endpoints use coarse role lists rather than permission codes, so custom grants/revokes do not behave consistently. | Define action permissions and apply them to every route and high-risk field/action. |
| USR-009 | P1 | Open | Payment, write-off, vendor payment, settings, discounts, and deletion do not implement separation of duties. | Define maker-checker rules and approval thresholds for financial/high-risk operations. |
| USR-010 | P1 | Open | CRM sidebar and New Order action render for all authenticated CRM users. | Filter routes, navigation, buttons, fields, and data by effective permission while retaining backend enforcement. |
| USR-011 | P2 | Open | Users are not scoped to branch, register, team, or cost center. | Add Membership assignments and scope data/actions accordingly. |
| USR-012 | P2 | Open | Users cannot view or revoke their active sessions/devices. | Add session management, last activity, device label, revoke-one, revoke-all, and suspicious-session alerts. |
| USR-013 | P2 | Open | Role definitions, custom permissions, and service access are complex but have no effective-access preview/test. | Add an admin access simulator and automated permission matrix tests. |
| AUD-001 | P0 | Complete | `writeAuditEvent` writes operational and compliance evidence through the caller transaction. Critical order, invoice, payment, refund, wallet, expense, Daily Iron, plant, vendor, return, transfer, delivery, and address mutations cannot commit without audit. | The DB integration rollback test proves business and audit rows roll back together. |
| AUD-002 | P1 | In Progress | Critical CRM mutations listed above now use atomic audit, and RBAC denial paths write denied events. | Complete the action inventory for residual coupon, loyalty, attendance, settings/service, and non-critical admin mutations and add one-event-per-action tests. |
| AUD-003 | P1 | Open | Audit metadata is inconsistent and often lacks before/after, reason, approval, branch, request ID, and financial document references. | Define typed audit schemas per action with sensitive-field redaction. |
| AUD-004 | P1 | Open | ActivityLog and AuditLog duplicate events without a clear retention/use distinction. | Consolidate responsibilities: operational activity feed versus immutable compliance audit, or remove duplication. |
| AUD-005 | P1 | Open | Audit storage is mutable and not tamper-evident. | Restrict DB roles, use append-only policy, retention/archive, integrity chaining or external immutable sink, and alert on failure. |
| AUD-006 | P2 | Open | Audit search filters only a small set of fields and has no export/case preservation. | Add actor, resource, date, route, request ID, branch, risk, and export with access audit/legal hold. |
| SEC-001 | P0 | Complete | Public invoice/Daily Iron endpoints previously accepted predictable order/bill/customer/subscription identifiers and returned PII/financial data. | Public invoice and Daily Iron endpoints now require random 32-character share tokens backed by hashed DB records with expiry, revocation field, access count, and last-access timestamp. Predictable order numbers, bill numbers, customer IDs, and subscription IDs no longer resolve. Public invoice payloads are minimized: no customer phone and no payment transaction rows. WhatsApp button slugs now create random share tokens instead of using order/subscription identifiers. Evidence: migration `20260713133500_public_share_tokens`, `publicShare.service.js`, public controller, Whatomate service; local predictable `HCS-1281` returned 404 while a generated token returned 200 on 2026-07-13. |
| SEC-002 | P1 | Complete | There was no global/public API rate limit beyond selected auth routes. | Fixed locally for pilot: added a global `/api/v1` limiter and stricter public share-link limiter for invoice/Daily Iron public endpoints. Auth/OTP route-specific limiters remain in place. Distributed multi-replica rate limiting and alerting remain future OPS/security hardening. |
| SEC-003 | P1 | Complete | Production CORS included hardcoded local/LAN origins. | Fixed locally: production CORS/trusted-write origins now come only from configured HTTPS origins; localhost/LAN defaults remain development-only and tests prove production rejects them. |
| SEC-004 | P1 | Complete | Console logging included customer phone/message payloads, OTPs, push tokens, provider payloads, and financial debug data. | Fixed locally: OTP, MSG91, Whatomate, Push, campaign, auth, and loyalty logs now redact phones/tokens/payloads or log only generic summaries. Redaction helper tests prove masking behavior. |
| SEC-005 | P1 | Open | Many controllers use ad hoc validation or no strict schema. | Require strict request/query/param schemas, output schemas for sensitive endpoints, and consistent error codes. |
| SEC-006 | P1 | Open | There is no formal data classification, retention schedule, or DPDP response process. | Classify fields, minimize collection, define retention, consent/purpose, breach response, data rights, and deletion/anonymization controls. |
| SEC-007 | P2 | Open | Attachment security, malware scanning, signed URLs, and retention are absent. | Implement controlled file service before adding receipts/photos/contracts. |
| SEC-008 | P2 | Open | Security headers disable CSP globally and no web-specific policy is documented. | Apply appropriate API and CRM headers, CSP for CRM, HSTS, frame policy, and automated header tests. |

---

## 21. Communications, Campaigns, Automation, and Recurring Work Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| COM-001 | P0 | Complete | Campaign send previously only logged text, incremented sentCount, and marked SENT without contacting a provider. | Launch gate added through DB-backed `master.launchCapabilities`: Campaign read remains available, but create and send are disabled in API routes and CRM UI until a provider-backed queue, audience snapshots, consent checks, and delivery ledger exist. Evidence: metadata exposes `launchCapabilities.campaigns`, POST campaign/send routes return launch-gate errors, marketing UI disables unsafe actions. |
| COM-002 | P1 | Open | Campaign audience is evaluated at send time with only a tag filter and no snapshot. | Create CampaignAudienceSnapshot with consent/eligibility, dedupe, exclusions, count approval, and immutable membership. |
| COM-003 | P1 | Open | Campaign sending ignores active status and communication consent. | Enforce customer activity, purpose-specific consent, suppression list, quiet hours, and unsubscribe. |
| COM-004 | P1 | Open | There is no outbound message ledger or per-recipient status. | Add OutboundMessage and DeliveryAttempt with queued, provider-accepted, delivered, read, failed, suppressed, and retry states. |
| COM-005 | P0 | Complete | Automation records previously could be created/toggled even though no trigger engine reads or executes them. | Launch gate added through DB-backed `master.launchCapabilities`: Automation read remains available, but create/update/toggle are disabled in API routes and CRM UI until an event-driven rules engine, idempotency, scheduling, audit, and execution history exist. Evidence: metadata exposes `launchCapabilities.automations`, automation mutation routes are guarded, marketing UI disables unsafe actions. |
| COM-006 | P0 | Complete | RecurringPickup previously allowed scheduled records even though no scheduler calculates nextPickup or creates work. | Launch gate added through DB-backed `master.launchCapabilities`: Recurring pickup read remains available, but create/toggle are disabled in API routes and CRM UI until next-pickup calculation, scheduler, exception calendar, capacity rules, generated-order link, and idempotency exist. Evidence: metadata exposes `launchCapabilities.recurringPickups`, recurring mutation routes are guarded, recurring UI disables unsafe actions. |
| COM-007 | P1 | Open | Transactional order notifications can be considered successful when provider integration is disabled or returns false. | Separate skipped, simulated, queued, accepted, delivered, and failed states. Do not mark sent on false/no provider. |
| COM-008 | P1 | Open | Order communications do not consistently honor customer WhatsApp preference/consent. | Enforce consent at dispatch and retain the consent/purpose version used. |
| COM-009 | P2 | Open | Template configuration is mutable JSON without publication/version/test controls. | Add template versions, locale, provider template ID, variables schema, approval, preview, test-send, and rollback. |
| COM-010 | P2 | Open | There is no customer communication frequency cap or collision control. | Add priority, quiet hours, deduplication, campaign caps, and transactional-over-marketing precedence. |

---

## 22. Reliability, Operations, and Test Register

| ID | Pri | Status | Confirmed gap | Required fix and acceptance |
|---|---|---|---|---|
| OPS-001 | P0 | Open | REDIS_URL is prescribed for production, but no deployed worker process is verified. A worker entrypoint and npm scripts now exist locally. | Deploy a separate worker service/process and verify notification/PDF jobs complete. |
| OPS-002 | P0 | Complete | Notification worker directFallback caught errors, so BullMQ saw failed deliveries as successful and would not retry. | Fixed locally: worker execution now throws on failed sends, classifies retryable/permanent failures, uses BullMQ UnrecoverableError for permanent failures, and moves exhausted/permanent failures to a notification DLQ. |
| OPS-003 | P1 | Open | Queue enqueue depends on a nonblocking Redis availability flag; behavior can switch between sync and queued unpredictably. | Use explicit queue health/readiness and a deliberate production failure policy. |
| OPS-004 | P1 | Complete | Durable OutboxEvent rows are created inside business transactions and drained by an idempotent worker with dedupe keys, attempts, retry/dead state, and reconciliation. | Critical order/payment/plant/Daily Iron/delivery side effects use the outbox. |
| OPS-005 | P1 | Open | SSE channels are process-local, so multiple API replicas do not share events. | Use Redis pub/sub/streams or a managed event layer, with reconnect cursor or client refetch behavior. |
| OPS-006 | P1 | In Progress | `/health` is liveness; `/ready` checks initialization/master data/permissions and live database connectivity. Ops endpoints expose worker heartbeats and outbox/reconciliation health. | Add Redis/worker freshness to the deploy platform readiness gate. |
| OPS-007 | P1 | Complete | API and worker entrypoints handle SIGTERM/SIGINT, stop timers/accepting work, close BullMQ/Redis/Prisma/server resources, and enforce a shutdown timeout. | Local code-path verification passed. |
| OPS-008 | P1 | Open | Logging uses console/morgan without structured production context or request correlation in audit. | Add structured JSON logger with request ID, tenant, actor, route, duration, status, and redaction. |
| OPS-009 | P0 | Open | No automated database backup/PITR policy or restore drill is documented; runbook only mentions backups before imports. | Enable managed PITR, define RPO/RTO, automate backup verification, and perform a timed restore drill before go-live. |
| OPS-010 | P1 | Open | There is no error tracking, metrics, tracing, dashboards, or alerts. | Add API error/latency, DB, queue, worker, reconciliation, login, payment, and financial-variance monitoring. |
| OPS-011 | P1 | Open | There are no defined SLOs or incident ownership. | Define availability/latency/job/reconciliation objectives, on-call owner, escalation, and incident runbooks. |
| OPS-012 | P2 | Open | Prisma connection pool sizing and database capacity limits are not documented. | Configure pool/timeouts for deployment replicas and load-test worst-case reports/exports. |
| OPS-013 | P2 | Open | Expired sessions, auth challenges, idempotency records, logs, jobs, and exports have no cleanup/retention jobs. | Add scheduled retention with legal exceptions and monitored deletion/archive counts. |
| OPS-014 | P2 | Open | No feature-release, canary, rollback, or kill-switch process exists. | Add environment/tenant feature flags, release checklist, canary validation, and rapid rollback. |
| TST-001 | P0 | In Progress | A real migrated PostgreSQL integration suite now proves server pricing, payment allocation, concurrent over-collection, atomic audit rollback, garment-unit identity, address uniqueness, and document numbering. All 58 tests passed with integration enabled on 2026-07-13. | Add endpoint-level return/refund, Daily Iron, challan/vendor AP, delivery, RBAC, and browser workflows before broad rollout. |
| TST-002 | P0 | Complete | CI and local verification deploy every migration from empty and rehearse upgrade from a production-like legacy snapshot. | Both modes passed with schema parity and balance/custody invariants on 2026-07-13. |
| TST-003 | P1 | In Progress | Concurrent payment collection, document numbering, and default-address uniqueness are tested against PostgreSQL. | Add concurrent wallet debit, status, quotation conversion, challan, vendor bill/payment, and Daily Iron cases. |
| TST-004 | P1 | In Progress | Migration and scheduled reconciliation assert order/invoice/allocation/refund/receipt/wallet/write-off/vendor/custody invariants. | Add double-entry journal balance tests after FIN-002 and a fixed report golden dataset. |
| TST-005 | P1 | Open | No cancellation/refund/return tests prove all ledgers reverse correctly. | Add lifecycle tests from sale through partial/full payment, cancellation, refund, and reporting. |
| TST-006 | P1 | Open | No RBAC end-to-end matrix tests exist for API and CRM UI. | Generate tests from the permission catalog covering allow/deny, field visibility, branch scope, and approval limits. |
| TST-007 | P1 | Open | No CRM browser tests cover create order, collect payment, cancel, challan, Daily Iron bill, report, and logout/password change. | Add production-build E2E tests with seeded roles and deterministic fixtures. |
| TST-008 | P2 | Open | No API contract/consumer tests exist for future channels. | Validate OpenAPI responses and backward compatibility before mobile clients are built. |
| TST-009 | P2 | Open | No report accuracy golden dataset exists. | Create a fixed accounting fixture with expected sales, collections, AR, tax, refunds, wallet, and margin results. |
| TST-010 | P2 | Open | No load/performance tests cover report fan-out, search, exports, or month-end workloads. | Define data volumes and latency budgets; test API, DB, and worker capacity. |
| TST-011 | P2 | Open | No security tests cover public-link enumeration, rate limits, session revocation, CSRF/origin, file upload, and privilege escalation. | Add automated security regression tests and periodic external review. |

---

## 23. SaaS Readiness Register

These items are not all blockers for a one-company pilot, but they are mandatory before the CRM is marketed or operated as multi-tenant SaaS.

| ID | Pri | Status | Gap | Required target |
|---|---|---|---|---|
| SAA-001 | P2 | Open | No tenant organization model | Organization, legal entity, tenant lifecycle, isolation policy |
| SAA-002 | P2 | Open | No tenant-scoped uniqueness or query guard | Mandatory tenant context and composite constraints on every business record |
| SAA-003 | P2 | Open | No branch/location/register hierarchy | Branch administration, service areas, calendars, registers, dimensions |
| SAA-004 | P2 | Open | Staff is global rather than membership-based | User identity plus tenant/branch memberships and roles |
| SAA-005 | P2 | Open | No tenant onboarding or seeded configuration lifecycle | Guided onboarding, import, validation, default masters, launch checklist |
| SAA-006 | P2 | Open | No plan, trial, entitlement, or seat model | ProductPlan, TenantSubscription, Entitlement, Seat, trial/renewal state |
| SAA-007 | P2 | Open | No usage metering | Immutable UsageEvent, aggregation, limits, overage policy, audit |
| SAA-008 | P2 | Open | No SaaS billing/accounting | Subscription invoice, payment, tax, credits, dunning, cancellation |
| SAA-009 | P2 | Open | No tenant feature configuration and safe rollout | Tenant feature flags, plan entitlements, config versions, audit |
| SAA-010 | P2 | Open | No tenant export/deletion/closure workflow | Portable export, retention/legal hold, anonymization, account closure |
| SAA-011 | P3 | Open | No SSO/SAML/SCIM or enterprise identity lifecycle | Enterprise authentication, provisioning, deprovisioning, domain claims |
| SAA-012 | P2 | Open | No external API keys/webhooks/integration management | Scoped credentials, webhook signatures, retries, logs, rotation, quotas |
| SAA-013 | P2 | Open | No tenant support/admin impersonation controls | Time-bound support access, approval, banner, full audit, no hidden impersonation |
| SAA-014 | P2 | Open | No tenant-level SLO/usage/health visibility | Tenant health, jobs, imports, errors, limits, data freshness, status communication |
| SAA-015 | P2 | Open | No per-tenant backup/export or regional/data-residency policy | Documented storage region, recovery, portability, and compliance controls |

---

## 24. Minimum CRM Pilot Gates

Every checkbox below must be complete before real customer transactions are accepted in the CRM pilot.

- [x] GATE-001: DEP-001, DEP-002, and DEP-003 pass against a clean production-like database.
- [x] GATE-002: ARC-005 money migration strategy is approved and PAY-001/PAY-002 are fixed.
- [x] GATE-003: ORD-001 prevents unauthorized price, discount, upcharge, and write-off manipulation.
- [x] GATE-004: ORD-002 proves COUNTER/IN_STORE starts Received and future APP starts Pending.
- [x] GATE-005: ORD-011 and ORD-012 prevent unbalanced cancellation and financial hard deletion.
- [x] GATE-006: USR-001/USR-002 permit and force secure password change for seeded/elevated users.
- [x] GATE-007: SEC-001 public financial links are disabled or converted to secure share tokens.
- [x] GATE-008: COM-001, COM-005, and COM-006 are hidden/disabled unless implemented truthfully.
- [ ] GATE-009: OPS-001 and OPS-002 prove background jobs run and failed jobs retry.
- [ ] GATE-010: OPS-009 backup and restore drill meets approved RPO/RTO.
- [ ] GATE-011: TST-001 through TST-007 cover the pilot-critical workflows.
- [ ] GATE-012: Pre-live reconciliation in Section 26 returns no unexplained variance.
- [ ] GATE-013: Named users, roles, branch/register assignment, and maker-checker policy are approved.
- [ ] GATE-014: CRM production build, API smoke test, migration report, worker health, and monitoring alerts pass.
- [ ] GATE-015: A rollback decision owner and customer-impact communication plan are assigned.

---

## 25. Remediation Sequence

### Phase 0: Stop financial or deployment corruption

Target: before real-money pilot.

- DEP-001 through DEP-003
- ARC-005
- ORD-001, ORD-002, ORD-011, ORD-012
- PAY-001, PAY-002
- RPT-001, RPT-002
- USR-001, USR-002
- AUD-001
- SEC-001
- COM-001, COM-005, COM-006
- OPS-001, OPS-002, OPS-009
- TST-001, TST-002

### Phase 1: Make CRM operationally trustworthy

Target: controlled single-branch rollout.

- Central price, order transition, payment, wallet, audit, and outbox services.
- Invoice/payment allocation foundation.
- Cancellation/refund/return workflows.
- Cash shift and expense controls.
- Customer reconciliation and correct reports.
- Plant receipt and vendor-cost snapshot integrity.
- Daily Iron invoice/payment integration.
- RBAC and permission-aware CRM UI.
- Integration, concurrency, E2E, and financial golden tests.

### Phase 2: Make CRM the complete masterbase

Target: multi-branch internal use.

- Branch/legal entity/register dimensions.
- Customer interactions, tasks, consent, cases, corporate accounts.
- Vendor/AP, accounting journal, GST, bank reconciliation, period close.
- Route, delivery task, plant exception, garment-unit custody.
- Real communications, scheduler, export jobs, reporting warehouse/projections.
- Monitoring, SLOs, retention, and incident operations.

### Phase 3: SaaS platform

Target: onboarding independent businesses.

- Organization tenancy and enforced isolation.
- Tenant memberships, configuration, feature flags, onboarding, import/export.
- Plans, seats, entitlements, usage, subscription billing.
- External APIs, webhooks, enterprise identity, support controls.
- Tenant recovery, compliance, SLO, and operational health.

### Phase 4: Future mobile and gateway channels

Target: after CRM masterbase APIs are stable.

- Build mobile clients from OpenAPI/master metadata.
- Add customer/staff/delivery channel-specific authentication.
- Add CRM-controlled payment intents, gateway integration, webhooks, refunds, and settlement reconciliation.
- Do not duplicate prices, balances, workflow logic, or reports in mobile clients.

---

## 26. Required Pre-Live Data Reconciliation

Create a read-only reconciliation script/report for each check and preserve the signed result with the release.

| Check | Expected result |
|---|---|
| Schema vs migrations | No schema object exists only through db push |
| Order number uniqueness | Zero duplicate order/quotation/return numbers |
| Challan/vendor bill uniqueness | Zero duplicate document numbers |
| Payment transaction status | Every manual payment has an approved explicit status |
| Order paid cache vs allocations | Exact match or approved migration exception |
| Outstanding balance | Invoice total - credits - write-offs - captured allocations = displayed balance |
| Cancelled orders with captured payments | Every row has refund, credit, or approved retained-payment disposition |
| Deleted financial records | No application path can delete posted evidence |
| Wallet balance vs ledger | Exact match for every customer |
| Negative wallet | Zero unless an approved credit-limit product is introduced |
| Customer ordersDue | Removed or exact match to AR projection |
| Write-off policy | No negative, excess, unexplained, or unauthorized write-off |
| Coupon usage | Every committed redemption maps to one eligible order/customer |
| Loyalty balance | Exact signed-ledger total |
| Default addresses | At most one default per customer and one where required |
| Active challan membership | No order/unit in more than one active dispatch |
| Challan received quantity | No quantity below zero or above dispatched quantity |
| Vendor bill eligibility | Billed quantities/costs match accepted quantities and snapshots |
| Daily Iron billing periods | No overlapping bills per subscription |
| Daily Iron paid totals | Exact match to standard payment allocations |
| Reports | Golden dataset matches expected sales, collections, AR, refunds, write-offs, tax, wallet, and margin |
| Role permissions | Effective permissions match the approved matrix; no stale bindings |
| Audit coverage | Every sampled critical mutation has exactly one linked audit event |
| Outbox | No unexplained stuck or duplicate business event |

---

## 27. Critical Automated Test Matrix

| Scenario | Required assertions |
|---|---|
| CRM in-store order | Source canonical; starts PICKED_UP/Received; RECEIVED event; server price; correct final response |
| Future app order contract | Starts PENDING; cannot skip receipt rule without authorization |
| Simultaneous order creation | Unique document numbers; no partial customer/order |
| Full cash payment | CAPTURED payment; allocation; receipt; register entry; balance zero; audit/outbox |
| Partial UPI/card payment | Correct remaining balance and receivable |
| Simultaneous payments | No over-allocation, duplicate receipt, or lost update |
| Overpayment | Policy-enforced reject/credit/refund with ledger evidence |
| Wallet concurrent debit | No negative balance or double spend |
| Price override | Unauthorized rejected; authorized reason/approval captured |
| Write-off | Threshold and maker-checker enforced; reported separately from collection |
| Paid cancellation | Credit/refund and all dependent reversals balance |
| Return/re-clean | Exact units/quantities, case, SLA, financial resolution, immutable source |
| Quotation conversion race | Exactly one order and one conversion event |
| Challan creation race | Exactly one active membership per order/unit |
| Partial plant receipt | Correct accepted/missing quantities, status, discrepancy, vendor cost |
| Vendor invoice/payment | Three-way match, partial payment, AP/journal balance |
| Daily Iron paused subscription | New normal log rejected |
| Daily Iron monthly bill | Canonical period, no overlap, standard invoice/AR |
| Daily Iron partial payment | Standard payment/allocation and report inclusion |
| Permission matrix | API and CRM UI allow/deny every role/action correctly |
| Session/password change | Forced change, token rotation, old sessions revoked |
| Public share link | Random, expiring, revocable, minimal PII, rate-limited, audited |
| Worker failure | Retry then DLQ; operation shows delivery failure truthfully |
| Backup restore | Restored data passes financial reconciliation within RTO |
| Report golden data | All metric definitions match fixed expected values |

---

## 28. Ownership Matrix to Complete Before Implementation

| Area | Accountable owner | Technical owner | Business approver | External reviewer |
|---|---|---|---|---|
| Orders and fulfillment | TBD | TBD | Operations | Plant/vendor representative |
| Pricing and discounts | TBD | TBD | CEO/Operations | Accountant for tax impact |
| Payments and wallet | TBD | TBD | Finance | Accountant/auditor |
| Accounting and GST | TBD | TBD | Finance | Chartered accountant/tax adviser |
| Customer data and consent | TBD | TBD | CEO/CRM | Privacy/legal adviser |
| Users and permissions | TBD | TBD | CEO | Security reviewer |
| Plant/vendor/AP | TBD | TBD | Operations/Finance | Vendor/accountant |
| Daily Iron | TBD | TBD | Operations/Finance | Accountant |
| Reports and metrics | TBD | TBD | CEO/Finance | Accountant/data reviewer |
| Infrastructure and recovery | TBD | TBD | CEO/CTO | Hosting provider/security reviewer |
| SaaS tenancy and billing | TBD | TBD | CEO/Product | Legal/accounting/security |

---

## 29. Definition of Done for Every Fix

A fix is not complete merely because the UI behaves correctly.

- [ ] Business behavior and forbidden behavior are documented.
- [ ] Backend owns and validates the rule.
- [ ] Database constraints protect critical invariants.
- [ ] Concurrency and retry behavior are defined.
- [ ] Idempotency is implemented where a retry can duplicate effects.
- [ ] Financial impact and journal/reconciliation effect are defined.
- [ ] Actor, reason, before/after, approval, and request ID are audited.
- [ ] Outbound side effects use outbox/worker where appropriate.
- [ ] API contract and error codes are updated.
- [ ] CRM permissions and UI visibility are updated.
- [ ] Unit, integration, concurrency, RBAC, and E2E tests pass as applicable.
- [ ] Migration, backfill, rollback, and reconciliation scripts are reviewed.
- [ ] Monitoring and alerting cover the new failure modes.
- [ ] Documentation and this register are updated.
- [ ] Acceptance is signed by the accountable business owner.

---

## 30. Evidence Index

Primary files reviewed:

- hangers-backend/prisma/schema.prisma
- hangers-backend/prisma/migrations
- hangers-backend/prisma/seed.js
- hangers-backend/src/index.js
- hangers-backend/src/config/master-data.js
- hangers-backend/src/services/masterData.service.js
- hangers-backend/src/services/accessControl.service.js
- hangers-backend/src/services/activity.service.js
- hangers-backend/src/services/billing.service.js
- hangers-backend/src/services/payment.service.js
- hangers-backend/src/services/receipt.service.js
- hangers-backend/src/services/outbox.service.js
- hangers-backend/src/services/reconciliation.service.js
- hangers-backend/src/services/garment-unit.service.js
- hangers-backend/src/services/plant-partner.service.js
- hangers-backend/src/services/wallet.service.js
- hangers-backend/src/services/referral.service.js
- hangers-backend/src/controllers/orders.controller.js
- hangers-backend/src/controllers/payments.controller.js
- hangers-backend/src/controllers/staff.wallet.controller.js
- hangers-backend/src/controllers/customers.controller.js
- hangers-backend/src/controllers/checkout.controller.js
- hangers-backend/src/controllers/loyalty.controller.js
- hangers-backend/src/controllers/reports.controller.js
- hangers-backend/src/controllers/cashbook.controller.js
- hangers-backend/src/controllers/expenses.controller.js
- hangers-backend/src/controllers/ar-ledger.controller.js
- hangers-backend/src/controllers/challan.controller.js
- hangers-backend/src/controllers/plant-partners.controller.js
- hangers-backend/src/controllers/plant.controller.js
- hangers-backend/src/controllers/iron.controller.js
- hangers-backend/src/controllers/delivery.controller.js
- hangers-backend/src/controllers/quotations.controller.js
- hangers-backend/src/controllers/public.controller.js
- hangers-backend/src/controllers/staffAuth.controller.js
- hangers-backend/src/controllers/staffManagement.controller.js
- hangers-backend/src/controllers/security.controller.js
- hangers-backend/src/controllers/campaigns.controller.js
- hangers-backend/src/controllers/automations.controller.js
- hangers-backend/src/controllers/recurring.controller.js
- hangers-backend/src/controllers/transfers.controller.js
- hangers-backend/src/routes
- hangers-backend/src/workers.js
- hangers-backend/scripts/ops/verify-migrations.mjs
- hangers-backend/tests/order-workflow.integration.test.js
- hangers-backend/src/middleware/auth.js
- hangers-backend/src/middleware/rbac.js
- hangers-backend/src/middleware/idempotency.js
- hangers-backend/src/queues
- hangers-crm/src/lib/api.ts
- hangers-crm/src/app/dashboard/layout.tsx
- hangers-crm/src/app/dashboard/orders
- hangers-crm/src/app/dashboard/reports/page.tsx
- hangers-crm/src/app/dashboard/customers
- hangers-crm/src/app/dashboard/plantchallans
- hangers-crm/src/app/dashboard/iron
- hangers-crm/src/app/dashboard/finance
- hangers-crm/src/app/dashboard/cashbook
- hangers-crm/src/app/dashboard/expenses
- hangers-crm/src/app/dashboard/marketing
- .github/workflows/ci.yml
- CRM_GO_LIVE.md

Verification performed on 12 July 2026:

- Backend test suite: 24 passed, 0 failed.
- CRM TypeScript check: passed.
- CRM production build: passed.
- Prisma schema validation: passed.
- Migration coverage review: failed because committed migrations do not reproduce the current schema.
- Business workflow integration coverage: insufficient.

Latest local remediation verification on 13 July 2026:

- Backend unit/helper suite: 51 passed, 0 failed, 7 DB tests skipped unless `RUN_DB_INTEGRATION=1`.
- Full migrated-PostgreSQL integration run: 58 passed, 0 failed, including the custody/sequence/address concurrency cases.
- CRM TypeScript check: passed with `npx tsc --noEmit`.
- CRM optimized production build: passed with all 30 routes generated/compiled.
- Prisma schema validation: passed with `npm run db:validate`.
- Fresh install: 33 migrations applied with exact Prisma schema parity.
- Legacy upgrade: passed with preserved customer/order/item/payment/invoice/wallet totals and zero invoice, refund, receipt, garment, challan, vendor payable, and delivery assignment reconciliation variance.
- Register status at version 1.30: 89 Complete, 39 In Progress, 124 Open across 252 items.
- Completed local remediation rows are recorded through document version 1.30 in the change log.
- Remaining P0/P1 items are still open unless their register row explicitly says Complete.
- Version 1.31 evidence reconciliation rechecked the current workspace: no post-1.30 organization/register/cash-shift or double-entry accounting implementation is present, so ARC-001/ARC-002, FIN-002/FIN-003, and FIN-006/FIN-007 correctly remain Open and the verified status counts are unchanged.

---

## 31. Decision Log

| Date | Decision | Reason | Owner |
|---|---|---|---|
| 2026-07-12 | Launch scope is CRM web plus backend only | CRM must become the masterbase before channels are added | User/CEO |
| 2026-07-12 | OTP and Razorpay are excluded from the current audit fix phase | Mobile is not launching; gateway will be designed later inside CRM finance | User/CEO |
| 2026-07-12 | CRM in-store orders begin as PICKED_UP with label Received | Garments are already physically received at order creation | User/CEO |
| 2026-07-12 | Future customer-app orders begin as PENDING | Pickup/store receipt has not yet occurred | User/CEO |
| 2026-07-12 | CRM/database will own all master data and workflow truth | Future mobile apps will consume CRM APIs | User/CEO |

---

## 32. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-07-12 | Initial detailed CRM-only audit and remediation register created from the full repository audit |
| 1.1 | 2026-07-12 | DEP-002 fixed locally: CI now validates Prisma schema, checks schema/migration drift, deploys migrations to the test database, and local db:push is blocked. |
| 1.2 | 2026-07-12 | PAY-001 and RPT-002 fixed locally: payment transaction statuses are DB/master-data backed, new receipts write CAPTURED, legacy pending/success receipt rows are normalized, and reports/cashbook count only captured collections. |
| 1.3 | 2026-07-13 | DEP-005 fixed locally: API startup now blocks on master-data and permission sync, exposes `/ready`, and exits on failed required initialization. |
| 1.4 | 2026-07-13 | COM-001, COM-005, and COM-006 fixed locally: Campaigns, Automations, and Recurring Pickup unsafe write/send/toggle actions are launch-gated by DB-backed master settings and exposed to the CRM through metadata. |
| 1.5 | 2026-07-13 | RPT-001 fixed locally: report collections no longer include write-offs; reports expose write-offs separately and the CRM report table/export surfaces the split. |
| 1.6 | 2026-07-13 | ORD-012 fixed locally: CRM order delete is now an archive/cancel policy with audit trail, financial/plant-linked orders are refused, and Payment order foreign key is restricted instead of cascading. |
| 1.7 | 2026-07-13 | ORD-011 fixed locally: cancelling orders with captured payments, paid amount, write-offs, or wallet movement is blocked using DB-backed captured payment statuses, preventing unbalanced cancelled paid orders. |
| 1.8 | 2026-07-13 | USR-001 and USR-002 fixed locally: staff password change route, forced-change middleware, session rotation, seeded-admin force flag, and CRM `/change-password` flow are implemented. |
| 1.9 | 2026-07-13 | SEC-001 fixed locally: public invoice and Daily Iron links now use random hashed expiring share tokens, predictable identifiers return 404, WhatsApp link slugs use tokens, and public payloads are minimized. |
| 1.10 | 2026-07-13 | OPS-002 fixed locally: notification workers now fail jobs on send failure, retry transient provider failures, mark permanent failures unrecoverable, and copy exhausted/permanent jobs into a dead-letter queue; backend worker scripts were added for production process management. |
| 1.11 | 2026-07-13 | ORD-002 fixed locally: order creation now normalizes source through DB-backed master data so store/CRM orders start as Received and future app orders start as Pickup Pending, with source-alias tests added. |
| 1.12 | 2026-07-13 | ORD-003 fixed locally for createOrder: the endpoint now uses a strict Zod schema matching the CRM payload, rejects missing customer/empty items before business logic, and no longer logs raw write-off debug data. |
| 1.13 | 2026-07-13 | USR-003 fixed locally: staff auth JSON responses no longer expose bearer tokens to browser JavaScript; authentication remains cookie/session backed. |
| 1.14 | 2026-07-13 | DEP-006 and SEC-003 fixed locally: production startup now fails closed on missing unsafe env, production CORS/trusted-write origins are explicit HTTPS-only, and localhost/LAN origins are development-only. |
| 1.15 | 2026-07-13 | USR-004 and USR-005 fixed locally: staff sessions now store token hashes and unique JWT jti/session IDs instead of raw bearer tokens for new sessions. |
| 1.16 | 2026-07-13 | PAY-015 fixed locally: order payment collection is now controlled by the explicit `finance.collect_payment` permission instead of broad role checks. |
| 1.17 | 2026-07-13 | SEC-004 fixed locally: sensitive console logs were redacted for OTP, WhatsApp, push, campaign, provider payload, and debug financial paths. |
| 1.18 | 2026-07-13 | SEC-002 fixed locally for pilot: global API and public share-link rate limiters were added in addition to auth/OTP-specific limiters. |
| 1.19 | 2026-07-13 | IRON-001 fixed locally: paused Daily Iron subscriptions can no longer accept new usage logs. |
| 1.20 | 2026-07-13 | IRON-003 fixed locally: Daily Iron logging now blocks active services with zero/TBD rates until a positive rate is configured. |
| 1.21 | 2026-07-13 | QTE-006 fixed locally: quotation sharing now uses random expiring public share tokens and a customer-safe public quotation page instead of authenticated CRM print links. |
| 1.22 | 2026-07-13 | DEP-001/DEP-003 and ARC-005 completed: 33 forward migrations now reach schema parity from empty and rehearse the legacy upgrade with Decimal money and reconciliation. |
| 1.23 | 2026-07-13 | Canonical Invoice/InvoiceLine, PaymentAllocation, FinancialAdjustment, RefundAllocation, CreditNote, immutable Receipt, ReturnCase/ReturnLine, and document sequences were implemented and backfilled. |
| 1.24 | 2026-07-13 | Daily Iron gained canonical dates/duplicates, rate snapshots, void-only corrections, standard invoices, central payment allocation, outbox delivery, and core finance/report inclusion. |
| 1.25 | 2026-07-13 | Plant flow gained governed partners, active-challan uniqueness, rate/cost dispatch validation, immutable cumulative receipts, accepted-quantity vendor bills, approvals, and partial vendor payment allocations. |
| 1.26 | 2026-07-13 | One GarmentUnit/tag per physical piece, exact scan lookup, exact challan custody, exact return-unit selection, and structured PlantQualityIssue records were added with legacy backfills. |
| 1.27 | 2026-07-13 | DeliveryAssignment and DeliveryAttempt became the CRM master records; assignment, pickup, failure, completion proof method, and delivery cash are locked/idempotent/audited without depending on the excluded OTP flow. |
| 1.28 | 2026-07-13 | Quotation create/edit now uses authoritative server pricing and controlled transitions/conversion; core reports and customer finance were moved to canonical invoice/payment ledgers and IST business time. |
| 1.29 | 2026-07-13 | Reconciliation expanded to receipts/refunds/wallet/write-offs/vendor AP/garment custody/delivery; PostgreSQL integration tests cover pricing, allocation, concurrency, atomic audit, garment units, default addresses, and sequences. |
| 1.30 | 2026-07-13 | All 252 register rows were re-evaluated: evidence-backed work is Complete or In Progress; external deployment/backup and genuinely unimplemented accounting, tenancy, register, compliance, and E2E work remains open. |
| 1.31 | 2026-07-13 | Reconciled the audit against the current schema, services, tests, and migration chain. All verified remediation through 1.30 remains recorded; no unsupported completion claims were added. The register remains 89 Complete, 39 In Progress, and 124 Open, with cash shifts, organization/branch dimensions, and double-entry accounting retained as the next implementation block. |

---

## 33. Recommended Next Work Session

Continue with the remaining single-company CRM launch controls:

1. Add Register/CashShift/cash custody and mandatory cash handover.
2. Add double-entry journal posting, fiscal periods, and accountant-reviewed GST/legal invoice fields.
3. Finish maker-checker thresholds, residual permission routes, and a permission-aware CRM navigation/action matrix.
4. Add endpoint/browser E2E for refund/return, Daily Iron, challan/vendor AP, delivery, report accuracy, and session flows.
5. Deploy the worker, prove heartbeat/retries/outbox drain, enable managed PITR, and execute the timed restore/reconciliation drill.
6. Run the production pre-live migration report, smoke test, and zero-variance reconciliation before changing the launch decision.

Suggested continuation request:

**Continue CRM masterbase remediation from FIN-006/FIN-007 cash shifts, then FIN-002 accounting journal, and update this audit file with every test and acceptance result.**
