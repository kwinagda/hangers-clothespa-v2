const path = require('path');

const stagingApiProxyUrl = () => {
  const value = process.env.CRM_STAGING_API_PROXY_URL;
  if (!value) return null;
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('CRM_STAGING_API_PROXY_URL must be a valid loopback URL');
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || !['http:', 'https:'].includes(target.protocol)
    || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('CRM_STAGING_API_PROXY_URL must be a credential-free loopback origin');
  }
  return target.origin;
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  async rewrites() {
    const target = stagingApiProxyUrl();
    if (!target) return [];
    return [
      { source: '/__staging_health', destination: `${target}/health` },
      { source: '/__staging_ready', destination: `${target}/ready` },
    ];
  },
};
module.exports = nextConfig
