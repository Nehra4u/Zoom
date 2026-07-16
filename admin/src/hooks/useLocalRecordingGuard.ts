import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { shouldBlockNavigation, useLocalRecordingStore } from '@/stores/localRecordingStore'
import { useSessionStore } from '@/stores/sessionStore'

export function useLocalRecordingGuard() {
  const status = useLocalRecordingStore((s) => s.status)
  const downloaded = useLocalRecordingStore((s) => s.downloaded)
  const meetingLive = useSessionStore((s) => s.meetingLive)
  const setShowLeaveWarning = useLocalRecordingStore((s) => s.setShowLeaveWarning)

  const shouldBlock =
    status === 'finalizing' ||
    (status === 'ready' && !downloaded) ||
    (status === 'interrupted' && meetingLive)

  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowLeaveWarning(true)
    }
  }, [blocker.state, setShowLeaveWarning])

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldBlockNavigation()) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [shouldBlock])

  return blocker
}
