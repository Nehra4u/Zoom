import { Badge } from '@/components/ui/badge'
import { useSessionStore } from '@/stores/sessionStore'

export function JoinModeBadge() {
  const joinMode = useSessionStore((s) => s.joinMode)
  const label = joinMode === 'desktop' ? 'Start in Zoom' : 'Start in Portal'

  return (
    <Badge variant="secondary" className="w-fit text-xs font-normal">
      Joining via {label}
    </Badge>
  )
}
