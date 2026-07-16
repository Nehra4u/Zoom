import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, LogOut, Plus, Search } from 'lucide-react'
import { fetchUsers } from '@/api/users'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { MAX_USERS } from '@/types/user'
import type { ApkUser } from '@/types/user'
import { UserCreateDialog } from './UserCreateDialog'
import { UserEditDialog } from './UserEditDialog'
import { UserStatusDialog } from './UserStatusDialog'

type FilterKey = 'all' | 'active' | 'pending' | 'inactive' | 'logged_out'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'inactive', label: 'Deactivated' },
  { key: 'logged_out', label: 'Logged Out' },
]

function displayUsername(user: ApkUser) {
  return user.username ?? user.name ?? user.email ?? 'Unknown user'
}

function initials(name?: string | null) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatLastSeen(iso: string | null, isOnline: boolean) {
  if (isOnline) return 'Active now'
  if (!iso) return 'Never active'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function UserListPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [editingUser, setEditingUser] = useState<ApkUser | null>(null)
  const [statusUser, setStatusUser] = useState<ApkUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const socketConnected = useSessionStore((s) => s.socketConnected)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
    refetchInterval: socketConnected ? false : 30_000,
  })

  function handleSearchChange(value: string) {
    setSearch(value)
    // Searching spans every status; clearing the box naturally lands back on "All".
    setFilter('all')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((user) => {
      if (filter === 'logged_out' && !user.device?.loggedOut) return false
      if (filter !== 'all' && filter !== 'logged_out' && user.status !== filter) return false
      if (!q) return true
      const username = displayUsername(user).toLowerCase()
      return (
        username.includes(q) ||
        (user.email ?? '').toLowerCase().includes(q) ||
        (user.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, filter, search])

  const atLimit = users.length >= MAX_USERS

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search users by username or phone"
            className="w-full rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {users.length} / {MAX_USERS} users
          </span>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={atLimit}
            title={atLimit ? `User limit of ${MAX_USERS} reached` : undefined}
          >
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {users.length === 0
            ? 'No users yet. Create the first APK client account.'
            : 'No users match your search or filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => {
            const isDeactivated = user.status === 'inactive'
            const isLoggedOut = Boolean(user.device?.loggedOut) && !isDeactivated
            const isGreyedOut = isDeactivated || isLoggedOut

            const avatarBlock = (
              <div className={cn('flex min-w-0 items-center gap-4', isGreyedOut && 'opacity-60')}>
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chart-1/15 text-sm font-medium text-chart-1">
                  {initials(displayUsername(user))}
                  {user.isOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{displayUsername(user)}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.phone || 'No phone on file'}</p>
                </div>
              </div>
            )

            const actionButtons = (
              <div className={cn('flex shrink-0 items-center gap-2', isGreyedOut && 'opacity-60')}>
                <Button size="sm" variant="outline" onClick={() => setEditingUser(user)}>
                  Edit Profile
                </Button>
                <Button size="sm" onClick={() => setStatusUser(user)}>
                  Update Status
                </Button>
              </div>
            )

            if (isGreyedOut) {
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-xl border border-[oklch(0.85_0.006_250)] bg-[oklch(0.9_0.004_250)] p-4 transition-colors"
                >
                  <div className="justify-self-start">{avatarBlock}</div>
                  <div className="hidden items-center gap-2 justify-self-center sm:flex">
                    {isDeactivated ? (
                      <Ban className="h-4 w-4 text-foreground" />
                    ) : (
                      <LogOut className="h-4 w-4 text-foreground" />
                    )}
                    <p className="text-sm font-bold text-foreground">
                      {isDeactivated ? 'Deactivated' : 'Logged Out'}
                    </p>
                  </div>
                  <div className="justify-self-end">{actionButtons}</div>
                </div>
              )
            }

            return (
              <div
                key={user.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">{avatarBlock}</div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last seen</p>
                  <p className="text-sm font-medium text-foreground">{formatLastSeen(user.lastSeenAt, user.isOnline)}</p>
                </div>
                {actionButtons}
              </div>
            )
          })}
        </div>
      )}

      <UserCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} atLimit={atLimit} />
      <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} />
      <UserStatusDialog user={statusUser} onClose={() => setStatusUser(null)} />
    </div>
  )
}
