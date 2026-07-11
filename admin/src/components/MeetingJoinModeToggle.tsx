import { cn } from '@/lib/utils'
import { useSessionStore, type MeetingJoinMode } from '@/stores/sessionStore'

const OPTIONS: { value: MeetingJoinMode; label: string; description: string }[] = [
  {
    value: 'portal',
    label: 'Join in portal',
    description: 'Browser meeting with optional screen capture recording',
  },
  {
    value: 'desktop',
    label: 'Join in Zoom app',
    description: 'Open Zoom desktop for local recording',
  },
]

interface MeetingJoinModeToggleProps {
  className?: string
  compact?: boolean
  value?: MeetingJoinMode
  onChange?: (mode: MeetingJoinMode) => void
}

export function MeetingJoinModeToggle({
  className,
  compact = false,
  value,
  onChange,
}: MeetingJoinModeToggleProps) {
  const storeJoinMode = useSessionStore((s) => s.joinMode)
  const setJoinMode = useSessionStore((s) => s.setJoinMode)
  const joinMode = value ?? storeJoinMode

  function selectMode(mode: MeetingJoinMode) {
    if (onChange) {
      onChange(mode)
    } else {
      setJoinMode(mode)
    }
  }

  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {OPTIONS.map((option) => {
        const selected = joinMode === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => selectMode(option.value)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border/60 bg-background hover:bg-muted/40'
            )}
          >
            <p className="text-sm font-medium text-foreground">{option.label}</p>
            {!compact && (
              <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}
