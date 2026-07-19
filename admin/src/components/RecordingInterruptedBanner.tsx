import { AlertTriangle, CircleDot } from 'lucide-react'
import { triggerLocalRecordingRestart } from '@/lib/localRecordingEvents'
import { Button } from '@/components/ui/button'
import { useLocalRecordingStore } from '@/stores/localRecordingStore'
import { useSessionStore } from '@/stores/sessionStore'

export function RestartRecordingButton() {
  const status = useLocalRecordingStore((s) => s.status)
  const joinMode = useSessionStore((s) => s.joinMode)
  const meetingLive = useSessionStore((s) => s.meetingLive)

  if (!meetingLive || joinMode !== 'portal' || status !== 'interrupted') {
    return null
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/15"
      onClick={() => triggerLocalRecordingRestart()}
    >
      <CircleDot className="h-3.5 w-3.5" />
      Restart screen recording
    </Button>
  )
}

export function RecordingInterruptedBanner() {
  const status = useLocalRecordingStore((s) => s.status)
  const joinMode = useSessionStore((s) => s.joinMode)
  const meetingLive = useSessionStore((s) => s.meetingLive)

  if (!meetingLive || joinMode !== 'portal' || status !== 'interrupted') {
    return null
  }

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-8 py-2.5">
      <div className="flex items-start gap-2 text-sm text-warning-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Screen sharing stopped — your local recording was interrupted. Restart screen recording to
          continue capturing, or end the meeting to save what was recorded so far. If you leave without
          restarting, you may lose the local recording data.
        </p>
      </div>
    </div>
  )
}
