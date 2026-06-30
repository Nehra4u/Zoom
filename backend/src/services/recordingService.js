import { Recording } from '../models/Recording.js';
import { fetchMeetingRecordings } from './zoomApi.js';
import { writeAuditLog } from './auditService.js';

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
    createdAt: recording.createdAt,
  };
}

export async function listRecordings() {
  const recordings = await Recording.find().sort({ startTime: -1 });
  return recordings.map(toPublicRecording);
}

export async function getRecordingById(id) {
  const recording = await Recording.findById(id);
  if (!recording) return null;
  return toPublicRecording(recording);
}

export async function getFreshPlayUrl(id, actor) {
  const recording = await Recording.findById(id);
  if (!recording) {
    const err = new Error('Recording not found');
    err.status = 404;
    throw err;
  }

  const zoomData = await fetchMeetingRecordings(recording.zoomMeetingId);
  const file = zoomData.recording_files?.find((f) => f.id === recording.zoomRecordingId)
    ?? zoomData.recording_files?.[0];

  if (!file?.play_url) {
    const err = new Error('Play URL not available from Zoom');
    err.status = 502;
    throw err;
  }

  recording.playUrlFetchedAt = new Date();
  await recording.save();

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'recording_accessed',
      meta: { recordingId: id, zoomRecordingId: recording.zoomRecordingId },
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
