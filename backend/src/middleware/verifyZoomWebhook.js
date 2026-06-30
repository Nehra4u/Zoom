import crypto from 'crypto';

export function verifyZoomWebhook(req, res, next) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  const timestamp = req.headers['x-zm-request-timestamp'];
  const signature = req.headers['x-zm-signature'];

  if (!timestamp || !signature) {
    return res.status(401).json({ error: 'Missing Zoom signature headers' });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp, 10)) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp too old' });
  }

  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
  const message = `v0:${timestamp}:${rawBody}`;

  const expectedSignature =
    'v0=' + crypto.createHmac('sha256', secret).update(message).digest('hex');

  if (expectedSignature !== signature) {
    return res.status(401).json({ error: 'Invalid Zoom webhook signature' });
  }

  next();
}
