import { Router } from 'express';
import { verifyZoomWebhook } from '../middleware/verifyZoomWebhook.js';
import {
  buildValidationResponse,
  handleZoomWebhookEvent,
  parseBody,
} from '../webhooks/zoom.js';

const router = Router();

router.post('/', verifyZoomWebhook, async (req, res) => {
  try {
    const body = parseBody(req);

    if (body.event === 'endpoint.url_validation') {
      const plainToken = body.payload?.plainToken;
      return res.json(buildValidationResponse(plainToken));
    }

    res.status(200).json({ ok: true });

    handleZoomWebhookEvent(body).catch((err) => {
      console.error('[webhook] Processing error:', err);
    });
  } catch (err) {
    console.error('[webhook] Error:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
