import { useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { MeetingJoinPanel } from '@/components/MeetingJoinPanel'
import { useSessionStore } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MeetingPortalHostProps {
  mode: 'visible' | 'mini'
}

export function MeetingPortalHost({ mode }: MeetingPortalHostProps) {
  const meetingLive = useSessionStore((state) => state.meetingLive)
  const navigate = useNavigate()

  if (!meetingLive) return null

  const isVisible = mode === 'visible'

  return (
    <div
      className={cn(
        isVisible && 'absolute inset-0 overflow-hidden p-6',
        !isVisible &&
          'fixed bottom-24 right-6 z-50 flex h-[180px] w-[320px] flex-col overflow-hidden rounded-xl border border-border bg-black shadow-lg'
      )}
    >
      {!isVisible && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/80 px-2 py-1">
          <span className="text-[11px] font-medium text-white/80">Live meeting</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => navigate('/dashboard')}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div
        className={cn(
          isVisible && '-m-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)]',
          !isVisible && 'min-h-0 flex-1'
        )}
      >
        <MeetingJoinPanel meetingLive={meetingLive} mode={isVisible ? 'visible' : 'mini'} />
      </div>
    </div>
  )
}
