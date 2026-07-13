const PRODUCTION = 'production';

const parseOriginList = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isProduction = () => process.env.NODE_ENV === PRODUCTION;

const getAllowedOrigins = () => {
  const configured = [
    ...parseOriginList(process.env.ALLOWED_ORIGINS),
    process.env.CRM_URL,
    process.env.CUSTOMER_APP_URL,
    process.env.STAFF_APP_URL,
  ].filter(Boolean);

  if (isProduction()) {
    return [...new Set(configured)];
  }

  return [...new Set([
    ...configured,
    process.env.CRM_URL || 'http://localhost:5002',
    process.env.CUSTOMER_APP_URL || 'http://localhost:8081',
    process.env.STAFF_APP_URL || 'http://localhost:8082',
    'http://localhost:19006',
    'http://localhost:19000',
    'http://127.0.0.1:5002',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'http://127.0.0.1:19000',
    'http://127.0.0.1:19006',
  ])];
};

const validateUrl = (name, value, { requireHttps = false } = {}) => {
  try {
    const url = new URL(value);
    if (requireHttps && url.protocol !== 'https:') {
      return `${name} must use https:// in production`;
    }
    return null;
  } catch {
    return `${name} must be a valid URL`;
  }
};

const validateEnvironment = () => {
  const errors = [];
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production');
  }

  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET is required and must be at least 32 characters');
  }

  const origins = getAllowedOrigins();
  if (isProduction()) {
    if (!origins.length) errors.push('ALLOWED_ORIGINS or CRM_URL is required in production');
    for (const origin of origins) {
      const error = validateUrl('Allowed origin', origin, { requireHttps: true });
      if (error) errors.push(error);
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\./.test(origin)) {
        errors.push('Production allowed origins cannot include localhost or LAN addresses');
      }
    }
    if (process.env.DEV_MODE === 'true') errors.push('DEV_MODE cannot be true in production');
    if (!process.env.REDIS_URL) errors.push('REDIS_URL is required in production so background jobs do not silently run inline');
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return {
    nodeEnv,
    isProduction: isProduction(),
    allowedOrigins: origins,
  };
};

module.exports = {
  getAllowedOrigins,
  isProduction,
  parseOriginList,
  validateEnvironment,
};

