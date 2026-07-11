export interface Recording {
  id: string
  zoomMeetingId: string
  zoomRecordingId: string
  topic: string
  startTime: string
  endTime: string | null
  duration: number
  fileType: string
  fileSize: number
  startedBy: string | null
  createdAt: string
  expiresAt: string | null
}

export interface RecordingPlayUrl {
  playUrl: string
  downloadUrl: string | null
  passcode: string | null
  expiresNote: string
}
