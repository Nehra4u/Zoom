import { api } from './client'

export interface SystemSettings {
  recordingRetentionDays: number | null
  updatedAt: string | null
}

export async function fetchSystemSettings() {
  const { data } = await api.get<{ settings: SystemSettings }>('/settings')
  return data.settings
}

export async function updateRecordingRetention(recordingRetentionDays: number | null) {
  const { data } = await api.patch<{
    recordingRetentionDays: number | null
    updatedAt: string | null
    purgedRecordings: number
    removedFromCloud: number
    removedFromPortal: number
    cloudErrors: number
  }>('/settings/recording-retention', { recordingRetentionDays })
  return data
}
