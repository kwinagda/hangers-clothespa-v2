ALTER TABLE "bank_settlement_matches"
  ADD CONSTRAINT "bank_settlement_matches_status_check" CHECK ("status" IN ('MATCHED', 'REVERSED')),
  ADD CONSTRAINT "bank_settlement_matches_type_check" CHECK ("matchType" IN ('EXACT_UTR_AMOUNT_REPORT', 'MANUAL_REVIEW')),
  ADD CONSTRAINT "bank_settlement_matches_currency_check" CHECK ("currency" = 'INR'),
  ADD CONSTRAINT "bank_settlement_matches_amounts_check" CHECK ("statementAmountPaise" > 0 AND "settlementAmountPaise" > 0 AND "reportNetPaise" > 0);
