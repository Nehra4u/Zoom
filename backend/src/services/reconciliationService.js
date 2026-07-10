import {
  handleParticipantJoined,
  handleParticipantLeft,
} from './sessionService.js';
import { syncMeetingEndIfStale } from './meetingService.js';
import { ActiveMeeting } from '../models/ActiveMeeting.js';
import { SessionState } from '../models/SessionState.js';
import { User } from '../models/User.js';
import { fetchLiveMeetingParticipants, isMockMode } from './zoomApi.js';

let lastRunAt = null;
let lastRunStatus = 'idle';

export function getReconciliationStatus() {
  return { lastRunAt, lastRunStatus };
}

export async function reconcileSessionState() {
  if (isMockMode()) {
    lastRunStatus = 'skipped_mock';
    lastRunAt = new Date();
    return { skipped: true, reason: 'mock_mode' };
  }

  const liveMeetings = await ActiveMeeting.find({ status: 'live' });
  if (!liveMeetings.length) {
    lastRunStatus = 'skipped_no_meeting';
    lastRunAt = new Date();
    return { skipped: true, reason: 'no_live_meeting' };
  }

  try {
    let markedLeft = 0;
    let markedJoined = 0;
    let meetingsEnded = 0;

    for (const meeting of liveMeetings) {
      const meetingId = meeting.zoomMeetingUuid || meeting.meetingNumber;
      const ended = await syncMeetingEndIfStale(meeting);
      if (ended) {
        meetingsEnded += 1;
        continue;
      }

      const { participants: zoomParticipants } = await fetchLiveMeetingParticipants(meetingId);

      const zoomByParticipantId = new Map(
        zoomParticipants.map((p) => [p.user_id ?? p.id, p])
      );

      const inCallSessions = await SessionState.find({
        inCall: true,
        meetingId: meeting.meetingNumber,
      });

      for (const session of inCallSessions) {
        if (session.zoomParticipantId && !zoomByParticipantId.has(session.zoomParticipantId)) {
          await handleParticipantLeft({
            zoomParticipantId: session.zoomParticipantId,
            userId: session.userId,
          });
          markedLeft += 1;
        }
      }

      for (const zp of zoomParticipants) {
        const zoomParticipantId = zp.user_id ?? zp.id;
        const customerKey = zp.customer_key;
        if (!customerKey) continue;

        const existing = await SessionState.findOne({ userId: customerKey, inCall: true });
        if (!existing) {
          const user = await User.findById(customerKey);
          if (user) {
            await handleParticipantJoined({
              userId: customerKey,
              zoomParticipantId,
              displayName: zp.user_name ?? user.name,
              zoomDisplayName: user.zoomDisplayName,
              meetingId: meeting.meetingNumber,
              joinedAt: zp.join_time ? new Date(zp.join_time) : new Date(),
            });
            markedJoined += 1;
          }
        }
      }
    }

    lastRunStatus = 'ok';
    lastRunAt = new Date();
    return {
      markedLeft,
      markedJoined,
      meetingsEnded,
      meetingCount: liveMeetings.length,
      zoomCount: liveMeetings.length,
    };
  } catch (err) {
    lastRunStatus = 'error';
    lastRunAt = new Date();
    console.error('[reconciliation] Error:', err.message);
    return { error: err.message };
  }
}

export function startReconciliationJob(intervalMs = 60_000) {
  if (process.env.RECONCILE_ENABLED === 'false') {
    console.log('[reconciliation] Disabled via RECONCILE_ENABLED=false');
    return;
  }

  const ms = parseInt(process.env.RECONCILE_INTERVAL_MS ?? String(intervalMs), 10);

  setInterval(() => {
    reconcileSessionState().catch((err) => console.error('[reconciliation]', err));
  }, ms);

  console.log(`[reconciliation] Scheduled every ${ms / 1000}s`);
}
