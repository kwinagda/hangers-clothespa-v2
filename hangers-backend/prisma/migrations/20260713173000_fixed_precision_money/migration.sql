-- Capture aggregate values before conversion. The post-conversion guard below
-- allows only the mathematically unavoidable half-unit rounding per row.
CREATE TEMP TABLE "_money_precision_reconciliation" (
  "metric" TEXT PRIMARY KEY,
  "beforeValue" DECIMAL,
  "rowCount" BIGINT,
  "scale" INTEGER
) ON COMMIT DROP;

DO $$
DECLARE
  target RECORD;
  aggregate_value DECIMAL;
  populated_rows BIGINT;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('Order', 'subtotal', 2), ('Order', 'discount', 2),
      ('Order', 'totalAmount', 2), ('Order', 'paidAmount', 2),
      ('Order', 'couponDiscount', 2), ('Order', 'upcharge', 2),
      ('Order', 'writeOffAmount', 2), ('OrderItem', 'unitPrice', 2),
      ('OrderItem', 'subtotal', 2), ('OrderItem', 'baseUnitPrice', 2),
      ('OrderItem', 'lineDiscountValue', 4), ('OrderItem', 'lineDiscountAmount', 2),
      ('Payment', 'amount', 2), ('Service', 'basePrice', 2),
      ('cash_book', 'amount', 2), ('challan_items', 'customerPrice', 2),
      ('challan_items', 'vendorCost', 2), ('coupons', 'value', 4),
      ('coupons', 'minOrderValue', 2), ('coupons', 'maxDiscount', 2),
      ('customers', 'ordersDue', 2), ('customers', 'walletBalance', 2),
      ('customers', 'ironRateOverride', 2), ('delivery_challans', 'customerValue', 2),
      ('delivery_challans', 'vendorCost', 2), ('expenses', 'amount', 2),
      ('iron_bills', 'totalAmount', 2), ('iron_bills', 'paidAmount', 2),
      ('iron_logs', 'ratePerPiece', 2), ('iron_logs', 'amount', 2),
      ('loyalty_rules', 'earnPerRupee', 4), ('loyalty_rules', 'redeemPerPoint', 4),
      ('referrals', 'creditAwarded', 2), ('referrals', 'rewardPercent', 4),
      ('upcharges', 'value', 4), ('vendor_bills', 'totalAmount', 2),
      ('vendor_price_list', 'costPrice', 2), ('wallet_transactions', 'amount', 2)
    ) AS columns_to_convert(table_name, column_name, decimal_scale)
  LOOP
    EXECUTE format(
      'SELECT COALESCE(SUM(%1$I::numeric), 0), COUNT(%1$I) FROM %2$I',
      target.column_name,
      target.table_name
    ) INTO aggregate_value, populated_rows;

    INSERT INTO "_money_precision_reconciliation" ("metric", "beforeValue", "rowCount", "scale")
    VALUES (target.table_name || '.' || target.column_name, aggregate_value, populated_rows, target.decimal_scale);
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "subtotal" TYPE DECIMAL(18,2) USING ROUND("subtotal"::numeric, 2),
ALTER COLUMN "discount" TYPE DECIMAL(18,2) USING ROUND("discount"::numeric, 2),
ALTER COLUMN "totalAmount" TYPE DECIMAL(18,2) USING ROUND("totalAmount"::numeric, 2),
ALTER COLUMN "paidAmount" TYPE DECIMAL(18,2) USING ROUND("paidAmount"::numeric, 2),
ALTER COLUMN "couponDiscount" TYPE DECIMAL(18,2) USING ROUND("couponDiscount"::numeric, 2),
ALTER COLUMN "upcharge" TYPE DECIMAL(18,2) USING ROUND("upcharge"::numeric, 2),
ALTER COLUMN "writeOffAmount" TYPE DECIMAL(18,2) USING ROUND("writeOffAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,2) USING ROUND("unitPrice"::numeric, 2),
ALTER COLUMN "subtotal" TYPE DECIMAL(18,2) USING ROUND("subtotal"::numeric, 2),
ALTER COLUMN "baseUnitPrice" TYPE DECIMAL(18,2) USING ROUND("baseUnitPrice"::numeric, 2),
ALTER COLUMN "lineDiscountValue" TYPE DECIMAL(18,4) USING ROUND("lineDiscountValue"::numeric, 4),
ALTER COLUMN "lineDiscountAmount" TYPE DECIMAL(18,2) USING ROUND("lineDiscountAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "basePrice" TYPE DECIMAL(18,2) USING ROUND("basePrice"::numeric, 2);

-- AlterTable
ALTER TABLE "cash_book" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "challan_items" ALTER COLUMN "customerPrice" TYPE DECIMAL(18,2) USING ROUND("customerPrice"::numeric, 2),
ALTER COLUMN "vendorCost" TYPE DECIMAL(18,2) USING ROUND("vendorCost"::numeric, 2);

-- AlterTable
ALTER TABLE "coupons" ALTER COLUMN "value" TYPE DECIMAL(18,4) USING ROUND("value"::numeric, 4),
ALTER COLUMN "minOrderValue" TYPE DECIMAL(18,2) USING ROUND("minOrderValue"::numeric, 2),
ALTER COLUMN "maxDiscount" TYPE DECIMAL(18,2) USING ROUND("maxDiscount"::numeric, 2);

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "ordersDue" TYPE DECIMAL(18,2) USING ROUND("ordersDue"::numeric, 2),
ALTER COLUMN "walletBalance" TYPE DECIMAL(18,2) USING ROUND("walletBalance"::numeric, 2),
ALTER COLUMN "ironRateOverride" TYPE DECIMAL(18,2) USING ROUND("ironRateOverride"::numeric, 2);

-- AlterTable
ALTER TABLE "delivery_challans" ALTER COLUMN "customerValue" TYPE DECIMAL(18,2) USING ROUND("customerValue"::numeric, 2),
ALTER COLUMN "vendorCost" TYPE DECIMAL(18,2) USING ROUND("vendorCost"::numeric, 2);

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "iron_bills" ALTER COLUMN "totalAmount" TYPE DECIMAL(18,2) USING ROUND("totalAmount"::numeric, 2),
ALTER COLUMN "paidAmount" TYPE DECIMAL(18,2) USING ROUND("paidAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "iron_logs" ALTER COLUMN "ratePerPiece" TYPE DECIMAL(18,2) USING ROUND("ratePerPiece"::numeric, 2),
ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "loyalty_rules" ALTER COLUMN "earnPerRupee" TYPE DECIMAL(18,4) USING ROUND("earnPerRupee"::numeric, 4),
ALTER COLUMN "redeemPerPoint" TYPE DECIMAL(18,4) USING ROUND("redeemPerPoint"::numeric, 4);

-- AlterTable
ALTER TABLE "referrals" ALTER COLUMN "creditAwarded" TYPE DECIMAL(18,2) USING ROUND("creditAwarded"::numeric, 2),
ALTER COLUMN "rewardPercent" TYPE DECIMAL(9,4) USING ROUND("rewardPercent"::numeric, 4);

-- AlterTable
ALTER TABLE "upcharges" ALTER COLUMN "value" TYPE DECIMAL(18,4) USING ROUND("value"::numeric, 4);

-- AlterTable
ALTER TABLE "vendor_bills" ALTER COLUMN "totalAmount" TYPE DECIMAL(18,2) USING ROUND("totalAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "vendor_price_list" ALTER COLUMN "costPrice" TYPE DECIMAL(18,2) USING ROUND("costPrice"::numeric, 2);

-- AlterTable
ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

DO $$
DECLARE
  snapshot RECORD;
  table_name TEXT;
  column_name TEXT;
  aggregate_value DECIMAL;
  allowed_delta DECIMAL;
BEGIN
  FOR snapshot IN SELECT * FROM "_money_precision_reconciliation"
  LOOP
    table_name := split_part(snapshot."metric", '.', 1);
    column_name := split_part(snapshot."metric", '.', 2);
    EXECUTE format('SELECT COALESCE(SUM(%1$I), 0) FROM %2$I', column_name, table_name)
      INTO aggregate_value;
    allowed_delta := snapshot."rowCount" * (0.5 * power(10::numeric, -snapshot."scale")) + 0.000000001;

    IF abs(aggregate_value - snapshot."beforeValue") > allowed_delta THEN
      RAISE EXCEPTION 'Money precision reconciliation failed for %: before %, after %, allowed delta %',
        snapshot."metric", snapshot."beforeValue", aggregate_value, allowed_delta;
    END IF;
  END LOOP;
END $$;
