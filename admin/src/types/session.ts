export interface ActiveMeeting {
  id: string
  meetingNumber: string
  password: string
  zoomMeetingUuid: string
  topic: string
  status: 'live' | 'ended'
  startedAt: string | null
  endedAt: string | null
  startUrl?: string | null
  joinUrl?: string | null
  hostDisplayName?: string | null
  startedBy?: string | null
}

export interface SessionParticipant {
  userId: string
  zoomParticipantId: string | null
  displayName: string
  zoomDisplayName: string
  isMuted: boolean
  inCall: boolean
  joinedAt: string | null
  leftAt?: string | null
  userStatus: string | null
  email?: string | null
}

export interface SessionSnapshot {
  sessionActive: boolean
  meetingLive: boolean
  meeting: ActiveMeeting | null
  participants: SessionParticipant[]
}

export type SessionSocketEvent =
  | 'participant:joined'
  | 'participant:left'
  | 'participant:muted'
  | 'participant:unmuted'
  | 'session:ended'
