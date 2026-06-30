import { api } from './client'
import type { Recording, RecordingPlayUrl } from '@/types/recording'

export async function fetchRecordings() {
  const { data } = await api.get<{ recordings: Recording[] }>('/recordings')
  return data.recordings
}

export async function fetchRecordingPlayUrl(id: string) {
  const { data } = await api.get<RecordingPlayUrl>(`/recordings/${id}/play-url`)
  return data
}

export async function simulateWebhookEvent(body: Record<string, unknown>) {
  const { data } = await api.post('/webhooks/dev/simulate', body)
  return data
}
