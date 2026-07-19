import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/sessionStore'

export function useLocalRecordingLifecycle() {
  useEffect(() => {
    function onMeetingEnded() {
      if (useSessionStore.getState().joinMode !== 'portal') return
      void import('@/lib/localRecordingCapture').then(({ finalizeLocalRecordingCapture }) =>
        finalizeLocalRecordingCapture()
      )
    }

    window.addEventListener('local-recording:finalize', onMeetingEnded)
    return () => window.removeEventListener('local-recording:finalize', onMeetingEnded)
  }, [])
}

export function triggerLocalRecordingFinalize() {
  window.dispatchEvent(new CustomEvent('local-recording:finalize'))
}

export function triggerLocalRecordingStart() {
  toast.info(
    'To capture meeting audio, choose this browser tab and enable "Also share tab audio" / "Share tab audio".',
    { duration: 10000 }
  )
  void import('@/lib/localRecordingCapture').then(async ({ startLocalRecordingCapture }) => {
    const result = await startLocalRecordingCapture()
    if (!result.ok) {
      if (result.reason === 'cancelled') return
      toast.error('Could not start local recording capture')
      return
    }
    if (!result.hasAudio) {
      toast.warning(
        'Recording started without audio. End the meeting, then rejoin and enable tab audio when Chrome prompts you.'
      )
    }
  })
}

export function triggerLocalRecordingRestart() {
  toast.info(
    'Choose this browser tab again and enable "Share tab audio" to resume recording.',
    { duration: 10000 }
  )
  void import('@/lib/localRecordingCapture').then(async ({ restartLocalRecordingCapture }) => {
    const result = await restartLocalRecordingCapture()
    if (!result.ok) {
      if (result.reason === 'cancelled') return
      toast.error('Could not restart screen recording')
      return
    }
    toast.success('Screen recording restarted')
    if (!result.hasAudio) {
      toast.warning('Recording restarted without audio. Enable tab audio when Chrome prompts you.')
    }
  })
}
