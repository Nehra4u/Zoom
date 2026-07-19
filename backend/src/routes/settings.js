import { Router } from 'express';
import { authenticate, adminOnly, superAdminOnly } from '../middleware/authenticate.js';
import { getSubscriptionStatusForAdmin } from '../services/adminLicenseService.js';
import {
  getSystemSettings,
  updateRecordingRetentionDays,
  updateSubscriptionEndDate,
} from '../services/settingsService.js';

const router = Router();

router.get('/subscription', authenticate, adminOnly, async (req, res) => {
  try {
    const subscription = await getSubscriptionStatusForAdmin(req.admin.sub);
    res.json({
      endDate: subscription.endDate,
      isActive: subscription.isActive,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.use(authenticate, superAdminOnly);

router.get('/', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({ settings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/recording-retention', async (req, res) => {
  try {
    const { recordingRetentionDays } = req.body ?? {};
    const result = await updateRecordingRetentionDays(recordingRetentionDays, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/subscription', async (req, res) => {
  try {
    const { endDate } = req.body ?? {};
    const subscription = await updateSubscriptionEndDate(endDate ?? null, req.admin);
    res.json({ subscription });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

export default router;
