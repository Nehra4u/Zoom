import { Router } from 'express';
import { authenticate, superAdminOnly } from '../middleware/authenticate.js';
import { getSystemSettings, updateRecordingRetentionDays } from '../services/settingsService.js';

const router = Router();

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

export default router;
