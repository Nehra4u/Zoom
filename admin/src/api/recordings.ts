import { api } from './client'
import type { Recording, RecordingPlayUrl } from '@/types/recording'

export async function fetchRecordings() {
  const { data } = await api.get<{ recordings: Recording[] }>('/recordings')
  return data.recordings
}

export async function syncRecordingsFromZoom() {
  const { data } = await api.post<{
    synced: number
    total: number
    from: string
    to: string
    recordings: Recording[]
  }>('/recordings/sync')
  return data
}

export async function fetchRecordingPlayUrl(id: string) {
  const { data } = await api.get<RecordingPlayUrl>(`/recordings/${id}/play-url`)
  return data
}

export async function deleteRecording(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/recordings/${id}`)
  return data
}

export async function simulateWebhookEvent(body: Record<string, unknown>) {
  const { data } = await api.post('/webhooks/dev/simulate', body)
  return data
}
