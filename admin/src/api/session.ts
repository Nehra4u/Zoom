import { api } from './client'
import type { ActiveMeeting, SessionSnapshot } from '@/types/session'

export async function fetchCurrentSession() {
  const { data } = await api.get<SessionSnapshot>('/session/current')
  return data
}

export async function startMeeting() {
  const { data } = await api.post<{ meeting: ActiveMeeting }>('/session/start')
  return data.meeting
}

export async function endMeeting() {
  const { data } = await api.post<{ meeting: ActiveMeeting }>('/session/end')
  return data.meeting
}

export async function removeParticipantFromCall(userId: string) {
  const { data } = await api.post<{ ok: boolean }>(`/session/participants/${userId}/remove`)
  return data
}

export async function simulateSessionEvent(payload: {
  event: 'joined' | 'left' | 'muted' | 'unmuted' | 'ended'
  userId: string
  zoomParticipantId?: string
  displayName?: string
  meetingId?: string
}) {
  const { data } = await api.post('/session/dev/simulate', payload)
  return data
}
