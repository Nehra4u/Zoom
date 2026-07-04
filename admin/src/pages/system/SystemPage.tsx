import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, CheckCircle2, Film, Save, Server, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { fetchHealth } from '@/api/health'
import { fetchSystemSettings, updateRecordingRetention } from '@/api/settings'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'success' : 'destructive'} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  )
}

export function SystemPage() {
  const { isSuperAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [retentionDays, setRetentionDays] = useState('')

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: fetchSystemSettings,
    enabled: isSuperAdmin,
  })

  useEffect(() => {
    if (settings?.recordingRetentionDays != null) {
      setRetentionDays(String(settings.recordingRetentionDays))
    } else {
      setRetentionDays('')
    }
  }, [settings?.recordingRetentionDays])

  const retentionMutation = useMutation({
    mutationFn: () => {
      const trimmed = retentionDays.trim()
      const value = trimmed === '' ? null : Number(trimmed)
      return updateRecordingRetention(value)
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['system-settings'], {
        recordingRetentionDays: result.recordingRetentionDays,
        updatedAt: result.updatedAt,
      })
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      const retentionLabel =
        result.recordingRetentionDays != null
          ? `Retention set to ${result.recordingRetentionDays} day${result.recordingRetentionDays === 1 ? '' : 's'}`
          : 'Recording retention disabled'
      const cloudLabel =
        result.removedFromCloud > 0
          ? ` — deleted ${result.removedFromCloud} from Zoom cloud`
          : ''
      const errorLabel =
        result.cloudErrors > 0 ? ` (${result.cloudErrors} Zoom delete error${result.cloudErrors === 1 ? '' : 's'})` : ''
      toast.success(`${retentionLabel}${cloudLabel}${errorLabel}`)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const reconcileOk =
    data?.reconciliation?.lastRunStatus === 'ok' || data?.reconciliation?.lastRunStatus === 'skipped_mock'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">System Status</h1>
        <p className="text-muted-foreground">Backend health and platform configuration</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : isError ? (
        <Card>
          <CardContent className="pt-6">
            <StatusBadge ok={false} label="Backend unreachable" />
            <p className="mt-2 text-sm text-muted-foreground">Ensure the backend is running on port 3001.</p>
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
              <StatusBadge ok={reconcileOk} label={data?.reconciliation?.lastRunStatus ?? 'unknown'} />
              {data?.reconciliation?.lastRunAt && (
                <p className="text-xs text-muted-foreground">
                  Last run: {new Date(data.reconciliation.lastRunAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Recording retention
            </CardTitle>
            <CardDescription>
              Permanently delete cloud recordings in Zoom older than this window. The portal list is kept in sync
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings…</p>
            ) : (
              <>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="retention-days">Keep recordings for (days)</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="e.g. 7 — leave empty to keep all"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: <strong>7</strong> keeps only the last 7 days in Zoom cloud. Older recordings are
                    permanently deleted from Zoom and removed from the portal hourly and on sync/list.
                  </p>
                </div>
                {settings?.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(settings.updatedAt).toLocaleString()}
                    {settings.recordingRetentionDays != null
                      ? ` · currently ${settings.recordingRetentionDays} day${settings.recordingRetentionDays === 1 ? '' : 's'}`
                      : ' · retention disabled'}
                  </p>
                )}
                <Button disabled={retentionMutation.isPending} onClick={() => retentionMutation.mutate()}>
                  <Save className="h-4 w-4" />
                  {retentionMutation.isPending ? 'Saving…' : 'Save retention policy'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
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
