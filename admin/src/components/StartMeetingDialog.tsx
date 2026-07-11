import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MeetingJoinModeToggle } from '@/components/MeetingJoinModeToggle'
import type { MeetingJoinMode } from '@/stores/sessionStore'

interface StartMeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (joinMode: MeetingJoinMode) => void
  isStarting?: boolean
  initialJoinMode?: MeetingJoinMode
}

export function StartMeetingDialog({
  open,
  onOpenChange,
  onConfirm,
  isStarting = false,
  initialJoinMode = 'portal',
}: StartMeetingDialogProps) {
  const [selectedMode, setSelectedMode] = useState<MeetingJoinMode>(initialJoinMode)

  useEffect(() => {
    if (open) setSelectedMode(initialJoinMode)
  }, [open, initialJoinMode])

  function handleOpenChange(next: boolean) {
    if (!isStarting) {
      if (next) setSelectedMode(initialJoinMode)
      onOpenChange(next)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How do you want to join?</DialogTitle>
          <DialogDescription>
            Choose before starting the meeting. You can manage participants from this dashboard in
            either mode.
          </DialogDescription>
        </DialogHeader>

        <MeetingJoinModeToggle value={selectedMode} onChange={setSelectedMode} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isStarting}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selectedMode)} disabled={isStarting}>
            {isStarting ? 'Starting…' : 'Start meeting'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
