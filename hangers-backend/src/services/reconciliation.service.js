const prisma = require('../config/database');

const toNumber = (value) => Number(value || 0);

const collectFinancialFacts = async () => {
  const [orderRows, paymentRows, walletRows, adjustmentRows, invoiceRows, sourceRows, integrityRows, vendorRows, operationalRows] = await Promise.all([
    prisma.$queryRaw`
      WITH receipts AS (
        SELECT allocation."orderId", COALESCE(SUM(allocation.amount), 0) AS amount
        FROM payment_allocations AS allocation
        JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
        WHERE allocation.status = 'POSTED' AND payment.kind = 'RECEIPT'
        GROUP BY allocation."orderId"
      ), refunds AS (
        SELECT invoice."orderId", COALESCE(SUM(refund.amount), 0) AS amount
        FROM refund_allocations AS refund
        JOIN invoices AS invoice ON invoice."id" = refund."invoiceId"
        WHERE refund.status = 'POSTED'
        GROUP BY invoice."orderId"
      )
      SELECT orders."id", orders."orderNumber", orders."paidAmount" AS "cachedPaid",
             GREATEST(COALESCE(receipts.amount, 0) - COALESCE(refunds.amount, 0), 0) AS "allocatedPaid",
             orders."writeOffAmount", orders."totalAmount"
      FROM "Order" AS orders
      LEFT JOIN receipts ON receipts."orderId" = orders."id"
      LEFT JOIN refunds ON refunds."orderId" = orders."id"
      WHERE orders."documentType" = 'ORDER'
        AND (
          abs(orders."paidAmount" - GREATEST(COALESCE(receipts.amount, 0) - COALESCE(refunds.amount, 0), 0)) >= 0.01
          OR (orders."isReturn" = false AND orders."paidAmount" + orders."writeOffAmount" > orders."totalAmount")
        )
      ORDER BY orders."orderNumber"
      LIMIT 250
    `,
    prisma.$queryRaw`
      WITH allocated AS (
        SELECT "paymentId", COALESCE(SUM(amount), 0) AS amount
        FROM "payment_allocations"
        WHERE status = 'POSTED'
        GROUP BY "paymentId"
      )
      SELECT payment."id", payment."orderId", payment.kind, payment.amount,
             COALESCE(allocated.amount, 0) AS allocated,
             payment.amount - COALESCE(allocated.amount, 0) AS unapplied
      FROM "Payment" AS payment
      LEFT JOIN allocated ON allocated."paymentId" = payment."id"
      WHERE payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
        AND (
          (payment.kind = 'RECEIPT' AND COALESCE(allocated.amount, 0) <> payment.amount)
          OR (payment.kind <> 'RECEIPT' AND COALESCE(allocated.amount, 0) <> 0)
        )
      ORDER BY payment."createdAt"
      LIMIT 250
    `,
    prisma.$queryRaw`
      WITH ledger AS (
        SELECT "customerId",
               COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount WHEN type = 'DEBIT' THEN -amount ELSE 0 END), 0) AS balance
        FROM "wallet_transactions"
        GROUP BY "customerId"
      )
      SELECT customer."id", customer.phone, customer."walletBalance" AS cached,
             COALESCE(ledger.balance, 0) AS ledger,
             customer."walletBalance" - COALESCE(ledger.balance, 0) AS variance
      FROM "customers" AS customer
      LEFT JOIN ledger ON ledger."customerId" = customer."id"
      WHERE abs(customer."walletBalance" - COALESCE(ledger.balance, 0)) >= 0.01
      ORDER BY abs(customer."walletBalance" - COALESCE(ledger.balance, 0)) DESC
      LIMIT 250
    `,
    prisma.$queryRaw`
      WITH posted AS (
        SELECT "orderId", COALESCE(SUM(amount), 0) AS amount
        FROM "financial_adjustments"
        WHERE kind = 'WRITE_OFF' AND status = 'POSTED'
        GROUP BY "orderId"
      )
      SELECT orders."id", orders."orderNumber", orders."writeOffAmount" AS cached,
             COALESCE(posted.amount, 0) AS ledger,
             orders."writeOffAmount" - COALESCE(posted.amount, 0) AS variance
      FROM "Order" AS orders
      LEFT JOIN posted ON posted."orderId" = orders."id"
      WHERE abs(orders."writeOffAmount" - COALESCE(posted.amount, 0)) >= 0.01
      ORDER BY abs(orders."writeOffAmount" - COALESCE(posted.amount, 0)) DESC
      LIMIT 250
    `,
    prisma.$queryRaw`
      WITH allocated AS (
        SELECT allocation."invoiceId", COALESCE(SUM(allocation.amount), 0) AS amount
        FROM "payment_allocations" AS allocation
        JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
        WHERE allocation.status = 'POSTED'
          AND payment.kind = 'RECEIPT'
          AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
        GROUP BY allocation."invoiceId"
      ), refunded AS (
        SELECT refund."invoiceId", COALESCE(SUM(refund.amount), 0) AS amount
        FROM refund_allocations AS refund
        JOIN "Payment" AS payment ON payment."id" = refund."refundPaymentId"
        WHERE refund.status = 'POSTED'
          AND payment.kind = 'REFUND'
          AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
        GROUP BY refund."invoiceId"
      ), credited AS (
        SELECT "invoiceId", COALESCE(SUM(amount), 0) AS amount
        FROM credit_notes
        WHERE status = 'POSTED'
        GROUP BY "invoiceId"
      ), written_off AS (
        SELECT adjustment."orderId", COALESCE(SUM(adjustment.amount), 0) AS amount
        FROM "financial_adjustments" AS adjustment
        WHERE adjustment.kind = 'WRITE_OFF' AND adjustment.status = 'POSTED'
        GROUP BY adjustment."orderId"
      )
      SELECT invoice."id", invoice."invoiceNumber", invoice."sourceType",
             invoice."totalAmount", invoice."paidAmount" AS "cachedPaid",
             invoice."balanceDue" AS "cachedBalance",
             GREATEST(COALESCE(allocated.amount, 0) - COALESCE(refunded.amount, 0), 0) AS "allocatedPaid",
             COALESCE(credited.amount, 0) AS "postedCredit",
             COALESCE(written_off.amount, 0) AS "writtenOff"
      FROM invoices AS invoice
      LEFT JOIN allocated ON allocated."invoiceId" = invoice."id"
      LEFT JOIN refunded ON refunded."invoiceId" = invoice."id"
      LEFT JOIN credited ON credited."invoiceId" = invoice."id"
      LEFT JOIN written_off ON written_off."orderId" = invoice."orderId"
      WHERE invoice.status <> 'VOID'
        AND (
          abs(invoice."paidAmount" - GREATEST(COALESCE(allocated.amount, 0) - COALESCE(refunded.amount, 0), 0)) >= 0.01
          OR abs(invoice."creditAmount" - COALESCE(credited.amount, 0)) >= 0.01
          OR abs(
            invoice."balanceDue"
            - GREATEST(
              invoice."totalAmount" - COALESCE(credited.amount, 0)
              - GREATEST(COALESCE(allocated.amount, 0) - COALESCE(refunded.amount, 0), 0)
              - COALESCE(written_off.amount, 0), 0
            )
          ) >= 0.01
        )
      ORDER BY invoice."invoiceNumber"
      LIMIT 250
    `,
    prisma.$queryRaw`
      SELECT source_type AS "sourceType", source_id AS "sourceId", source_number AS "sourceNumber"
      FROM (
        SELECT 'ORDER' AS source_type, orders."id" AS source_id, orders."orderNumber" AS source_number
        FROM "Order" AS orders
        WHERE orders."documentType" = 'ORDER' AND orders."isReturn" = false
          AND NOT EXISTS (SELECT 1 FROM invoices WHERE invoices."orderId" = orders."id")
        UNION ALL
        SELECT 'DAILY_IRON', bill."id", bill."billNumber"
        FROM iron_bills AS bill
        WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE invoices."ironBillId" = bill."id")
      ) AS missing_sources
      ORDER BY source_type, source_number
      LIMIT 250
    `,
    prisma.$queryRaw`
      SELECT
        (SELECT count(*) FROM "Payment" WHERE amount <= 0) AS "nonPositivePayments",
        (SELECT count(*) FROM "Order" WHERE "isReturn" = false AND "totalAmount" < 0) AS "negativeNormalOrders",
        (SELECT count(*) FROM "Payment" WHERE "customerId" IS NULL) AS "paymentsWithoutCustomer",
        (SELECT count(*) FROM payment_allocations WHERE "invoiceId" IS NULL) AS "allocationsWithoutInvoice",
        (SELECT count(*) FROM "Payment" AS payment
         WHERE payment.kind = 'RECEIPT' AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
           AND EXISTS (SELECT 1 FROM payment_allocations WHERE "paymentId" = payment."id" AND status = 'POSTED')
           AND NOT EXISTS (SELECT 1 FROM receipts WHERE "paymentId" = payment."id")) AS "receiptsMissing",
        (SELECT count(*) FROM "Payment" AS payment
         WHERE payment.kind = 'REFUND' AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
           AND (payment."reversalOfId" IS NULL OR (
             EXISTS (SELECT 1 FROM payment_allocations WHERE "paymentId" = payment."reversalOfId" AND status = 'POSTED')
             AND (NOT EXISTS (SELECT 1 FROM refund_allocations WHERE "refundPaymentId" = payment."id" AND status = 'POSTED')
               OR NOT EXISTS (SELECT 1 FROM credit_notes WHERE "refundPaymentId" = payment."id" AND status = 'POSTED'))
           ))) AS "refundDocumentExceptions",
        (SELECT count(*) FROM "outbox_events" WHERE status = 'DEAD') AS "deadOutboxEvents",
        (SELECT count(*) FROM "idempotency_records" WHERE state = 'PROCESSING' AND "lockedUntil" < NOW()) AS "staleIdempotencyLocks"
    `,
    prisma.$queryRaw`
      WITH allocated AS (
        SELECT allocation."vendorBillId", COALESCE(SUM(allocation.amount), 0) AS amount
        FROM vendor_payment_allocations allocation
        JOIN vendor_payments payment ON payment.id = allocation."vendorPaymentId"
        WHERE payment.status = 'CAPTURED'
        GROUP BY allocation."vendorBillId"
      )
      SELECT bill.id, bill."billNo", bill."totalAmount", bill."paidAmount" AS cached,
             COALESCE(allocated.amount, 0) AS ledger, bill.status
      FROM vendor_bills bill
      LEFT JOIN allocated ON allocated."vendorBillId" = bill.id
      WHERE abs(bill."paidAmount" - COALESCE(allocated.amount, 0)) >= 0.01
         OR bill."paidAmount" > bill."totalAmount"
         OR (bill.status = 'PAID' AND bill."paidAmount" <> bill."totalAmount")
      ORDER BY bill."billNo" LIMIT 250
    `,
    prisma.$queryRaw`
      SELECT
        (SELECT count(*) FROM (
          SELECT item.id
          FROM "OrderItem" item JOIN "Order" orders ON orders.id = item."orderId" AND orders."documentType" = 'ORDER'
          LEFT JOIN garment_units unit ON unit."orderItemId" = item.id AND unit.status <> 'VOID'
          GROUP BY item.id, item.quantity HAVING count(unit.id) <> item.quantity
        ) mismatch) AS "garmentQuantityExceptions",
        (SELECT count(*) FROM challan_items item
         WHERE (SELECT count(*) FROM challan_garment_units movement WHERE movement."challanItemId" = item.id) <> item.quantity
            OR (SELECT count(*) FROM challan_garment_units movement WHERE movement."challanItemId" = item.id AND movement.status = 'RECEIVED') <> item."receivedQty") AS "challanCustodyExceptions",
        (SELECT count(*) FROM garment_units unit
         WHERE unit.status = 'AT_PLANT'
           AND NOT EXISTS (SELECT 1 FROM challan_garment_units movement WHERE movement."garmentUnitId" = unit.id AND movement.status = 'DISPATCHED')) AS "orphanPlantCustody",
        (SELECT count(*) FROM plant_quality_issues issue
         WHERE issue.status = 'OPEN' AND issue."garmentUnitId" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM garment_units unit WHERE unit.id = issue."garmentUnitId" AND unit.status = 'ISSUE_HOLD')) AS "qualityIssueStateExceptions",
        (SELECT count(*) FROM delivery_assignments assignment
         JOIN "Order" orders ON orders.id = assignment."orderId"
         WHERE assignment.status IN ('ASSIGNED', 'IN_PROGRESS') AND orders."assignedToId" IS DISTINCT FROM assignment."assigneeId") AS "deliveryAssignmentCacheExceptions"
    `,
  ]);

  const integrity = integrityRows[0] || {};
  const unappliedReceiptRows = paymentRows.filter((row) => row.kind === 'RECEIPT' && toNumber(row.unapplied) > 0);
  const overallocatedRows = paymentRows.filter((row) => toNumber(row.allocated) > toNumber(row.amount));
  const summary = {
    orderBalanceExceptions: orderRows.length,
    overallocatedPayments: overallocatedRows.length,
    unappliedReceiptCount: unappliedReceiptRows.length,
    unappliedReceiptAmount: unappliedReceiptRows.reduce((sum, row) => sum + toNumber(row.unapplied), 0),
    walletExceptions: walletRows.length,
    writeOffExceptions: adjustmentRows.length,
    invoiceBalanceExceptions: invoiceRows.length,
    commercialSourcesWithoutInvoice: sourceRows.length,
    nonPositivePayments: toNumber(integrity.nonPositivePayments),
    negativeNormalOrders: toNumber(integrity.negativeNormalOrders),
    paymentsWithoutCustomer: toNumber(integrity.paymentsWithoutCustomer),
    allocationsWithoutInvoice: toNumber(integrity.allocationsWithoutInvoice),
    receiptsMissing: toNumber(integrity.receiptsMissing),
    refundDocumentExceptions: toNumber(integrity.refundDocumentExceptions),
    deadOutboxEvents: toNumber(integrity.deadOutboxEvents),
    staleIdempotencyLocks: toNumber(integrity.staleIdempotencyLocks),
    vendorPayableExceptions: vendorRows.length,
    garmentQuantityExceptions: toNumber(operationalRows[0]?.garmentQuantityExceptions),
    challanCustodyExceptions: toNumber(operationalRows[0]?.challanCustodyExceptions),
    orphanPlantCustody: toNumber(operationalRows[0]?.orphanPlantCustody),
    qualityIssueStateExceptions: toNumber(operationalRows[0]?.qualityIssueStateExceptions),
    deliveryAssignmentCacheExceptions: toNumber(operationalRows[0]?.deliveryAssignmentCacheExceptions),
  };
  const criticalCount = summary.orderBalanceExceptions
    + summary.overallocatedPayments
    + summary.walletExceptions
    + summary.writeOffExceptions
    + summary.invoiceBalanceExceptions
    + summary.commercialSourcesWithoutInvoice
    + summary.nonPositivePayments
    + summary.negativeNormalOrders
    + summary.paymentsWithoutCustomer
    + summary.allocationsWithoutInvoice
    + summary.receiptsMissing
    + summary.refundDocumentExceptions
    + summary.vendorPayableExceptions
    + summary.garmentQuantityExceptions
    + summary.challanCustodyExceptions
    + summary.orphanPlantCustody
    + summary.qualityIssueStateExceptions
    + summary.deliveryAssignmentCacheExceptions;

  return {
    healthy: criticalCount === 0,
    summary,
    exceptions: {
      orderBalances: orderRows,
      paymentAllocation: paymentRows,
      wallets: walletRows,
      writeOffs: adjustmentRows,
      invoices: invoiceRows,
      sourcesWithoutInvoice: sourceRows,
      vendorPayables: vendorRows,
    },
  };
};

const runFinancialReconciliation = async ({ initiatedBy = null, runType = 'FINANCIAL', scheduleKey = null } = {}) => {
  let run;
  try {
    run = await prisma.reconciliationRun.create({
      data: { runType, status: 'RUNNING', initiatedBy, scheduleKey },
    });
  } catch (error) {
    if (error?.code === 'P2002' && scheduleKey) {
      return prisma.reconciliationRun.findUnique({ where: { scheduleKey } });
    }
    throw error;
  }
  try {
    const result = await collectFinancialFacts();
    return prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: result.healthy ? 'PASSED' : 'FAILED',
        finishedAt: new Date(),
        summary: result.summary,
        exceptions: result.exceptions,
      },
    });
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'ERROR',
        finishedAt: new Date(),
        summary: { error: String(error?.message || error).slice(0, 1000) },
      },
    }).catch(() => {});
    throw error;
  }
};

const runScheduledFinancialReconciliation = () => {
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return runFinancialReconciliation({ scheduleKey: `FINANCIAL:${businessDate}` });
};

module.exports = { collectFinancialFacts, runFinancialReconciliation, runScheduledFinancialReconciliation };
