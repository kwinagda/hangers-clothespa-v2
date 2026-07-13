import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

const mode = process.argv[2] || 'fresh';
if (!['fresh', 'upgrade'].includes(mode)) {
  throw new Error('Usage: node scripts/ops/verify-migrations.mjs <fresh|upgrade>');
}

const resolveBinary = (name) => {
  const configured = process.env.PG_BIN ? join(process.env.PG_BIN, name) : null;
  if (configured && existsSync(configured)) return configured;
  const macPostgres = `/Library/PostgreSQL/18/bin/${name}`;
  return existsSync(macPostgres) ? macPostgres : name;
};

const binaries = {
  psql: resolveBinary('psql'),
  pgDump: resolveBinary('pg_dump'),
  pgRestore: resolveBinary('pg_restore'),
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.status !== 0) {
    const safeCommand = command.split('/').pop();
    throw new Error(`${safeCommand} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const sourceUrl = process.env.MIGRATION_SOURCE_URL || process.env.DATABASE_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required');
if (mode === 'upgrade' && !process.env.MIGRATION_SOURCE_URL) {
  throw new Error('MIGRATION_SOURCE_URL is required for upgrade rehearsal so the source is always explicit and read-only');
}

const source = new URL(sourceUrl);
const admin = process.env.ADMIN_DATABASE_URL ? new URL(process.env.ADMIN_DATABASE_URL) : new URL(source);
if (!process.env.ADMIN_DATABASE_URL) admin.pathname = '/postgres';
const databaseName = `hangers_migration_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const target = new URL(source);
target.pathname = `/${databaseName}`;
target.search = '';
const dumpPath = join(tmpdir(), `${databaseName}.dump`);

const psql = (url, sql) => run(binaries.psql, [url.toString(), '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]);

const buildSourceSnapshotSql = ({ hasPaymentKind, hasInvoices }) => `
  SELECT json_build_object(
    'customers', (SELECT count(*) FROM customers),
    'orders', (SELECT count(*) FROM "Order"),
    'order_total', (SELECT COALESCE(sum("totalAmount"), 0) FROM "Order"),
    'payments', (
      SELECT count(*) FROM "Payment"
    ) ${hasInvoices ? '' : `+ (SELECT count(*) FROM "iron_bills" WHERE "paidAmount" > 0)`},
    'payment_net', (
      SELECT COALESCE(sum(${hasPaymentKind ? `CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END` : 'amount'}), 0)
      FROM "Payment" WHERE status IN ('CAPTURED', 'SUCCESS', 'PAID')
    ) ${hasInvoices ? '' : `+ (SELECT COALESCE(sum("paidAmount"), 0) FROM "iron_bills")`},
    'invoice_count', ${hasInvoices
      ? `(SELECT count(*) FROM "invoices")`
      : `(
          (SELECT count(*) FROM "Order"
           WHERE "documentType" = 'ORDER'
             AND NOT ("isReturn" = true OR "totalAmount" < 0 OR "orderNumber" ~ '-RT-[0-9]+$'))
          + (SELECT count(*) FROM "iron_bills")
        )`},
    'invoice_total', ${hasInvoices
      ? `(SELECT COALESCE(sum("totalAmount"), 0) FROM "invoices")`
      : `(
          (SELECT COALESCE(sum("totalAmount"), 0) FROM "Order"
           WHERE "documentType" = 'ORDER'
             AND NOT ("isReturn" = true OR "totalAmount" < 0 OR "orderNumber" ~ '-RT-[0-9]+$'))
          + (SELECT COALESCE(sum("totalAmount"), 0) FROM "iron_bills")
        )`},
    'wallet_balance', (SELECT COALESCE(sum("walletBalance"), 0) FROM customers),
    'order_items', (SELECT count(*) FROM "OrderItem")
  )::text;
`;

const targetSnapshotSql = `
  SELECT json_build_object(
    'customers', (SELECT count(*) FROM customers),
    'orders', (SELECT count(*) FROM "Order"),
    'order_total', (SELECT COALESCE(sum("totalAmount"), 0) FROM "Order"),
    'payments', (SELECT count(*) FROM "Payment"),
    'payment_net', (
      SELECT COALESCE(sum(CASE WHEN kind = 'REFUND' THEN -amount ELSE amount END), 0)
      FROM "Payment" WHERE status IN ('CAPTURED', 'SUCCESS', 'PAID')
    ),
    'invoice_count', (SELECT count(*) FROM "invoices"),
    'invoice_total', (SELECT COALESCE(sum("totalAmount"), 0) FROM "invoices"),
    'wallet_balance', (SELECT COALESCE(sum("walletBalance"), 0) FROM customers),
    'order_items', (SELECT count(*) FROM "OrderItem")
  )::text;
`;

const assertSchemaParity = () => {
  const diff = run('npx', [
    'prisma', 'migrate', 'diff',
    '--from-url', target.toString(),
    '--to-schema-datamodel', 'prisma/schema.prisma',
    '--script',
  ]);
  if (!/empty migration/i.test(diff)) throw new Error(`Migrated database does not match Prisma schema:\n${diff}`);
};

const baselineKnownParityMigration = () => {
  const migration = '20260713170000_schema_parity_catchup';
  const state = psql(target, `
    SELECT
      to_regclass('public.audit_logs') IS NOT NULL
      AND to_regclass('public.iron_bills') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '${migration}' AND finished_at IS NOT NULL);
  `);
  if (state === 't') {
    run('npx', ['prisma', 'migrate', 'resolve', '--applied', migration], { env: { DATABASE_URL: target.toString() } });
  }
};

const verifyFresh = () => {
  run('npx', ['prisma', 'migrate', 'deploy'], { env: { DATABASE_URL: target.toString() } });
  assertSchemaParity();
  const required = Number(psql(target, `
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'Order_nonnegative_money_check',
      'Payment_amount_positive_check',
      'wallet_transactions_balance_check',
      'invoices_amounts_check',
      'invoice_lines_values_check',
      'expenses_status_check'
    );
  `));
  if (required !== 6) throw new Error(`Expected six critical database constraints, found ${required}`);
};

const verifyUpgrade = () => {
  const hasPaymentKind = psql(source, `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'kind'
    );
  `) === 't';
  const hasInvoices = psql(source, `SELECT to_regclass('public.invoices') IS NOT NULL;`) === 't';
  const before = JSON.parse(psql(source, buildSourceSnapshotSql({ hasPaymentKind, hasInvoices })));
  run(binaries.pgDump, [source.toString(), '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath]);
  run(binaries.pgRestore, ['--dbname', target.toString(), '--no-owner', '--no-acl', dumpPath]);
  baselineKnownParityMigration();
  run('npx', ['prisma', 'migrate', 'deploy'], { env: { DATABASE_URL: target.toString() } });
  const after = JSON.parse(psql(target, targetSnapshotSql));

  for (const key of Object.keys(before)) {
    if (Number(before[key]) !== Number(after[key])) {
      throw new Error(`Upgrade reconciliation changed ${key}: ${before[key]} -> ${after[key]}`);
    }
  }

  const facts = psql(target, `
    SELECT json_build_object(
      'allocation_cache_variance', abs(
        (SELECT COALESCE(sum(amount), 0) FROM payment_allocations WHERE status = 'POSTED' AND "orderId" IS NOT NULL)
        - (SELECT COALESCE(sum(refund.amount), 0)
           FROM refund_allocations AS refund
           JOIN invoices AS invoice ON invoice.id = refund."invoiceId"
           WHERE refund.status = 'POSTED' AND invoice."orderId" IS NOT NULL)
        - (SELECT COALESCE(sum("paidAmount"), 0) FROM "Order" WHERE "documentType" = 'ORDER')
      ),
      'payments_without_customer', (SELECT count(*) FROM "Payment" WHERE "customerId" IS NULL),
      'wallet_cache_variance', abs(
        (SELECT COALESCE(sum("walletBalance"), 0) FROM customers)
        - (SELECT COALESCE(sum(CASE WHEN type = 'CREDIT' THEN amount WHEN type = 'DEBIT' THEN -amount ELSE 0 END), 0) FROM wallet_transactions)
      ),
      'invalid_normal_orders', (
        SELECT count(*) FROM "Order"
        WHERE "isReturn" = false AND ("totalAmount" < 0 OR "paidAmount" + "writeOffAmount" > "totalAmount")
      ),
      'allocations_without_invoice', (SELECT count(*) FROM payment_allocations WHERE "invoiceId" IS NULL),
      'commercial_sources_without_invoice', (
        (SELECT count(*) FROM "Order" AS orders
         WHERE orders."documentType" = 'ORDER' AND orders."isReturn" = false
           AND NOT EXISTS (SELECT 1 FROM invoices WHERE invoices."orderId" = orders.id))
        +
        (SELECT count(*) FROM iron_bills AS bill
         WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE invoices."ironBillId" = bill.id))
      ),
      'invoice_balance_variance', (
        SELECT COALESCE(sum(abs(invoice."paidAmount" - COALESCE(allocated.amount, 0) + COALESCE(refunded.amount, 0))), 0)
        FROM invoices AS invoice
        LEFT JOIN (
          SELECT allocation."invoiceId", sum(allocation.amount) AS amount
          FROM payment_allocations AS allocation
          JOIN "Payment" AS payment ON payment.id = allocation."paymentId"
          WHERE allocation.status = 'POSTED'
            AND payment.kind = 'RECEIPT'
            AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
          GROUP BY allocation."invoiceId"
        ) AS allocated ON allocated."invoiceId" = invoice.id
        LEFT JOIN (
          SELECT refund."invoiceId", sum(refund.amount) AS amount
          FROM refund_allocations AS refund
          JOIN "Payment" AS payment ON payment.id = refund."refundPaymentId"
          WHERE refund.status = 'POSTED'
            AND payment.kind = 'REFUND'
            AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
          GROUP BY refund."invoiceId"
        ) AS refunded ON refunded."invoiceId" = invoice.id
      ),
      'receipts_missing', (
        SELECT count(*)
        FROM "Payment" AS payment
        WHERE payment.kind = 'RECEIPT'
          AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
          AND EXISTS (SELECT 1 FROM payment_allocations WHERE "paymentId" = payment.id AND status = 'POSTED')
          AND NOT EXISTS (SELECT 1 FROM receipts WHERE "paymentId" = payment.id)
      ),
      'refund_document_mismatch', (
        SELECT count(*)
        FROM "Payment" AS payment
        WHERE payment.kind = 'REFUND'
          AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
          AND (
            payment."reversalOfId" IS NULL
            OR (
              EXISTS (SELECT 1 FROM payment_allocations WHERE "paymentId" = payment."reversalOfId" AND status = 'POSTED')
              AND (
                NOT EXISTS (SELECT 1 FROM refund_allocations WHERE "refundPaymentId" = payment.id AND status = 'POSTED')
                OR NOT EXISTS (SELECT 1 FROM credit_notes WHERE "refundPaymentId" = payment.id AND status = 'POSTED')
              )
            )
          )
      ),
      'garment_unit_count_variance', abs(
        (SELECT count(*) FROM garment_units WHERE status <> 'VOID')
        - (SELECT COALESCE(sum(item.quantity), 0) FROM "OrderItem" item JOIN "Order" orders ON orders.id = item."orderId" WHERE orders."documentType" = 'ORDER')
      ),
      'challan_custody_variance', (
        SELECT count(*) FROM challan_items item
        WHERE (SELECT count(*) FROM challan_garment_units movement WHERE movement."challanItemId" = item.id) <> item.quantity
           OR (SELECT count(*) FROM challan_garment_units movement WHERE movement."challanItemId" = item.id AND movement.status = 'RECEIVED') <> item."receivedQty"
      ),
      'vendor_payable_variance', (
        SELECT COALESCE(sum(abs(bill."paidAmount" - COALESCE(allocated.amount, 0))), 0)
        FROM vendor_bills bill
        LEFT JOIN (
          SELECT allocation."vendorBillId", sum(allocation.amount) AS amount
          FROM vendor_payment_allocations allocation
          JOIN vendor_payments payment ON payment.id = allocation."vendorPaymentId" AND payment.status = 'CAPTURED'
          GROUP BY allocation."vendorBillId"
        ) allocated ON allocated."vendorBillId" = bill.id
      ),
      'delivery_assignment_cache_mismatch', (
        SELECT count(*) FROM delivery_assignments assignment JOIN "Order" orders ON orders.id = assignment."orderId"
        WHERE assignment.status IN ('ASSIGNED', 'IN_PROGRESS') AND orders."assignedToId" IS DISTINCT FROM assignment."assigneeId"
      )
    )::text;
  `);
  const reconciliation = JSON.parse(facts);
  if (Number(reconciliation.allocation_cache_variance) !== 0) throw new Error('Payment allocation and order cache reconciliation failed');
  if (Number(reconciliation.payments_without_customer) !== 0) throw new Error('Payment customer backfill is incomplete');
  if (Number(reconciliation.wallet_cache_variance) !== 0) throw new Error('Wallet ledger and customer cache reconciliation failed');
  if (Number(reconciliation.invalid_normal_orders) !== 0) throw new Error('Invalid normal-order balances remain after migration');
  if (Number(reconciliation.allocations_without_invoice) !== 0) throw new Error('Payment allocations without invoices remain after migration');
  if (Number(reconciliation.commercial_sources_without_invoice) !== 0) throw new Error('Commercial documents without canonical invoices remain after migration');
  if (Number(reconciliation.invoice_balance_variance) !== 0) throw new Error('Invoice payment cache and allocation ledger reconciliation failed');
  if (Number(reconciliation.receipts_missing) !== 0) throw new Error('Captured allocated payments are missing immutable receipts');
  if (Number(reconciliation.refund_document_mismatch) !== 0) throw new Error('Refund payment, allocation, and credit-note reconciliation failed');
  if (Number(reconciliation.garment_unit_count_variance) !== 0) throw new Error('Garment-unit backfill does not match physical order quantities');
  if (Number(reconciliation.challan_custody_variance) !== 0) throw new Error('Challan garment-unit custody does not match aggregate quantities');
  if (Number(reconciliation.vendor_payable_variance) !== 0) throw new Error('Vendor payable cache and allocation ledger reconciliation failed');
  if (Number(reconciliation.delivery_assignment_cache_mismatch) !== 0) throw new Error('Delivery assignment cache backfill is inconsistent');
  assertSchemaParity();
};

try {
  psql(admin, `CREATE DATABASE "${databaseName}"`);
  if (mode === 'fresh') verifyFresh();
  else verifyUpgrade();
  console.log(`Migration ${mode} verification passed`);
} finally {
  if (existsSync(dumpPath)) unlinkSync(dumpPath);
  try {
    psql(admin, `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } catch (error) {
    console.error(`Temporary database cleanup failed: ${error.message}`);
  }
}
