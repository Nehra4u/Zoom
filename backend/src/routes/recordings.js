import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/authenticate.js';
import { getFreshPlayUrl, getRecordingById, listRecordings } from '../services/recordingService.js';

const router = Router();

router.use(authenticate, adminOnly);

router.get('/', async (req, res) => {
  try {
    const recordings = await listRecordings(req.admin);
    res.json({ recordings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id/play-url', async (req, res) => {
  try {
    const result = await getFreshPlayUrl(req.params.id, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const recording = await getRecordingById(req.params.id, req.admin);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    res.json({ recording });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
