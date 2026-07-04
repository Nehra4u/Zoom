import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getStoredAccessToken } from '@/api/client'
import { useSessionStore } from '@/stores/sessionStore'
import type { ActiveMeeting, SessionParticipant } from '@/types/session'

export function useAdminSocket(enabled = true) {
  const socketRef = useRef<Socket | null>(null)
  const queryClient = useQueryClient()
  const {
    upsertParticipant,
    removeParticipant,
    updateMute,
    clearSession,
    setMeetingStarted,
    setSocketConnected,
  } = useSessionStore()

  useEffect(() => {
    if (!enabled) return

    const token = getStoredAccessToken()
    if (!token) return

    const socket = io('/admin', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setSocketConnected(true)
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
    })
    socket.on('disconnect', () => setSocketConnected(false))
    socket.on('connect_error', () => setSocketConnected(false))

    socket.on('session:started', (payload: { meeting: ActiveMeeting }) => {
      if (payload?.meeting) {
        setMeetingStarted(payload.meeting)
      }
    })

    socket.on('participant:joined', (payload: SessionParticipant) => {
      upsertParticipant({ ...payload, inCall: true })
    })

    socket.on('participant:left', (payload: { userId: string }) => {
      removeParticipant(payload.userId)
    })

    socket.on('participant:muted', (payload: { userId: string; isMuted?: boolean }) => {
      updateMute(payload.userId, payload.isMuted ?? true)
    })

    socket.on('participant:unmuted', (payload: { userId: string }) => {
      updateMute(payload.userId, false)
    })

    socket.on('session:ended', () => {
      clearSession()
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
    })

    socket.on('recording:available', (payload: { topic?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      toast.success(
        payload.topic
          ? `Recording ready: ${payload.topic}. Open Recordings to play.`
          : 'Recording ready — open Recordings to play.',
        {
          action: {
            label: 'Recordings',
            onClick: () => {
              window.location.href = '/recordings'
            },
          },
        }
      )
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setSocketConnected(false)
    }
  }, [
    enabled,
    upsertParticipant,
    removeParticipant,
    updateMute,
    clearSession,
    setMeetingStarted,
    setSocketConnected,
    queryClient,
  ])

  return socketRef
}
