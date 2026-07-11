import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSessionStore } from '@/stores/sessionStore'

export function DesktopMeetingEndedDialog() {
  const open = useSessionStore((s) => s.desktopEndedDialogOpen)
  const setOpen = useSessionStore((s) => s.setDesktopEndedDialogOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meeting ended</DialogTitle>
          <DialogDescription>
            Your web dashboard has been updated. If you used Record on this Computer in the Zoom
            app, your local recording is saved on this computer — typically in{' '}
            <strong>Documents/Zoom</strong> (Mac) or your Zoom recordings folder (Windows).
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function showDesktopMeetingEndedDialog() {
  useSessionStore.getState().setDesktopEndedDialogOpen(true)
}
