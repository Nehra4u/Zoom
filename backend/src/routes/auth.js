import { Router } from 'express';
import {
  loginAdmin,
  logoutAdmin,
  refreshAdminToken,
  getCurrentAdminProfile,
  updateCurrentAdminProfile,
  changeCurrentAdminPassword,
} from '../services/authService.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await loginAdmin(email, password);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    const result = await refreshAdminToken(refreshToken);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const admin = await getCurrentAdminProfile(req.admin.sub);
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/me', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body ?? {};
    const admin = await updateCurrentAdminProfile(req.admin.sub, { name, email });
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    await changeCurrentAdminPassword(req.admin.sub, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    await logoutAdmin(req.body.refreshToken, accessToken);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
