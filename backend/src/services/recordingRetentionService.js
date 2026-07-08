import { SystemSettings } from '../models/SystemSettings.js';
import { Recording } from '../models/Recording.js';
import {
  deleteAllCloudRecordingsForMeeting,
  deleteCloudRecordingFile,
  fetchUserRecordings,
  fetchZoomHostUserId,
  isMockMode,
} from './zoomApi.js';
import { writeAutomaticAuditLog } from './auditService.js';

const SETTINGS_ID = 'global';

async function getRecordingRetentionDays() {
  const doc = await SystemSettings.findById(SETTINGS_ID);
  return doc?.recordingRetentionDays ?? null;
}

export async function getRetentionCutoffDate() {
  const days = await getRecordingRetentionDays();
  if (!days || days < 1) return null;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export function retentionQuery(cutoff) {
  if (!cutoff) return {};
  return { startTime: { $gte: cutoff } };
}

async function getRetentionHostUserId() {
  if (process.env.ZOOM_HOST_USER_ID) return process.env.ZOOM_HOST_USER_ID;
  return fetchZoomHostUserId();
}

function retentionZoomDateRange(cutoff) {
  const toDate = new Date(cutoff);
  toDate.setDate(toDate.getDate() - 1);

  const fromDate = new Date(cutoff);
  fromDate.setFullYear(fromDate.getFullYear() - 2);

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
  };
}

async function deleteExpiredRecordingsFromZoom(cutoff) {
  if (isMockMode()) {
    return { removedFromCloud: 0, cloudErrors: 0, skipped: 'mock_mode' };
  }

  const hostUserId = await getRetentionHostUserId();
  const { from, to } = retentionZoomDateRange(cutoff);
  let removedFromCloud = 0;
  let cloudErrors = 0;
  let nextPageToken = '';

  do {
    const page = await fetchUserRecordings(hostUserId, { from, to, nextPageToken, pageSize: 300 });

    for (const meeting of page.meetings ?? []) {
      const meetingId = String(meeting.uuid ?? meeting.id ?? '');
      if (!meetingId) continue;

      try {
        await deleteAllCloudRecordingsForMeeting(meetingId);
        removedFromCloud += meeting.recording_files?.length ?? 1;
      } catch (err) {
        cloudErrors += 1;
        console.error('[recording-retention] Zoom delete failed:', meetingId, err.message);
      }
    }

    nextPageToken = page.next_page_token ?? '';
  } while (nextPageToken);

  return { removedFromCloud, cloudErrors };
}

async function deleteExpiredPortalRecordingsFromZoom(cutoff) {
  if (isMockMode()) return { removedFromCloud: 0, cloudErrors: 0 };

  const expired = await Recording.find({ startTime: { $lt: cutoff } });
  let removedFromCloud = 0;
  let cloudErrors = 0;

  for (const doc of expired) {
    try {
      const result = await deleteCloudRecordingFile(doc.zoomMeetingId, doc.zoomRecordingId);
      if (result.deleted || result.notFound) removedFromCloud += 1;
    } catch (err) {
      cloudErrors += 1;
      console.error(
        '[recording-retention] Zoom delete failed for portal row:',
        doc.zoomRecordingId,
        err.message
      );
    }
  }

  return { removedFromCloud, cloudErrors };
}

export async function enforceRecordingRetention() {
  const cutoff = await getRetentionCutoffDate();
  if (!cutoff) {
    return { removedFromCloud: 0, removedFromPortal: 0, cloudErrors: 0, cutoff: null };
  }

  const zoomScan = await deleteExpiredRecordingsFromZoom(cutoff);
  const portalZoom = await deleteExpiredPortalRecordingsFromZoom(cutoff);

  const portalResult = await Recording.deleteMany({ startTime: { $lt: cutoff } });

  if ((portalResult.deletedCount ?? 0) > 0) {
    await writeAutomaticAuditLog({
      action: 'recording_expired',
      meta: {
        removedFromPortal: portalResult.deletedCount ?? 0,
        removedFromCloud: zoomScan.removedFromCloud + portalZoom.removedFromCloud,
        cutoff: cutoff.toISOString(),
      },
    });
  }

  return {
    removedFromCloud: zoomScan.removedFromCloud + portalZoom.removedFromCloud,
    removedFromPortal: portalResult.deletedCount ?? 0,
    cloudErrors: zoomScan.cloudErrors + portalZoom.cloudErrors,
    cutoff,
  };
}
