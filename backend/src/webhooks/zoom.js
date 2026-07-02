import crypto from 'crypto';
import { User } from '../models/User.js';
import { Recording } from '../models/Recording.js';
import {
  handleParticipantJoined,
  handleParticipantLeft,
  handleParticipantMuted,
  handleSessionEnded,
} from '../services/sessionService.js';
import { isMeetingEventForActiveSession, findMeetingByZoomId } from '../services/meetingService.js';
import { getIo } from '../services/io.js';

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }
  return req.body;
}

function emitRecordingAvailable(recording) {
  const io = getIo();
  if (!io) return;
  io.of('/admin').to('admin:session').emit('recording:available', {
    id: recording._id.toString(),
    topic: recording.topic,
    startTime: recording.startTime,
    fileType: recording.fileType,
  });
}

async function handleRecordingCompleted(payload, eventTs) {
  const object = payload?.object;
  if (!object?.recording_files?.length) return;

  const meetingId = String(object.uuid ?? object.id ?? '');
  const relatedMeeting = await findMeetingByZoomId(meetingId);

  const startedBy = relatedMeeting?.startedBy ?? null;

  for (const file of object.recording_files) {
    if (file.status !== 'completed') continue;

    const recording = await Recording.findOneAndUpdate(
      { zoomRecordingId: file.id },
      {
        zoomMeetingId: meetingId || String(file.meeting_id ?? ''),
        zoomRecordingId: file.id,
        topic: object.topic ?? 'Meeting Recording',
        startTime: new Date(file.recording_start ?? object.start_time),
        endTime: file.recording_end ? new Date(file.recording_end) : null,
        duration: object.duration ?? 0,
        fileType: file.file_type ?? 'MP4',
        fileSize: file.file_size ?? 0,
        startedBy,
      },
      { upsert: true, new: true }
    );

    emitRecordingAvailable(recording);
  }

  void eventTs;
}

export async function handleZoomWebhookEvent(body) {
  const event = body.event;
  const eventTs = body.event_ts ?? Date.now();
  const object = body.payload?.object;

  switch (event) {
    case 'endpoint.url_validation':
      return { type: 'validation', plainToken: body.payload.plainToken };

    case 'meeting.participant_joined': {
      const participant = object?.participant;
      if (!participant) break;
      const meetingId = String(object.id ?? object.uuid ?? '');
      if (!(await isMeetingEventForActiveSession(meetingId))) break;
      const userId = participant.customer_key;
      if (!userId) break;
      const user = await User.findById(userId);
      await handleParticipantJoined({
        userId,
        zoomParticipantId: participant.user_id ?? participant.id,
        displayName: participant.user_name ?? user?.name,
        zoomDisplayName: user?.zoomDisplayName,
        meetingId: String(object.id ?? object.uuid ?? ''),
        joinedAt: participant.join_time ? new Date(participant.join_time) : new Date(),
        eventTs,
      });
      break;
    }

    case 'meeting.participant_left': {
      const participant = object?.participant;
      if (!participant) break;
      const meetingId = String(object.id ?? object.uuid ?? '');
      if (!(await isMeetingEventForActiveSession(meetingId))) break;
      await handleParticipantLeft({
        zoomParticipantId: participant.user_id ?? participant.id,
        leftAt: participant.leave_time ? new Date(participant.leave_time) : new Date(),
        eventTs,
      });
      break;
    }

    case 'meeting.participant_audio_muted': {
      const participant = object?.participant;
      if (!participant) break;
      const meetingId = String(object.id ?? object.uuid ?? '');
      if (!(await isMeetingEventForActiveSession(meetingId))) break;
      await handleParticipantMuted({
        zoomParticipantId: participant.user_id ?? participant.id,
        muted: true,
        eventTs,
      });
      break;
    }

    case 'meeting.participant_audio_unmuted': {
      const participant = object?.participant;
      if (!participant) break;
      const meetingId = String(object.id ?? object.uuid ?? '');
      if (!(await isMeetingEventForActiveSession(meetingId))) break;
      await handleParticipantMuted({
        zoomParticipantId: participant.user_id ?? participant.id,
        muted: false,
        eventTs,
      });
      break;
    }

    case 'recording.completed':
      await handleRecordingCompleted(body.payload, eventTs);
      break;

    case 'meeting.ended': {
      const meetingId = String(object?.id ?? object?.uuid ?? '');
      if (await isMeetingEventForActiveSession(meetingId)) {
        await handleSessionEnded(meetingId);
      }
      break;
    }

    default:
      console.log('[webhook] Unhandled event:', event);
  }

  return { type: 'ok' };
}

export function buildValidationResponse(plainToken) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const encryptedToken = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');
  return { plainToken, encryptedToken };
}

export { parseBody };
