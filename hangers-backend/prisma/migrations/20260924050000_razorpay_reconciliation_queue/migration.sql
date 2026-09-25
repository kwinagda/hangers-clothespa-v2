ALTER TABLE "reconciliation_runs"
  DROP CONSTRAINT "reconciliation_runs_status_check";

ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_status_check"
  CHECK (status IN ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR'));
