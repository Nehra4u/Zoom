function parseOrigins(value) {
  return String(value || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const configuredOrigins = parseOrigins(process.env.ADMIN_PORTAL_URL);

function normalizeOrigin(origin) {
  return origin.replace(/\/$/, '');
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (configuredOrigins.includes('*')) return true;
  if (configuredOrigins.includes(normalized)) return true;
  // Local dev (any port) against a remote API
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  // Vercel production + preview deployments
  if (/\.vercel\.app$/.test(normalized)) return true;
  // AWS admin CloudFront distribution URL (before custom domain is wired)
  if (/\.cloudfront\.net$/.test(normalized)) return true;
  // All meetverdure.com subdomains (admin, api, etc.)
  if (/^https:\/\/([a-z0-9-]+\.)*meetverdure\.com$/.test(normalized)) return true;
  return false;
}

export function corsOriginDelegate(origin, callback) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

export function getSocketCorsOrigin() {
  return (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}
