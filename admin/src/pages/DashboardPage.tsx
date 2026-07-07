import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Video } from 'lucide-react'
import { toast } from 'sonner'
import { endMeeting, fetchCurrentSession, startMeeting } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { MeetingJoinPanel } from '@/components/MeetingJoinPanel'
import { useSessionStore } from '@/stores/sessionStore'

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => new Date())
  const { meetingLive, socketConnected, setSnapshot } = useSessionStore()

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const sessionQuery = useQuery({
    queryKey: ['session', 'current'],
    queryFn: fetchCurrentSession,
    refetchInterval: socketConnected ? false : 30_000,
  })

  useEffect(() => {
    if (sessionQuery.data) {
      setSnapshot(sessionQuery.data)
    }
  }, [sessionQuery.data, setSnapshot])

  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
  }

  const startMutation = useMutation({
    mutationFn: startMeeting,
    onSuccess: (started) => {
      invalidateSession()
      toast.success(`Meeting started — ID ${started.meetingNumber}`)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const endMutation = useMutation({
    mutationFn: endMeeting,
    onSuccess: () => {
      invalidateSession()
      toast.success('Meeting ended — recording will appear in Recordings when ready')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="h-full">
      {meetingLive ? (
        <div className="-m-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)]">
          <MeetingJoinPanel
            meetingLive={meetingLive}
            onMeetingEnded={async () => {
              await endMutation.mutateAsync()
            }}
          />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-10">
          <div className="text-center">
            <p className="text-2xl font-semibold tracking-tight text-foreground">{formatTime(now)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(now)}</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
              className="group relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-gradient-to-br from-chart-1 to-blue-700 text-primary-foreground shadow-[0_12px_28px_-6px_rgba(37,99,235,0.55)] transition-all duration-300 hover:scale-105 hover:shadow-[0_16px_34px_-4px_rgba(37,99,235,0.65)] active:scale-95 active:shadow-[0_6px_16px_-4px_rgba(37,99,235,0.5)] disabled:opacity-60 disabled:animate-none animate-button-float"
              aria-label="Start new meeting"
            >
              {!startMutation.isPending && (
                <>
                  <span className="absolute inset-0 rounded-full bg-chart-1/40 animate-ring-pulse" />
                  <span
                    className="absolute inset-0 rounded-full bg-chart-1/40 animate-ring-pulse"
                    style={{ animationDelay: '1.5s' }}
                  />
                </>
              )}
              <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 via-white/0 to-black/10" />
              <Video className="relative h-7 w-7" />
            </button>
            <p className="text-lg font-semibold text-foreground">
              {startMutation.isPending ? 'Starting meeting…' : 'Start New Meeting'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
