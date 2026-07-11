import { Router } from 'express';
import { authenticate, adminOnly, regularAdminOnly } from '../middleware/authenticate.js';
import {
  deleteRecording,
  getFreshPlayUrl,
  getRecordingById,
  listRecordings,
  streamRecordingDownload,
  syncRecordingsFromZoom,
} from '../services/recordingService.js';

const router = Router();

router.use(authenticate, adminOnly, regularAdminOnly);

router.get('/', async (req, res) => {
  try {
    const result = await listRecordings(req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const result = await syncRecordingsFromZoom(req.admin);
    const listed = await listRecordings(req.admin);
    res.json({ ...result, ...listed });
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

router.get('/:id/download', async (req, res) => {
  try {
    await streamRecordingDownload(req.params.id, req.admin, res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteRecording(req.params.id, req.admin);
    res.json({ ok: true });
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
