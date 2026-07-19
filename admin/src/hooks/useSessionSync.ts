import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCurrentSession } from '@/api/session'
import { useSessionStore } from '@/stores/sessionStore'

export function useSessionSync(enabled = true) {
  const socketConnected = useSessionStore((s) => s.socketConnected)
  const meetingLive = useSessionStore((s) => s.meetingLive)
  const joinMode = useSessionStore((s) => s.joinMode)
  const setSnapshot = useSessionStore((s) => s.setSnapshot)

  const pollInterval =
    enabled && meetingLive
      ? joinMode === 'desktop'
        ? 5_000
        : 10_000
      : enabled && !socketConnected
        ? 30_000
        : false

  const sessionQuery = useQuery({
    queryKey: ['session', 'current'],
    queryFn: fetchCurrentSession,
    enabled,
    refetchInterval: pollInterval,
  })

  useEffect(() => {
    if (!enabled || !sessionQuery.data) return
    setSnapshot(sessionQuery.data)
  }, [enabled, sessionQuery.data, setSnapshot])

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = useSessionStore.subscribe((state, prev) => {
      if (
        prev.meetingLive &&
        !state.meetingLive &&
        prev.joinMode === 'desktop' &&
        !state.desktopEndedDialogOpen
      ) {
        useSessionStore.getState().setDesktopEndedDialogOpen(true)
      }
    })

    return unsubscribe
  }, [enabled])

  return sessionQuery
}
