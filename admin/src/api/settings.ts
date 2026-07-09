import { api } from './client'

export interface SystemSettings {
  recordingRetentionDays: number | null
  subscriptionEndDate: string | null
  updatedAt: string | null
}

export interface SubscriptionStatus {
  endDate: string | null
  isActive: boolean
}

export async function fetchSubscription() {
  const { data } = await api.get<SubscriptionStatus>('/settings/subscription')
  return data
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
