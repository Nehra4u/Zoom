import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { Video } from 'lucide-react'
import { toast } from 'sonner'
import { startMeeting } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { useSessionStore } from '@/stores/sessionStore'
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

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => new Date())
  const { meetingLive, applyLiveMeeting } = useSessionStore()

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
  }

  const startMutation = useMutation({
    mutationFn: startMeeting,
    onSuccess: (started) => {
      invalidateSession()
      toast.success(`Meeting started — ID ${started.meetingNumber}`)
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
      toast.error(getErrorMessage(err))
    },
  })

  if (meetingLive) {
    return null
  }

  return (
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
  )
}
