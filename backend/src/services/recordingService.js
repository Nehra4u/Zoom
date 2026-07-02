import { Recording } from '../models/Recording.js';
import { fetchMeetingRecordings } from './zoomApi.js';
import { writeAuditLog } from './auditService.js';
import { recordingScopeQuery } from './adminScope.js';

function toPublicRecording(recording) {
  return {
    id: recording._id.toString(),
    zoomMeetingId: recording.zoomMeetingId,
    zoomRecordingId: recording.zoomRecordingId,
    topic: recording.topic,
    startTime: recording.startTime,
    endTime: recording.endTime,
    duration: recording.duration,
    fileType: recording.fileType,
    fileSize: recording.fileSize,
    startedBy: recording.startedBy?.toString() ?? null,
    createdAt: recording.createdAt,
  };
}

export async function listRecordings(admin = null) {
  const query = recordingScopeQuery(admin);
  const recordings = await Recording.find(query).sort({ startTime: -1 });
  return recordings.map(toPublicRecording);
}

export async function getRecordingById(id, admin = null) {
  const query = { _id: id, ...recordingScopeQuery(admin) };
  const recording = await Recording.findOne(query);
  if (!recording) return null;
  return toPublicRecording(recording);
}

export async function getFreshPlayUrl(id, actor) {
  const recording = await getRecordingById(id, actor);
  if (!recording) {
    const err = new Error('Recording not found or access denied');
    err.status = 404;
    throw err;
  }

  const doc = await Recording.findById(id);
  const zoomData = await fetchMeetingRecordings(doc.zoomMeetingId);
  const file = zoomData.recording_files?.find((f) => f.id === doc.zoomRecordingId)
    ?? zoomData.recording_files?.[0];

  if (!file?.play_url) {
    const err = new Error('Play URL not available from Zoom');
    err.status = 502;
    throw err;
  }

  doc.playUrlFetchedAt = new Date();
  await doc.save();

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'recording_accessed',
      meta: { recordingId: id, zoomRecordingId: doc.zoomRecordingId },
    });
  }

  return {
    playUrl: file.play_url,
    downloadUrl: file.download_url ?? null,
    expiresNote: 'This URL is time-limited. Fetch again if expired.',
  };
}

export async function createRecordingFromWebhook(data) {
  return Recording.findOneAndUpdate({ zoomRecordingId: data.zoomRecordingId }, data, {
    upsert: true,
    new: true,
  });
}

export { toPublicRecording };
