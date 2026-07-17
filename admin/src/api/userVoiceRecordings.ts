import { api } from '@/api/client'
import type {
  UserVoiceRecordingPlayUrlResponse,
  UserVoiceRecordingsListResponse,
} from '@/types/userVoiceRecording'

export async function fetchUserVoiceRecordings(params?: {
  q?: string
  from?: string
  to?: string
  userId?: string
}) {
  const { data } = await api.get<UserVoiceRecordingsListResponse>('/user-voice-recordings', {
    params,
  })
  return data
}

export async function fetchUserVoiceRecordingPlayUrl(id: string) {
  const { data } = await api.get<UserVoiceRecordingPlayUrlResponse>(
    `/user-voice-recordings/${id}/play-url`
  )
  return data
}

export async function downloadUserVoiceRecording(id: string, fileName: string) {
  const { playUrl } = await fetchUserVoiceRecordingPlayUrl(id)
  const response = await fetch(playUrl)
  if (!response.ok) {
    throw new Error('Failed to download recording')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
