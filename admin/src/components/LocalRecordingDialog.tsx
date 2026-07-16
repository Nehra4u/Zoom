import { useEffect, useRef } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useLocalRecordingGuard } from '@/hooks/useLocalRecordingGuard'
import { useLocalRecordingStore } from '@/stores/localRecordingStore'
import { useSessionStore } from '@/stores/sessionStore'

export function LocalRecordingDialog() {
  const blocker = useLocalRecordingGuard()
  const status = useLocalRecordingStore((s) => s.status)
  const progress = useLocalRecordingStore((s) => s.progress)
  const blobUrl = useLocalRecordingStore((s) => s.blobUrl)
  const fileName = useLocalRecordingStore((s) => s.fileName)
  const showLeaveWarning = useLocalRecordingStore((s) => s.showLeaveWarning)
  const setShowLeaveWarning = useLocalRecordingStore((s) => s.setShowLeaveWarning)
  const dismiss = useLocalRecordingStore((s) => s.dismiss)
  const autoDownloadAttempted = useRef(false)

  const isOpen = status === 'finalizing' || status === 'ready'

  function downloadAndDismiss() {
    if (!blobUrl || !fileName) return
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = fileName
    anchor.click()
    toast.success('Recording downloaded')
    dismiss()
  }

  useEffect(() => {
    if (status !== 'ready' || !blobUrl || !fileName || autoDownloadAttempted.current) {
      return
    }
    autoDownloadAttempted.current = true
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = fileName
    anchor.click()
    toast.success('Recording downloaded')
    dismiss()
  }, [status, blobUrl, fileName, dismiss])

  useEffect(() => {
    if (status === 'idle') {
      autoDownloadAttempted.current = false
    }
  }, [status])

  function handleStay() {
    setShowLeaveWarning(false)
    if (blocker.state === 'blocked') {
      blocker.reset?.()
    }
  }

  function handleLeaveAnyway() {
    setShowLeaveWarning(false)
    dismiss()
    if (blocker.state === 'blocked') {
      blocker.proceed?.()
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {status === 'finalizing' ? 'Creating your recording — please wait' : 'Recording ready'}
            </DialogTitle>
            <DialogDescription>
              {status === 'finalizing'
                ? 'Your local meeting recording is being prepared.'
                : 'Your recording is ready. Click download to save the file.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {status === 'finalizing' ? (
              <div className="flex flex-col items-center gap-4">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                <Progress value={progress} indeterminate={progress < 20} />
                <p className="text-sm text-muted-foreground">{progress}%</p>
              </div>
            ) : (
              <>
                <Progress value={100} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={downloadAndDismiss} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download recording
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {status === 'interrupted' ? 'Leave while recording is interrupted?' : 'Leave before downloading?'}
            </DialogTitle>
            <DialogDescription>
              {status === 'interrupted'
                ? 'Your local recording was interrupted. Leaving now may discard captured data before you end the meeting or restart recording.'
                : 'You will lose the local recording if you leave before downloading it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleStay}>
              Stay on page
            </Button>
            <Button variant="destructive" onClick={handleLeaveAnyway}>
              Leave anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

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
