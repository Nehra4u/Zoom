import { Router } from 'express';
import { authenticate, adminOnly, regularAdminOnly } from '../middleware/authenticate.js';
import {
  getCurrentSession,
  handleParticipantJoined,
  handleParticipantLeft,
  handleParticipantMuted,
  handleSessionEnded,
} from '../services/sessionService.js';
import {
  startMeeting,
  endMeeting,
  removeParticipantFromCall,
  getMeetingJoinInfo,
  issueAdminJoinToken,
  setParticipantMuted,
} from '../services/meetingService.js';

const router = Router();

router.use(authenticate, adminOnly, regularAdminOnly);

router.get('/current', async (req, res) => {
  try {
    const session = await getCurrentSession(req.admin);
    res.json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/join-url', async (req, res) => {
  try {
    const joinInfo = await getMeetingJoinInfo(req.admin);
    res.json(joinInfo);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/join-token', async (req, res) => {
  try {
    const credentials = await issueAdminJoinToken(req.admin);
    res.json(credentials);
  } catch (err) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    res.status(err.status || 500).json(body);
  }
});

router.post('/start', async (req, res) => {
  try {
    const meeting = await startMeeting(req.admin);
    res.status(201).json({ meeting });
  } catch (err) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    if (err.meeting) body.meeting = err.meeting;
    res.status(err.status || 500).json(body);
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

router.post('/participants/:userId/mute', async (req, res) => {
  try {
    const result = await setParticipantMuted(req.params.userId, true, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/participants/:userId/unmute', async (req, res) => {
  try {
    const result = await setParticipantMuted(req.params.userId, false, req.admin);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/end-all-live', async (_req, res) => {
    try {
      const { ActiveMeeting } = await import('../models/ActiveMeeting.js');
      const { endMeeting: endZoomMeeting, isMockMode } = await import('../services/zoomApi.js');
      const { handleSessionEnded } = await import('../services/sessionService.js');
      const liveMeetings = await ActiveMeeting.find({ status: 'live' });
      for (const meeting of liveMeetings) {
        if (!isMockMode()) {
          try {
            await endZoomMeeting(meeting.zoomMeetingUuid || meeting.meetingNumber);
          } catch {
            // ignore stale Zoom meetings during test cleanup
          }
        }
        meeting.status = 'ended';
        meeting.endedAt = new Date();
        await meeting.save();
        await handleSessionEnded(meeting.meetingNumber);
      }
      res.json({ ok: true, ended: liveMeetings.length });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

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
