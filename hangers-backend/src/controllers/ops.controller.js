const prisma = require('../config/database');
const { error } = require('../utils/response');

const getOperationalHealth = async (_req, res) => {
  try {
    const staleBefore = new Date(Date.now() - 90_000);
    const [heartbeats, outboxByStatus, latestReconciliation, staleSessions, staleIdempotency] = await Promise.all([
      prisma.workerHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 20 }),
      prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.reconciliationRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.staffSession.count({ where: { expiresAt: { lt: new Date() } } }),
      prisma.idempotencyRecord.count({ where: { state: 'PROCESSING', lockedUntil: { lt: new Date() } } }),
    ]);
    const activeWorkers = heartbeats.filter((heartbeat) => heartbeat.status === 'RUNNING' && heartbeat.lastSeenAt >= staleBefore);
    const outbox = Object.fromEntries(outboxByStatus.map((entry) => [entry.status, entry._count._all]));
    const healthy = activeWorkers.length > 0
      && Number(outbox.DEAD || 0) === 0
      && latestReconciliation?.status !== 'ERROR';

    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      message: healthy ? 'Operational control plane is healthy' : 'Operational action is required',
      data: {
        activeWorkers: activeWorkers.length,
        heartbeats,
        outbox,
        latestReconciliation,
        cleanupBacklog: { expiredStaffSessions: staleSessions, staleIdempotencyLocks: staleIdempotency },
      },
    });
  } catch (err) {
    console.error('operational health:', err?.message || err);
    return error(res, 'Failed to load operational health');
  }
};

module.exports = { getOperationalHealth };
