import { useQuery, useMutation } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAuditLogs, triggerReconciliation } from '@/api/audit'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  settings_updated: 'Settings updated',
  meeting_started: 'Meeting started',
  meeting_ended: 'Meeting ended',
  participant_removed: 'Participant removed',
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const day = String(date.getDate()).padStart(2, '0')
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`
}

function targetLabel(log: AuditLogEntry) {
  if (log.targetUserId) {
    return `${log.targetUserName ?? 'Unknown'} (${log.targetUserPhone ?? 'no phone'})`
  }
  if (log.targetAdminId) {
    return log.targetAdminName ?? 'Unknown admin'
  }
  return '—'
}

export function AuditLogPage() {
  const { isSuperAdmin } = useAuth()

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

  const logs = data?.logs ?? []

  return (
    <div className="space-y-6">
      {isSuperAdmin && (
        <div className="flex items-start justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={reconcileMutation.isPending}
            onClick={() => reconcileMutation.mutate()}
          >
            Run reconciliation
          </Button>
        </div>
      )}

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Recent events
          </CardTitle>
          <CardDescription>
            {logs.length} event{logs.length !== 1 ? 's' : ''}
            {data?.scope === 'all' ? ' (all admins)' : ' (your actions)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {formatTimestamp(log.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">
                      {log.actorName ?? 'Unknown'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {actionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                      {targetLabel(log)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
