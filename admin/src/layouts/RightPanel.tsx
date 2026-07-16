import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserRound, Users } from 'lucide-react'
import { fetchUsers } from '@/api/users'
import { fetchHealth } from '@/api/health'
import { useAuth } from '@/auth/AuthContext'
import { resolveUsername } from '@/lib/userDisplay'
import { useSessionStore } from '@/stores/sessionStore'

const MIN_SAMPLES = 3
const EMA_ALPHA = 0.25
const MIN_DISPLAY_MS = 5
const MAX_DISPLAY_MS = 500

function clampLatency(ms: number) {
  return Math.min(MAX_DISPLAY_MS, Math.max(MIN_DISPLAY_MS, ms))
}

export function RightPanel() {
  const { isSuperAdmin } = useAuth()
  const [latencyEma, setLatencyEma] = useState<number | null>(null)
  const [sampleCount, setSampleCount] = useState(0)
  const socketConnected = useSessionStore((s) => s.socketConnected)
  const showUserStats = !isSuperAdmin

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
    enabled: showUserStats,
    refetchInterval: showUserStats ? (socketConnected ? false : 30_000) : false,
  })

  useQuery({
    queryKey: ['health', 'right-panel'],
    queryFn: async () => {
      const start = performance.now()
      const result = await fetchHealth()
      const durationMs = Math.round(performance.now() - start)
      setSampleCount((prev) => prev + 1)
      setLatencyEma((prev) => {
        if (prev === null) return durationMs
        return Math.round(prev * (1 - EMA_ALPHA) + durationMs * EMA_ALPHA)
      })
      return result
    },
    refetchInterval: 30_000,
  })

  const displayLatency = useMemo(() => {
    if (sampleCount < MIN_SAMPLES || latencyEma === null) return null
    return clampLatency(latencyEma)
  }, [latencyEma, sampleCount])

  const activeUsers = useMemo(
    () => (showUserStats ? (usersQuery.data ?? []).filter((u) => u.isOnline) : []),
    [showUserStats, usersQuery.data]
  )

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col overflow-hidden border-l border-white/70 bg-card/66 shadow-[-12px_0_40px_-34px_rgba(30,64,175,0.35)] backdrop-blur-2xl">
      <div className="border-b border-white/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">System Status</h3>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Operational
          </span>
        </div>
        <div className={showUserStats ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
          {showUserStats && (
            <div className="rounded-xl border border-white/70 bg-white/45 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-1 whitespace-nowrap text-[9.5px] uppercase tracking-wide text-muted-foreground">
                Active Users
              </p>
              <p className="text-base font-semibold text-foreground">
                {usersQuery.isLoading ? '—' : activeUsers.length}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-white/70 bg-white/45 p-3 shadow-sm backdrop-blur-md">
            <p className="mb-1 whitespace-nowrap text-[9.5px] uppercase tracking-wide text-muted-foreground">
              API Latency
            </p>
            <p className="text-base font-semibold text-foreground">
              {displayLatency !== null ? `${displayLatency}ms` : '—'}
            </p>
          </div>
        </div>
      </div>

      {showUserStats && (
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            Active Users
          </h3>

          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : activeUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active users right now.</p>
          ) : (
            <div className="space-y-2">
              {activeUsers.map((user) => (
                <div
                  key={user.id}
                  className="-mx-2 flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-white/70 hover:bg-white/45"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-1/20">
                    <UserRound className="h-[18px] w-[18px] text-chart-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {resolveUsername(user) || 'Unknown user'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.phone || 'No phone on file'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
