import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserRound, Users } from 'lucide-react'
import { fetchUsers } from '@/api/users'
import { fetchHealth } from '@/api/health'
import { useSessionStore } from '@/stores/sessionStore'

const MAX_LATENCY_SAMPLES = 20

function percentile95(samples: number[]): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)
  return sorted[index]
}

export function RightPanel() {
  const [latencySamples, setLatencySamples] = useState<number[]>([])
  const socketConnected = useSessionStore((s) => s.socketConnected)

  // "Active" here means genuinely online right now (isOnline, via a live websocket) —
  // not just an "Activated" (status === 'active') account. Fetch everyone and filter
  // client-side since isOnline isn't a server-side query filter.
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
    refetchInterval: socketConnected ? false : 30_000,
  })

  useQuery({
    queryKey: ['health', 'right-panel'],
    queryFn: async () => {
      const start = performance.now()
      const result = await fetchHealth()
      const durationMs = Math.round(performance.now() - start)
      setLatencySamples((prev) => [...prev.slice(-(MAX_LATENCY_SAMPLES - 1)), durationMs])
      return result
    },
    refetchInterval: 30_000,
  })

  const p95Latency = useMemo(() => percentile95(latencySamples), [latencySamples])
  const activeUsers = useMemo(() => (usersQuery.data ?? []).filter((u) => u.isOnline), [usersQuery.data])

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col overflow-hidden border-l border-white/70 bg-card/66 shadow-[-12px_0_40px_-34px_rgba(30,64,175,0.35)] backdrop-blur-2xl">
      {/* System Status */}
      <div className="border-b border-white/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">System Status</h3>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Operational
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/70 bg-white/45 p-3 shadow-sm backdrop-blur-md">
            <p className="mb-1 whitespace-nowrap text-[9.5px] uppercase tracking-wide text-muted-foreground">
              Active Users
            </p>
            <p className="text-base font-semibold text-foreground">
              {usersQuery.isLoading ? '—' : activeUsers.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/45 p-3 shadow-sm backdrop-blur-md">
            <p className="mb-1 whitespace-nowrap text-[9.5px] uppercase tracking-wide text-muted-foreground">
              P95 Latency
            </p>
            <p className="text-base font-semibold text-foreground">
              {p95Latency !== null ? `${p95Latency}ms` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Active Users */}
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
              <div key={user.id} className="-mx-2 flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-white/70 hover:bg-white/45">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-1/20">
                  <UserRound className="h-[18px] w-[18px] text-chart-1" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.phone || 'No phone on file'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
