import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Activity,
  CalendarClock,
  ClipboardList,
  Film,
  KeyRound,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  UserRound,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAuditLogs, triggerReconciliation } from '@/api/audit'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { AuditLogEntry } from '@/types/audit'

const ACTION_LABELS: Record<string, string> = {
  admin_created: 'Admin created',
  admin_updated: 'Admin updated',
  admin_deactivated: 'Admin deactivated',
  admin_activated: 'Admin activated',
  admin_deleted: 'Admin deleted',
  user_created: 'User created',
  user_updated: 'User updated',
  user_activated: 'User activated',
  user_deactivated: 'User deactivated',
  user_deleted: 'User deleted',
  user_force_dropped: 'Force dropped',
  user_logged_out: 'User logged out',
  token_issued: 'Token issued',
  token_revoked: 'Token revoked',
  recording_accessed: 'Recording accessed',
  recording_removed: 'Recording removed',
  recording_expired: 'Recording expired',
  settings_updated: 'Settings updated',
  meeting_started: 'Meeting started',
  meeting_ended: 'Meeting ended',
  participant_removed: 'Participant removed',
}

type AuditCategory = 'all' | 'people' | 'meetings' | 'security' | 'system'

const CATEGORY_OPTIONS: { value: AuditCategory; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'people', label: 'People & access' },
  { value: 'meetings', label: 'Meetings & recordings' },
  { value: 'security', label: 'Authentication' },
  { value: 'system', label: 'System changes' },
]

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

function actionCategory(action: string): AuditCategory {
  if (action.startsWith('meeting_') || action.startsWith('recording_') || action === 'participant_removed') {
    return 'meetings'
  }
  if (action.startsWith('token_') || action === 'user_logged_out') return 'security'
  if (action.startsWith('admin_') || action.startsWith('user_')) return 'people'
  return 'system'
}

function actionVisual(action: string): { icon: LucideIcon; iconClass: string; surfaceClass: string } {
  if (action.startsWith('meeting_')) {
    return { icon: Video, iconClass: 'text-chart-1', surfaceClass: 'bg-chart-1/10' }
  }
  if (action.startsWith('recording_')) {
    return { icon: Film, iconClass: 'text-violet-600', surfaceClass: 'bg-violet-500/10' }
  }
  if (action.startsWith('token_') || action === 'user_logged_out') {
    return { icon: KeyRound, iconClass: 'text-amber-700', surfaceClass: 'bg-amber-500/12' }
  }
  if (action.startsWith('admin_')) {
    return { icon: ShieldCheck, iconClass: 'text-indigo-600', surfaceClass: 'bg-indigo-500/10' }
  }
  if (action.startsWith('user_') || action === 'participant_removed') {
    return { icon: UserCog, iconClass: 'text-emerald-700', surfaceClass: 'bg-emerald-500/10' }
  }
  return { icon: Settings, iconClass: 'text-muted-foreground', surfaceClass: 'bg-muted' }
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  return {
    date: date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
  }
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`
  return formatTimestamp(iso).date
}

function targetDetails(log: AuditLogEntry) {
  if (log.targetUserId) {
    return { name: log.targetUserName ?? 'Unknown user', detail: log.targetUserPhone ?? 'No phone' }
  }
  if (log.targetAdminId) {
    return { name: log.targetAdminName ?? 'Unknown admin', detail: 'Administrator' }
  }
  return { name: 'System', detail: 'No direct target' }
}

function initials(name: string | null) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function AuditLogPage() {
  const { isSuperAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AuditCategory>('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => fetchAuditLogs({ limit: 200 }),
  })

  const reconcileMutation = useMutation({
    mutationFn: triggerReconciliation,
    onSuccess: () => {
      toast.success('Reconciliation completed')
      refetch()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const logs = useMemo(() => data?.logs ?? [], [data?.logs])
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs.filter((log) => {
      if (category !== 'all' && actionCategory(log.action) !== category) return false
      if (!query) return true
      const target = targetDetails(log)
      return [
        actionLabel(log.action),
        log.action,
        log.actorName,
        log.actorEmail,
        target.name,
        target.detail,
      ].some((value) => value?.toLowerCase().includes(query))
    })
  }, [category, logs, search])

  const todayCount = useMemo(() => {
    const today = new Date().toDateString()
    return logs.filter((log) => new Date(log.createdAt).toDateString() === today).length
  }, [logs])
  const actorCount = useMemo(() => new Set(logs.map((log) => log.actorId)).size, [logs])

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Total events', value: logs.length, icon: Activity, tone: 'text-chart-1 bg-chart-1/10' },
          { label: 'Activity today', value: todayCount, icon: CalendarClock, tone: 'text-emerald-700 bg-emerald-500/10' },
          { label: 'Active administrators', value: actorCount, icon: ShieldCheck, tone: 'text-violet-700 bg-violet-500/10' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="gap-0 py-4">
            <CardContent className="flex items-center gap-3 px-4">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone)}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{isLoading ? '—' : value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-white/70 bg-white/25 py-5">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-chart-1/10 text-chart-1">
                <ClipboardList className="h-4 w-4" />
              </span>
              Activity history
            </CardTitle>
            <CardDescription className="mt-1.5">
              {data?.scope === 'all' ? 'Actions across every administrator' : 'Actions performed by your account'}
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              disabled={reconcileMutation.isPending}
              onClick={() => reconcileMutation.mutate()}
            >
              <RefreshCw className={cn('h-4 w-4', reconcileMutation.isPending && 'animate-spin')} />
              {reconcileMutation.isPending ? 'Checking…' : 'Run reconciliation'}
            </Button>
          )}
        </CardHeader>

        <div className="flex flex-col gap-3 border-b border-white/70 bg-white/15 px-6 py-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search administrator, event, or target…"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as AuditCategory)}
            aria-label="Filter activity category"
            className="h-10 cursor-pointer rounded-xl border border-white/80 bg-white/60 px-3 text-sm font-medium text-foreground shadow-sm outline-none backdrop-blur-md transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Badge variant="secondary" className="h-8 px-3">
            {filteredLogs.length} shown
          </Badge>
        </div>

        <CardContent className="px-0 pb-2 pt-0">
          {isLoading ? (
            <div className="flex items-center gap-2 px-6 py-12 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Search className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">No matching events</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different search or activity category.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                }}
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/25 hover:bg-muted/25">
                  <TableHead className="pl-6">Event</TableHead>
                  <TableHead>Administrator</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="pr-6 text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const visual = actionVisual(log.action)
                  const Icon = visual.icon
                  const target = targetDetails(log)
                  const timestamp = formatTimestamp(log.createdAt)
                  return (
                    <TableRow key={log.id} className="group">
                      <TableCell className="py-3 pl-6">
                        <div className="flex items-center gap-3">
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', visual.surfaceClass, visual.iconClass)}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="whitespace-nowrap text-sm font-semibold text-foreground">{actionLabel(log.action)}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{log.action}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chart-1/10 text-[10px] font-bold text-chart-1">
                            {initials(log.actorName)}
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-44 truncate text-sm font-medium text-foreground">{log.actorName ?? 'Unknown'}</p>
                            <p className="max-w-44 truncate text-[11px] text-muted-foreground">{log.actorEmail ?? log.actorRole}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="max-w-48 truncate text-sm text-foreground">{target.name}</p>
                            <p className="max-w-48 truncate text-[11px] text-muted-foreground">{target.detail}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 pr-6 text-right">
                        <p className="whitespace-nowrap text-xs font-medium text-foreground">{relativeTime(log.createdAt)}</p>
                        <p className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
                          {timestamp.date} · {timestamp.time}
                        </p>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
