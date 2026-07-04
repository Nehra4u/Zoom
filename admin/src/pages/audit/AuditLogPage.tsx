import { useQuery, useMutation } from '@tanstack/react-query'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAuditLogs, triggerReconciliation } from '@/api/audit'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin
              ? 'All platform actions across admins and users'
              : 'Your actions only'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              disabled={reconcileMutation.isPending}
              onClick={() => reconcileMutation.mutate()}
            >
              Run reconciliation
            </Button>
          )}
        </div>
      </div>

      <Card>
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
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{log.actorName ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{log.actorEmail}</p>
                      </div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {log.actorRole.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{actionLabel(log.action)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.targetUserId && <span>User: {log.targetUserId.slice(-6)}</span>}
                      {log.targetAdminId && <span>Admin: {log.targetAdminId.slice(-6)}</span>}
                      {!log.targetUserId && !log.targetAdminId && '—'}
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
