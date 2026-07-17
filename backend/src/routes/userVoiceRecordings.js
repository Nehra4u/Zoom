import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { authenticate, adminOnly, regularAdminOnly, authenticateClient } from '../middleware/authenticate.js';
import {
  getUserVoiceRecordingPlayUrl,
  listUserVoiceRecordings,
  uploadUserVoiceRecording,
} from '../services/userVoiceRecordingService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.client?.sub ?? req.ip,
  message: { error: 'Too many uploads. Please try again later.' },
});

router.post('/', authenticateClient, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    const result = await uploadUserVoiceRecording(req.client, req.file, req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/', authenticate, adminOnly, regularAdminOnly, async (req, res) => {
  try {
    const result = await listUserVoiceRecordings(req.admin, {
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      userId: req.query.userId,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id/play-url', authenticate, adminOnly, regularAdminOnly, async (req, res) => {
  try {
    const result = await getUserVoiceRecordingPlayUrl(req.params.id, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
