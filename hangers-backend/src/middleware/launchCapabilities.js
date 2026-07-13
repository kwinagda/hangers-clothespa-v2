const { error } = require('../utils/response');
const { getLaunchCapability } = require('../services/masterData.service');

const requireLaunchCapability = (feature, action) => async (_req, res, next) => {
  try {
    const capability = await getLaunchCapability(feature, action);
    if (capability.enabled) return next();
    return error(res, `${capability.label} is disabled: ${capability.reason}`, 503, {
      feature,
      action,
      reason: capability.reason,
    });
  } catch (err) {
    return error(res, 'Failed to verify launch capability', 500);
  }
};

module.exports = { requireLaunchCapability };
