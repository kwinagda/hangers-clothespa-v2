const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const { runFinancialReconciliation } = require('../services/reconciliation.service');
const { log, getRequestMeta } = require('../services/activity.service');

const listRuns = async (_req, res) => {
  try {
    const runs = await prisma.reconciliationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 });
    return success(res, { runs, latest: runs[0] || null });
  } catch {
    return error(res, 'Failed to load reconciliation history');
  }
};

const runNow = async (req, res) => {
  try {
    const run = await runFinancialReconciliation({ initiatedBy: req.staff?.id });
    await log({
      actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
      action: 'FINANCIAL_RECONCILIATION_RUN', resource: 'reconciliation', resourceId: run.id,
      description: `Financial reconciliation completed with status ${run.status}`,
      metadata: { status: run.status, summary: run.summary },
      ...getRequestMeta(req),
    });
    return success(res, { run }, `Reconciliation ${run.status.toLowerCase()}`);
  } catch (err) {
    console.error('run reconciliation:', err?.message || err);
    return error(res, 'Financial reconciliation failed to execute');
  }
};

module.exports = { listRuns, runNow };
