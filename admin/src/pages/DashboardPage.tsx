import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, ShieldCheck, Video, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { fetchMeetingJoinUrl, startMeeting } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { StartMeetingDialog } from '@/components/StartMeetingDialog'
import { useSessionStore, type MeetingJoinMode } from '@/stores/sessionStore'
import type { ActiveMeeting } from '@/types/session'

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

function apply409Meeting(
  data: { meeting?: ActiveMeeting; code?: string } | undefined,
  applyLiveMeeting: ReturnType<typeof useSessionStore.getState>['applyLiveMeeting']
) {
  if (!data?.meeting) return
  applyLiveMeeting(data.meeting, {
    canEndMeeting: true,
    meetingOwnedByMe: data.code === 'MEETING_ALREADY_LIVE',
  })
}

function buildZoomOpenUrl(data: Awaited<ReturnType<typeof fetchMeetingJoinUrl>>) {
  if (data.isHost && data.startUrl) return data.startUrl
  if (data.joinUrl) return data.joinUrl
  const base = `https://zoom.us/j/${data.meetingNumber}`
  return data.password ? `${base}?pwd=${encodeURIComponent(data.password)}` : base
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => new Date())
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const { meetingLive, applyLiveMeeting, joinMode, setJoinMode } = useSessionStore()

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
  }

  const startMutation = useMutation({
    mutationFn: startMeeting,
    onSuccess: async (started) => {
      invalidateSession()
      toast.success(`Meeting started — ID ${started.meetingNumber}`)

      if (useSessionStore.getState().joinMode === 'desktop') {
        try {
          const joinInfo = await fetchMeetingJoinUrl()
          const url = buildZoomOpenUrl(joinInfo)
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch {
          toast.info('Meeting started — use the join card on the dashboard to open Zoom')
        }
      }
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        apply409Meeting(
          err.response.data as { meeting?: ActiveMeeting; code?: string },
          applyLiveMeeting
        )
        invalidateSession()
        const code = (err.response.data as { code?: string })?.code
        if (code === 'ZOOM_HOST_BUSY') {
          toast.info('A meeting is already live on your Zoom account — joining that session')
        } else {
          toast.info('You already have a live meeting')
        }
        return
      }
      if (axios.isAxiosError(err)) {
        const code = (err.response?.data as { code?: string })?.code
        if (code === 'ZOOM_LICENSE_REQUIRED') {
          toast.error('Zoom license not assigned — contact super admin')
          return
        }
      }
      toast.error(getErrorMessage(err))
    },
  })

  function handleStartConfirm(mode: MeetingJoinMode) {
    setJoinMode(mode)
    startMutation.mutate(undefined, {
      onSettled: () => setStartDialogOpen(false),
    })
  }

  if (meetingLive) {
    return null
  }

  return (
    <>
      <div className="relative flex min-h-full items-center justify-center py-6">
        <section className="glass-card relative w-full max-w-4xl overflow-hidden rounded-[2rem] p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-chart-1/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-12 h-64 w-64 rounded-full bg-violet-300/20 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-success/15 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Workspace ready
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-chart-1">
                {formatDate(now)}
              </p>
              <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em] text-foreground sm:text-5xl">
                {formatTime(now)}
              </h2>
              <h3 className="mt-7 max-w-md text-2xl font-bold leading-tight tracking-[-0.035em] text-foreground">
                Ready for your next secure meeting?
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                Start a protected ZoomMeets session and connected users will be notified automatically.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: ShieldCheck, title: 'Protected', detail: 'Secure session' },
                  { icon: Wifi, title: 'Connected', detail: 'Realtime sync' },
                  { icon: CalendarDays, title: 'Available', detail: 'Start anytime' },
                ].map(({ icon: Icon, title, detail }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/80 bg-white/48 p-3.5 shadow-sm backdrop-blur-xl"
                  >
                    <Icon className="h-4 w-4 text-chart-1" />
                    <p className="mt-2 text-xs font-bold text-foreground">{title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/48 px-6 py-8 shadow-[0_24px_45px_-32px_rgba(37,99,235,0.5)] backdrop-blur-xl">
              <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full">
                {!startMutation.isPending && (
                  <>
                    <span className="absolute h-24 w-24 rounded-full border border-chart-1/35 bg-chart-1/15 animate-ring-pulse" />
                    <span
                      className="absolute h-24 w-24 rounded-full border border-chart-1/35 bg-chart-1/15 animate-ring-pulse"
                      style={{ animationDelay: '1.5s' }}
                    />
                  </>
                )}
                <button
                  type="button"
                  disabled={startMutation.isPending}
                  onClick={() => setStartDialogOpen(true)}
                  className="group relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-chart-1 to-indigo-600 text-primary-foreground shadow-[0_18px_38px_-8px_rgba(37,99,235,0.58)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_46px_-8px_rgba(37,99,235,0.65)] active:translate-y-0 active:shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] disabled:cursor-not-allowed disabled:opacity-60 disabled:animate-none animate-button-float"
                  aria-label="Start new meeting"
                >
                  <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/35 via-white/0 to-blue-950/10" />
                  <Video className="relative h-9 w-9" />
                </button>
              </div>
              <p className="mt-7 text-lg font-bold text-foreground">
                {startMutation.isPending ? 'Starting meeting…' : 'Start New Meeting'}
              </p>
              <p className="mt-1 text-center text-xs leading-5 text-muted-foreground">
                Choose portal or Zoom app, then launch
              </p>
            </div>
          </div>
        </section>
      </div>

      <StartMeetingDialog
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
        onConfirm={handleStartConfirm}
        isStarting={startMutation.isPending}
        initialJoinMode={joinMode}
      />
    </>
  )
}
