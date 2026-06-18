// ─────────────────────────────────────────────────────────────────────────────
// REALTIME ROUTES — Server-Sent Events for live order board updates
//
// GET /api/v1/realtime/orders — SSE stream; requires staff auth
// ─────────────────────────────────────────────────────────────────────────────

const { Router } = require('express');
const { staffAuth } = require('../middleware/auth');
const { subscribeToOrders } = require('../services/sse.service');

const router = Router();

// Staff-authenticated SSE endpoint — CRM subscribes here
router.get('/orders', staffAuth, (req, res) => {
  subscribeToOrders(res);
});

module.exports = router;
