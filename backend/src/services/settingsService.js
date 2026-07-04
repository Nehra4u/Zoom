import { SystemSettings } from '../models/SystemSettings.js';
import { writeAuditLog } from './auditService.js';
import { enforceRecordingRetention } from './recordingRetentionService.js';

const SETTINGS_ID = 'global';

export async function getSystemSettings() {
  const doc = await SystemSettings.findById(SETTINGS_ID);
  return {
    recordingRetentionDays: doc?.recordingRetentionDays ?? null,
    updatedAt: doc?.updatedAt ?? null,
  };
}

export async function getRecordingRetentionDays() {
  const settings = await getSystemSettings();
  return settings.recordingRetentionDays;
}

export async function updateRecordingRetentionDays(days, actor) {
  let recordingRetentionDays = null;

  if (days !== null && days !== undefined && days !== '') {
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 1) {
      const err = new Error('Retention days must be a whole number of at least 1, or empty to disable');
      err.status = 400;
      throw err;
    }
    if (parsed > 3650) {
      const err = new Error('Retention days cannot exceed 3650');
      err.status = 400;
      throw err;
    }
    recordingRetentionDays = parsed;
  }

  await SystemSettings.findByIdAndUpdate(
    SETTINGS_ID,
    { recordingRetentionDays, updatedBy: actor.sub },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const purge = recordingRetentionDays ? await enforceRecordingRetention() : { removedFromCloud: 0, removedFromPortal: 0, cloudErrors: 0 };

  await writeAuditLog({
    actor,
    action: 'settings_updated',
    meta: {
      recordingRetentionDays,
      removedFromCloud: purge.removedFromCloud,
      removedFromPortal: purge.removedFromPortal,
      cloudErrors: purge.cloudErrors,
    },
  });

  const settings = await getSystemSettings();
  return {
    ...settings,
    removedFromCloud: purge.removedFromCloud,
    removedFromPortal: purge.removedFromPortal,
    cloudErrors: purge.cloudErrors,
    purgedRecordings: purge.removedFromPortal,
  };
}

export function startRecordingRetentionJob(intervalMs = 60 * 60 * 1000) {
  const run = () => {
    enforceRecordingRetention().catch((err) => console.error('[recording-retention]', err.message));
  };

  run();
  setInterval(run, intervalMs);
  console.log(`[recording-retention] Cloud cleanup scheduled every ${intervalMs / 1000}s`);
}

export { getRetentionCutoffDate, retentionQuery } from './recordingRetentionService.js';
