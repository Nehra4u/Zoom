import { api } from './client'
import type { ActiveMeeting, SessionSnapshot } from '@/types/session'

export interface AdminJoinCredentials {
  sdkJwt: string
  zak: string | null
  meetingNumber: string
  password: string
  sdkKey: string | null
  role: number
  joinMode?: 'host' | 'attendee'
  displayName: string
  userEmail: string | null
}

export interface MeetingJoinInfo {
  meetingNumber: string
  password: string
  startUrl: string | null
  joinUrl: string | null
  displayName: string
}

export async function fetchCurrentSession() {
  const { data } = await api.get<SessionSnapshot>('/session/current')
  return data
}

export async function fetchMeetingJoinUrl() {
  const { data } = await api.get<MeetingJoinInfo>('/session/join-url')
  return data
}

export async function fetchAdminJoinToken() {
  const { data } = await api.post<AdminJoinCredentials>('/session/join-token')
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

export async function muteParticipant(userId: string) {
  const { data } = await api.post<{ ok: boolean; isMuted: boolean }>(
    `/session/participants/${userId}/mute`
  )
  return data
}

export async function unmuteParticipant(userId: string) {
  const { data } = await api.post<{ ok: boolean; isMuted: boolean }>(
    `/session/participants/${userId}/unmute`
  )
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
