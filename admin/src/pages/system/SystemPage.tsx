import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Server, XCircle } from 'lucide-react'
import { fetchHealth } from '@/api/health'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'success' : 'destructive'} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  )
}

export function SystemPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  const reconcileOk = data?.reconciliation?.lastRunStatus === 'ok' || data?.reconciliation?.lastRunStatus === 'skipped_mock';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">System Status</h1>
        <p className="text-muted-foreground">Backend health and reconciliation status</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : isError ? (
        <Card>
          <CardContent className="pt-6">
            <StatusBadge ok={false} label="Backend unreachable" />
            <p className="mt-2 text-sm text-muted-foreground">
              Ensure the backend is running on port 3001.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                API Server
              </CardTitle>
              <CardDescription>{data?.service}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusBadge ok={data?.ok ?? false} label={data?.ok ? 'Healthy' : 'Down'} />
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(dataUpdatedAt).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Reconciliation
              </CardTitle>
              <CardDescription>Zoom participant sync (every 60s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusBadge
                ok={reconcileOk}
                label={data?.reconciliation?.lastRunStatus ?? 'unknown'}
              />
              {data?.reconciliation?.lastRunAt && (
                <p className="text-xs text-muted-foreground">
                  Last run: {new Date(data.reconciliation.lastRunAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <CardDescription>Frontend configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-sm">
          <p>
            <span className="text-muted-foreground">Mode:</span>{' '}
            {import.meta.env.DEV ? 'development' : 'production'}
          </p>
          <p>
            <span className="text-muted-foreground">API proxy:</span> /api → localhost:3001
          </p>
          <p>
            <span className="text-muted-foreground">WebSocket:</span> /admin namespace
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
