import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCurrentSession } from '@/api/session'
import { useSessionStore } from '@/stores/sessionStore'

export function useSessionSync() {
  const { socketConnected, meetingLive, setSnapshot } = useSessionStore()

  const sessionQuery = useQuery({
    queryKey: ['session', 'current'],
    queryFn: fetchCurrentSession,
    refetchInterval: socketConnected ? false : meetingLive ? 10_000 : 30_000,
  })

  useEffect(() => {
    if (sessionQuery.data) {
      setSnapshot(sessionQuery.data)
    }
  }, [sessionQuery.data, setSnapshot])

  return sessionQuery
}
