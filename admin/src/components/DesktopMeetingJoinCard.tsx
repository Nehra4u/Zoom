import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { fetchMeetingJoinUrl } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`)
  }
}

function buildParticipantJoinUrl(meetingNumber: string, password: string, joinUrl: string | null) {
  if (joinUrl) return joinUrl
  const base = `https://zoom.us/j/${meetingNumber}`
  return password ? `${base}?pwd=${encodeURIComponent(password)}` : base
}

export function DesktopMeetingJoinCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['session', 'join-url'],
    queryFn: fetchMeetingJoinUrl,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {getErrorMessage(error)}
      </div>
    )
  }

  const participantUrl = buildParticipantJoinUrl(data.meetingNumber, data.password, data.joinUrl)
  const openUrl = data.isHost && data.startUrl ? data.startUrl : participantUrl
  const openLabel = data.isHost ? 'Open as host in Zoom app' : 'Join in Zoom app'

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Join in Zoom desktop app</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Sign in to Zoom desktop with your assigned host account. Use Record → Record on this
          Computer for local recordings. The dashboard still tracks participants, mute, and end
          meeting.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Meeting ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-background px-2 py-1.5 text-sm">
              {data.meetingNumber}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void copyText('Meeting ID', data.meetingNumber)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Passcode</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-background px-2 py-1.5 text-sm">
              {data.password || '—'}
            </code>
            {data.password ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => void copyText('Passcode', data.password)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            {openLabel}
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Local recordings save to your computer (for example Documents/Zoom/). They are not uploaded
        to this portal automatically.
      </p>
    </div>
  )
}
