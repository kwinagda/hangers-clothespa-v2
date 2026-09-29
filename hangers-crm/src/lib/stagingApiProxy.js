const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

const stagingApiOrigin = (value = process.env.CRM_STAGING_API_PROXY_URL) => {
  if (!value) return null;
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('CRM_STAGING_API_PROXY_URL must be a valid loopback URL');
  }
  if (!loopbackHosts.has(target.hostname) || !['http:', 'https:'].includes(target.protocol)
    || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('CRM_STAGING_API_PROXY_URL must be a credential-free loopback origin');
  }
  return target.origin;
};

const proxyStagingApiRequest = async (request, pathSegments) => {
  let origin;
  try {
    origin = stagingApiOrigin();
  } catch {
    return Response.json({ success: false, code: 'STAGING_API_PROXY_CONFIG_INVALID', message: 'Local staging API proxy configuration is invalid.' }, { status: 503 });
  }
  if (!origin) return Response.json({ success: false, code: 'STAGING_API_PROXY_DISABLED', message: 'Local staging API proxy is disabled.' }, { status: 404 });

  const path = Array.isArray(pathSegments) ? pathSegments.map((segment) => encodeURIComponent(segment)).join('/') : '';
  const requestUrl = new URL(request.url);
  const upstreamUrl = `${origin}/api/v1/${path}${requestUrl.search}`;
  const headers = new Headers(request.headers);
  ['accept-encoding', 'connection', 'content-length', 'host', 'origin', 'referer', 'transfer-encoding'].forEach((name) => headers.delete(name));
  const method = request.method.toUpperCase();

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: await request.arrayBuffer() }),
      cache: 'no-store',
      redirect: 'manual',
    });
    const responseHeaders = new Headers(upstream.headers);
    ['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding'].forEach((name) => responseHeaders.delete(name));
    const cookies = upstream.headers.getSetCookie?.() || [];
    responseHeaders.delete('set-cookie');
    cookies.forEach((cookie) => responseHeaders.append('set-cookie', cookie));
    return new Response(method === 'HEAD' || upstream.status === 204 || upstream.status === 304 ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ success: false, code: 'LOCAL_API_UNAVAILABLE', message: 'The CRM could not reach its local API. Check that the API and its database are available.' }, { status: 502 });
  }
};

module.exports = { stagingApiOrigin, proxyStagingApiRequest };
