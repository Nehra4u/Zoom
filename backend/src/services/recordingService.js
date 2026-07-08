import { Recording } from '../models/Recording.js';
import { fetchMeetingRecordings, fetchUserRecordings, deleteCloudRecordingFile } from './zoomApi.js';
import { writeAuditLog } from './auditService.js';
import { recordingScopeQuery } from './adminScope.js';
import {
  getRetentionCutoffDate,
  getRecordingRetentionDays,
  retentionQuery,
} from './settingsService.js';
import { enforceRecordingRetention } from './recordingRetentionService.js';
import { findMeetingByZoomId, resolveHostUserId } from './meetingService.js';

function computeExpiresAt(startTime, retentionDays) {
  if (!retentionDays || retentionDays < 1 || !startTime) return null;
  const expiresAt = new Date(startTime);
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  return expiresAt;
}

function toPublicRecording(recording, retentionDays = null) {
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
    expiresAt: computeExpiresAt(recording.startTime, retentionDays),
  };
}

export async function upsertRecordingFile({ zoomMeetingId, topic, duration, file, startedBy }) {
  if (!file?.id || file.status !== 'completed') return null;

  const cutoff = await getRetentionCutoffDate();
  if (cutoff && file.recording_start && new Date(file.recording_start) < cutoff) return null;

  return Recording.findOneAndUpdate(
    { zoomRecordingId: file.id },
    {
      zoomMeetingId: zoomMeetingId || String(file.meeting_id ?? ''),
      zoomRecordingId: file.id,
      topic: topic ?? 'Meeting Recording',
      startTime: new Date(file.recording_start ?? Date.now()),
      endTime: file.recording_end ? new Date(file.recording_end) : null,
      duration: duration ?? 0,
      fileType: file.file_type ?? 'MP4',
      fileSize: file.file_size ?? 0,
      startedBy,
    },
    { upsert: true, new: true }
  );
}

export async function syncRecordingsFromZoom(admin) {
  const hostUserId = await resolveHostUserId(admin.sub);
  const from = daysAgoIso(30);
  const to = todayIso();
  const cutoff = await getRetentionCutoffDate();
  let synced = 0;
  let total = 0;
  let nextPageToken = '';

  do {
    const page = await fetchUserRecordings(hostUserId, { from, to, nextPageToken });
    total = page.total_records ?? total;

    for (const meeting of page.meetings ?? []) {
      const meetingId = String(meeting.uuid ?? meeting.id ?? '');
      const relatedMeeting = await findMeetingByZoomId(meetingId);
      const startedBy = relatedMeeting?.startedBy ?? null;

      if (admin.role !== 'super_admin') {
        if (!relatedMeeting || startedBy?.toString() !== admin.sub) continue;
      }

      for (const file of meeting.recording_files ?? []) {
        if (cutoff && file.recording_start && new Date(file.recording_start) < cutoff) continue;

        const saved = await upsertRecordingFile({
          zoomMeetingId: meetingId,
          topic: meeting.topic,
          duration: meeting.duration,
          file,
          startedBy,
        });
        if (saved) synced += 1;
      }
    }

    nextPageToken = page.next_page_token ?? '';
  } while (nextPageToken);

  await enforceRecordingRetention();

  return { synced, total, from, to };
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export async function listRecordings(admin = null) {
  await enforceRecordingRetention();
  const cutoff = await getRetentionCutoffDate();
  const retentionDays = await getRecordingRetentionDays();
  const query = { ...recordingScopeQuery(admin), ...retentionQuery(cutoff) };
  const recordings = await Recording.find(query).sort({ startTime: -1 });
  return {
    recordings: recordings.map((recording) => toPublicRecording(recording, retentionDays)),
    recordingRetentionDays: retentionDays,
  };
}

export async function getRecordingById(id, admin = null) {
  const query = { _id: id, ...recordingScopeQuery(admin) };
  const recording = await Recording.findOne(query);
  if (!recording) return null;
  const retentionDays = await getRecordingRetentionDays();
  return toPublicRecording(recording, retentionDays);
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

export async function deleteRecording(id, actor) {
  const query = { _id: id, ...recordingScopeQuery(actor) };
  const doc = await Recording.findOne(query);
  if (!doc) {
    const err = new Error('Recording not found or access denied');
    err.status = 404;
    throw err;
  }

  try {
    const result = await deleteCloudRecordingFile(doc.zoomMeetingId, doc.zoomRecordingId);
    if (!result.deleted && !result.notFound) {
      console.warn('[recording-delete] Zoom cloud delete uncertain:', doc.zoomRecordingId);
    }
  } catch (err) {
    console.error('[recording-delete] Zoom cloud delete failed:', doc.zoomRecordingId, err.message);
    const deleteErr = new Error('Failed to delete recording from Zoom cloud');
    deleteErr.status = 502;
    throw deleteErr;
  }

  await Recording.deleteOne({ _id: doc._id });

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'recording_removed',
      meta: {
        recordingId: id,
        zoomRecordingId: doc.zoomRecordingId,
        topic: doc.topic,
        deletedFromCloud: true,
      },
    });
  }

  return { ok: true };
}

export async function createRecordingFromWebhook(data) {
  return Recording.findOneAndUpdate({ zoomRecordingId: data.zoomRecordingId }, data, {
    upsert: true,
    new: true,
  });
}

export { toPublicRecording };
