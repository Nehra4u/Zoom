import { create } from 'zustand'
import { useSessionStore } from '@/stores/sessionStore'

export type LocalRecordingStatus =
  | 'idle'
  | 'recording'
  | 'interrupted'
  | 'finalizing'
  | 'ready'
  | 'dismissed'

interface LocalRecordingState {
  status: LocalRecordingStatus
  progress: number
  blobUrl: string | null
  fileName: string | null
  downloaded: boolean
  showLeaveWarning: boolean
  setStatus: (status: LocalRecordingStatus) => void
  setProgress: (progress: number) => void
  setBlob: (blobUrl: string, fileName: string) => void
  setDownloaded: (downloaded: boolean) => void
  setShowLeaveWarning: (show: boolean) => void
  reset: () => void
  dismiss: () => void
}

const initialState = {
  status: 'idle' as LocalRecordingStatus,
  progress: 0,
  blobUrl: null as string | null,
  fileName: null as string | null,
  downloaded: false,
  showLeaveWarning: false,
}

export const useLocalRecordingStore = create<LocalRecordingState>((set, get) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setBlob: (blobUrl, fileName) => set({ blobUrl, fileName, status: 'ready', progress: 100 }),
  setDownloaded: (downloaded) => set({ downloaded }),
  setShowLeaveWarning: (showLeaveWarning) => set({ showLeaveWarning }),
  reset: () => {
    const { blobUrl } = get()
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    set({ ...initialState })
  },
  dismiss: () => {
    const { blobUrl } = get()
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    set({ ...initialState, status: 'dismissed' })
  },
}))

export function shouldBlockNavigation() {
  const { status, downloaded } = useLocalRecordingStore.getState()
  const meetingLive = useSessionStore.getState().meetingLive
  return (
    status === 'finalizing' ||
    (status === 'ready' && !downloaded) ||
    (status === 'interrupted' && meetingLive)
  )
}
