export interface UserVoiceRecordingItem {
  id: string
  userId: string
  recordedAt: string
  durationMs: number
  fileSizeBytes: number
  mimeType: string
  deviceId: string | null
  createdAt: string
}

export interface UserVoiceRecordingUser {
  id: string
  username: string
  name: string
  email: string | null
  phone: string | null
}

export interface UserVoiceRecordingDayGroup {
  date: string
  label: string
  recordings: UserVoiceRecordingItem[]
}

export interface UserVoiceRecordingUserGroup {
  user: UserVoiceRecordingUser
  days: UserVoiceRecordingDayGroup[]
  totalRecordings: number
}

export interface UserVoiceRecordingsListResponse {
  groups: UserVoiceRecordingUserGroup[]
  totalUsers: number
  totalRecordings: number
}

export interface UserVoiceRecordingPlayUrlResponse {
  playUrl: string
  expiresInSeconds: number
  fileName: string
  mimeType: string
}
