import { useNavigate } from 'react-router-dom'
import { Video } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MeetingActiveBanner() {
  const navigate = useNavigate()

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <Video className="h-4 w-4 text-success" />
        Meeting in progress
      </div>
      <Button size="sm" onClick={() => navigate('/dashboard')}>
        Return to dashboard
      </Button>
    </div>
  )
}
