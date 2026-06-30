import { Router } from 'express';
import { authenticateClient } from '../middleware/authenticate.js';
import { getHomeData } from '../services/homeService.js';

const router = Router();

router.post('/home', authenticateClient, async (req, res) => {
  try {
    const userId = req.client.sub;
    const deviceId = req.body.deviceId ?? req.headers['x-device-id'] ?? null;
    const result = await getHomeData(userId, deviceId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

export default router;
