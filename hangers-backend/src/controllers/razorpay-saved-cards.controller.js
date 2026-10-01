const { z } = require('zod');
const { success } = require('../utils/response');
const { customerAuth } = require('../middleware/auth');
const savedCards = require('../services/razorpay-saved-cards.service');

const mode = z.enum(['TEST', 'LIVE']);
const keyId = z.string().max(100).regex(/^rzp_(test|live)_[A-Za-z0-9]+$/);
const empty = z.object({}).strict();
const consent = z.object({
  mode,
  keyId,
  granted: z.boolean(),
  wordingVersion: z.string().min(1).max(80),
  requestId: z.string().uuid(),
}).strict();
const preparation = z.object({ mode, keyId, consentId: z.string().uuid() }).strict();
const selection = z.object({ mode, keyId, selector: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

const handle = (schema, operation, requireAvailable = true) => async (req, res) => {
  // Strict allowlists: no customer IDs, invoice links, provider tokens, card
  // credentials or free-form diagnostics are accepted, retained or echoed.
  const parsed = schema.safeParse(req.body === undefined ? {} : req.body);
  if (!parsed.success || Object.keys(req.query || {}).length) {
    return res.status(400).json({ success: false, code: 'SAVED_CARD_INPUT_INVALID', message: 'Invalid saved-card request.' });
  }
  try {
    const payerId = req.customer.id;
    const data = await operation(req.customer, parsed.data);
    // Provider operations can outlive a logout or session revocation. Reuse the
    // existing authentication policy before releasing any protected response.
    return await customerAuth(req, res, () => {
      if (req.customer.id !== payerId) {
        return res.status(401).json({ success: false, message: 'Customer session changed. Sign in again.' });
      }
      const current = savedCards.getConfiguration();
      if (data.mode !== current.mode || data.keyId !== current.keyId) {
        return res.status(409).json({ success: false, code: 'SAVED_CARD_KEY_CHANGED', message: 'Payment configuration changed. Reload checkout.' });
      }
      if (requireAvailable && !current.available) {
        return res.status(503).json({ success: false, code: 'SAVED_CARDS_UNAVAILABLE', message: 'Saved cards are not enabled for this payment configuration.' });
      }
      const expiry = Number(req.tokenData?.exp) * 1000;
      if (!Number.isFinite(expiry) || expiry <= Date.now()) {
        return res.status(401).json({ success: false, message: 'Customer session expired. Sign in again.' });
      }
      return success(res, {
        ...data,
        payerId,
        sessionExpiresAt: new Date(expiry),
        ...(data.expiresAt ? { expiresAt: new Date(Math.min(new Date(data.expiresAt).getTime(), expiry)) } : {}),
      });
    });
  } catch (error) {
    if (error instanceof savedCards.SavedCardError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    // Do not forward SDK/Prisma exceptions to the general error logger or send
    // their messages, causes, metadata, request objects or stacks to clients.
    return res.status(503).json({ success: false, code: 'SAVED_CARDS_UNAVAILABLE', message: 'Saved cards are temporarily unavailable.' });
  }
};

module.exports = {
  getConfiguration: handle(empty, () => savedCards.getConfiguration(), false),
  listSavedCards: handle(empty, savedCards.listSavedCards),
  recordConsent: handle(consent, savedCards.recordConsent),
  prepareNewCard: handle(preparation, savedCards.prepareNewCard),
  selectSavedCard: handle(selection, savedCards.selectSavedCard),
  deleteSavedCard: handle(selection, savedCards.deleteSavedCard),
};
