import { Check, Monitor, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useSessionStore, type MeetingJoinMode } from '@/stores/sessionStore'

const OPTIONS: {
  value: MeetingJoinMode
  label: string
  description: string
  bullets: string[]
  icon: typeof Monitor
  recommended?: boolean
}[] = [
  {
    value: 'portal',
    label: 'Start in Portal',
    description: 'Join and host the meeting right in this browser.',
    bullets: [
      'Stay on this dashboard while you host',
      'Optional local tab recording with audio',
      'Manage participants without switching apps',
    ],
    icon: Monitor,
    recommended: true,
  },
  {
    value: 'desktop',
    label: 'Start in Zoom',
    description: 'Open the Zoom desktop app as host.',
    bullets: [
      'Full Zoom desktop experience',
      'Use Zoom cloud or local recording',
      'Return here to manage participants',
    ],
    icon: Smartphone,
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
    <div className={cn('flex flex-col gap-3', className)}>
      {OPTIONS.map((option) => {
        const selected = joinMode === option.value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => selectMode(option.value)}
            className={cn(
              'relative rounded-xl border-2 px-4 py-4 text-left transition-all duration-200',
              'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? option.recommended
                  ? 'border-primary bg-primary/8 shadow-md shadow-primary/10'
                  : 'border-primary bg-primary/5'
                : 'border-border/60 bg-background hover:border-border hover:bg-muted/30',
              option.recommended && !compact && 'sm:py-5'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{option.label}</p>
                  {option.recommended && (
                    <Badge variant="default" className="text-[10px] font-medium uppercase tracking-wide">
                      Recommended
                    </Badge>
                  )}
                </div>
                {!compact && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    <ul className="mt-2.5 space-y-1">
                      {option.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                )}
              >
                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
