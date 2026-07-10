import { Monitor, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTabSessionLock } from '@/hooks/useTabSessionLock'

interface TabSessionBlockerProps {
  enabled: boolean
}

export function TabSessionBlocker({ enabled }: TabSessionBlockerProps) {
  const { state, takeOver, goToLogin } = useTabSessionLock(enabled)

  if (!enabled || state !== 'blocked') return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Monitor className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Session active in another tab</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only one browser tab can be logged in at a time. Close the other tab or take over this session.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={takeOver}>Take over this tab</Button>
          <Button variant="outline" onClick={goToLogin}>
            Go to login
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
