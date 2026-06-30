import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/authenticate.js';
import {
  getCurrentSession,
  handleParticipantJoined,
  handleParticipantLeft,
  handleParticipantMuted,
  handleSessionEnded,
} from '../services/sessionService.js';
import { startMeeting, endMeeting, removeParticipantFromCall } from '../services/meetingService.js';

const router = Router();

router.use(authenticate, adminOnly);

router.get('/current', async (_req, res) => {
  try {
    const session = await getCurrentSession();
    res.json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const meeting = await startMeeting(req.admin);
    res.status(201).json({ meeting });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/end', async (req, res) => {
  try {
    const meeting = await endMeeting(req.admin);
    res.json({ meeting });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/participants/:userId/remove', async (req, res) => {
  try {
    const result = await removeParticipantFromCall(req.params.userId, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/simulate', async (req, res) => {
    try {
      const { event, userId, zoomParticipantId, displayName, meetingId, muted } = req.body;
      if (!event || !userId) {
        return res.status(400).json({ error: 'event and userId are required' });
      }

      let result = null;
      switch (event) {
        case 'joined':
          result = await handleParticipantJoined({
            userId,
            zoomParticipantId: zoomParticipantId ?? `sim-${userId}`,
            displayName,
            meetingId: meetingId ?? 'sim-meeting',
          });
          break;
        case 'left':
          result = await handleParticipantLeft({ userId, zoomParticipantId });
          break;
        case 'muted':
          result = await handleParticipantMuted({ userId, zoomParticipantId, muted: true });
          break;
        case 'unmuted':
          result = await handleParticipantMuted({ userId, zoomParticipantId, muted: false });
          break;
        case 'ended':
          await handleSessionEnded(meetingId);
          result = { ok: true };
          break;
        default:
          return res.status(400).json({ error: 'Unknown event type' });
      }

      res.json({ ok: true, result });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}

export default router;
