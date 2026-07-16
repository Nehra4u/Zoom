import { Router } from 'express';
import { loginClient, logoutClient, refreshClientToken } from '../services/clientAuthService.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const loginId = req.body.username ?? req.body.email;
    const { password, device } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        status: 'VALIDATION_ERROR',
        message: 'Email or username and password are required.',
      });
    }
    const result = await loginClient(loginId, password, device ?? {});
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    const result = await refreshClientToken(refreshToken);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refreshToken, userId, sessionId, deviceId } = req.body;
    const accessToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    await logoutClient(refreshToken, { userId, sessionId, deviceId, accessToken });
    res.json({ success: true, status: 'SUCCESS', message: 'Logged out successfully.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
