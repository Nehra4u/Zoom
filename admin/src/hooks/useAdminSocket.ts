import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredSessionId,
  TOKEN_REFRESH_EVENT,
} from '@/api/client'
import { API_BASE_URL } from '@/config'
import { useSessionStore } from '@/stores/sessionStore'
import type { ActiveMeeting, SessionParticipant } from '@/types/session'

import type { ApkUser } from '@/types/user'

function handleSessionRevoked() {
  clearStoredTokens()
  useSessionStore.getState().reset()
  toast.error('Logged in from another device')
  window.location.href = '/login'
}

function shouldLogoutOnRevoke(activeSessionId?: string) {
  const mySessionId = getStoredSessionId()
  if (!activeSessionId || !mySessionId) return true
  return mySessionId !== activeSessionId
}

function handleSubscriptionExpired() {
  clearStoredTokens()
  useSessionStore.getState().reset()
  toast.error('Your subscription has ended. Please contact Administration for reactivating.')
  window.location.href = '/login'
}

export function useAdminSocket(enabled = true) {
  const socketRef = useRef<Socket | null>(null)
  const queryClient = useQueryClient()
  const accessToken = getStoredAccessToken()
  const {
    upsertParticipant,
    removeParticipant,
    updateMute,
    clearSession,
    setMeetingStarted,
    setSocketConnected,
  } = useSessionStore()

  useEffect(() => {
    if (!enabled || !accessToken) return

    const socket = io(API_BASE_URL ? `${API_BASE_URL}/admin` : '/admin', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socketRef.current = socket

    const refreshAuth = () => {
      const token = getStoredAccessToken()
      if (token) {
        socket.auth = { token }
      }
    }

    socket.on('connect', () => {
      setSocketConnected(true)
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
    })
    socket.on('disconnect', () => setSocketConnected(false))
    socket.on('connect_error', () => setSocketConnected(false))

    socket.io.on('reconnect_attempt', refreshAuth)

    socket.on('admin:session:revoked', (payload: { activeSessionId?: string }) => {
      if (!shouldLogoutOnRevoke(payload?.activeSessionId)) return
      socket.disconnect()
      handleSessionRevoked()
    })

    socket.on('admin:subscription:expired', () => {
      socket.disconnect()
      handleSubscriptionExpired()
    })

    socket.on('user:presence', (payload: { userId?: string; isOnline?: boolean }) => {
      if (!payload?.userId) return
      const { userId, isOnline } = payload

      queryClient.setQueryData<ApkUser[]>(['users'], (current) => {
        if (!current) return current
        return current.map((user) =>
          user.id === userId ? { ...user, isOnline: Boolean(isOnline) } : user
        )
      })

      queryClient.setQueryData<ApkUser>(['users', userId], (current) => {
        if (!current) return current
        return { ...current, isOnline: Boolean(isOnline) }
      })
    })

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

    function onTokenRefreshed() {
      refreshAuth()
      if (!socket.connected) {
        socket.connect()
      }
    }

    window.addEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)

    return () => {
      window.removeEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)
      socket.disconnect()
      socketRef.current = null
      setSocketConnected(false)
    }
  }, [
    enabled,
    accessToken,
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
