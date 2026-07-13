ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_orderId_fkey";

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_orderId_fkey"
  FOREIGN KEY ("orderId")
  REFERENCES "Order"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
