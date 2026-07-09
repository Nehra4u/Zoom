function parseOrigins(value) {
  return String(value || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const configuredOrigins = parseOrigins(process.env.ADMIN_PORTAL_URL);

/** Always allow local Vite during development against a remote API. */
const localDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (configuredOrigins.includes('*')) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (localDevOrigins.includes(origin)) return true;
  // Vercel production + preview deployments
  if (/\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function corsOriginDelegate(origin, callback) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS blocked for origin: ${origin}`));
}

export function getSocketCorsOrigin() {
  return (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  };
}
