import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Film, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteRecording,
  downloadRecording,
  fetchRecordings,
  fetchRecordingPlayUrl,
  syncRecordingsFromZoom,
} from '@/api/recordings'
import { getErrorMessage } from '@/api/client'
import { ExpiryCountdown } from '@/components/ExpiryCountdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Recording } from '@/types/recording'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeFileName(topic: string, fileType: string) {
  const base = topic.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'recording'
  const ext = fileType.toLowerCase() || 'mp4'
  return `${base}.${ext}`
}

function RecordingsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="hidden sm:grid sm:grid-cols-[2fr_1.5fr_1.25fr_1fr_0.75fr_7rem] sm:gap-4 sm:px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={`head-${i}`} className="h-4 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 sm:grid-cols-[2fr_1.5fr_1.25fr_1fr_0.75fr_7rem] sm:items-center sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0"
          >
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-20 justify-self-end rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RecordingLoadingDialog({
  open,
  action,
  passcode,
}: {
  open: boolean
  action: 'play' | 'download' | null
  passcode: string | null
}) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Loading recording…</DialogTitle>
          <DialogDescription>
            {action === 'download'
              ? 'Fetching a secure download from Zoom cloud.'
              : 'Preparing playback URL from Zoom cloud.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center gap-4">
            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            <Progress value={35} indeterminate />
          </div>
          {passcode && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-muted-foreground">Recording passcode (if prompted):</p>
              <code className="font-mono text-foreground">{passcode}</code>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RecordingRow({
  recording,
  onDeleted,
  onActionStart,
  onActionEnd,
}: {
  recording: Recording
  onDeleted: (id: string) => void
  onActionStart: (action: 'play' | 'download') => void
  onActionEnd: (passcode?: string | null) => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)

  const playMutation = useMutation({
    mutationFn: () => fetchRecordingPlayUrl(recording.id),
    onMutate: () => onActionStart('play'),
    onSuccess: (data) => {
      onActionEnd(data.passcode)
      window.open(data.playUrl, '_blank', 'noopener,noreferrer')
      if (data.passcode) {
        toast.success('Opening recording — passcode available if Zoom prompts')
      } else {
        toast.success('Opening recording — URL is time-limited')
      }
    },
    onError: (err) => {
      onActionEnd()
      toast.error(getErrorMessage(err))
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const meta = await fetchRecordingPlayUrl(recording.id)
      await downloadRecording(recording.id, safeFileName(recording.topic, recording.fileType))
      return meta
    },
    onMutate: () => onActionStart('download'),
    onSuccess: (data) => {
      onActionEnd(data.passcode)
      toast.success('Download started')
    },
    onError: (err) => {
      onActionEnd()
      toast.error(getErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecording(recording.id),
    onSuccess: () => {
      onDeleted(recording.id)
      setDeleteOpen(false)
      toast.success('Recording deleted from Zoom cloud and portal')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const isBusy = playMutation.isPending || downloadMutation.isPending || deleteMutation.isPending

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{recording.topic}</TableCell>
        <TableCell>{new Date(recording.startTime).toLocaleString()}</TableCell>
        <TableCell>{formatDuration(recording.duration)}</TableCell>
        <TableCell>
          <ExpiryCountdown expiresAt={recording.expiresAt} recordingId={recording.id} />
        </TableCell>
        <TableCell className="text-muted-foreground">{formatFileSize(recording.fileSize)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => playMutation.mutate()}
              aria-label={`Play ${recording.topic}`}
              title="Play recording"
            >
              {playMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => downloadMutation.mutate()}
              aria-label={`Download ${recording.topic}`}
              title="Download recording"
            >
              {downloadMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => setDeleteOpen(true)}
              aria-label={`Delete ${recording.topic}`}
              title="Delete recording"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recording?</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{recording.topic}</strong> from Zoom cloud and the admin portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RecordingListPage() {
  const queryClient = useQueryClient()
  const autoSyncedRef = useRef(false)
  const [loadingAction, setLoadingAction] = useState<'play' | 'download' | null>(null)
  const [loadingPasscode, setLoadingPasscode] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: fetchRecordings,
    staleTime: 60_000,
  })

  const recordings = data?.recordings ?? []
  const recordingRetentionDays = data?.recordingRetentionDays ?? null

  const syncMutation = useMutation({
    mutationFn: async (opts?: { manual?: boolean }) => {
      const result = await syncRecordingsFromZoom()
      return { ...result, manual: opts?.manual ?? false }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['recordings'], {
        recordings: result.recordings,
        recordingRetentionDays: result.recordingRetentionDays ?? recordingRetentionDays,
      })
      if (result.manual) {
        toast.success(
          result.synced > 0
            ? `Synced ${result.synced} recording${result.synced !== 1 ? 's' : ''} from Zoom`
            : 'No new recordings to sync from Zoom'
        )
      } else if (result.synced > 0) {
        toast.success(`Imported ${result.synced} recording${result.synced !== 1 ? 's' : ''} from Zoom`)
      }
    },
    onError: (err, variables) => {
      if (variables?.manual) toast.error(getErrorMessage(err))
    },
  })

  useEffect(() => {
    if (autoSyncedRef.current || isLoading) return
    autoSyncedRef.current = true
    if (recordings.length === 0) {
      syncMutation.mutate({ manual: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once after initial fetch
  }, [isLoading, recordings.length])

  const isSyncing = syncMutation.isPending

  function handleRecordingDeleted(id: string) {
    queryClient.setQueryData<{ recordings: Recording[]; recordingRetentionDays: number | null }>(
      ['recordings'],
      (current) => ({
        recordings: (current?.recordings ?? []).filter((recording) => recording.id !== id),
        recordingRetentionDays: current?.recordingRetentionDays ?? recordingRetentionDays,
      })
    )
  }

  function handleActionStart(action: 'play' | 'download') {
    setLoadingAction(action)
    setLoadingPasscode(null)
  }

  function handleActionEnd(passcode?: string | null) {
    setLoadingAction(null)
    if (passcode) setLoadingPasscode(passcode)
  }

  return (
    <div className="space-y-6">
      <RecordingLoadingDialog open={loadingAction !== null} action={loadingAction} passcode={loadingPasscode} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Cloud Recordings
            </CardTitle>
            {isLoading ? (
              <Skeleton className="h-4 w-64" />
            ) : (
              <CardDescription>
                {recordings.length} recording{recordings.length !== 1 ? 's' : ''}. URLs expire — click Play to fetch a
                new one.
                {recordingRetentionDays
                  ? ` Recordings are kept for ${recordingRetentionDays} day${recordingRetentionDays === 1 ? '' : 's'}.`
                  : null}
                {isSyncing && recordings.length === 0 ? (
                  <span className="ml-2 text-foreground/80">Syncing from Zoom…</span>
                ) : null}
              </CardDescription>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isSyncing}
            onClick={() => syncMutation.mutate({ manual: true })}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync from Zoom'}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <RecordingsTableSkeleton />
          ) : recordings.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              {isSyncing ? (
                <RecordingsTableSkeleton rows={4} />
              ) : (
                <>
                  <p>No recordings in the portal yet.</p>
                  <p>
                    Click <strong>Sync from Zoom</strong> to import cloud recordings from the last 30 days, or wait
                    for a <code className="text-foreground">recording.completed</code> webhook after a meeting ends.
                  </p>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((r) => (
                  <RecordingRow
                    key={r.id}
                    recording={r}
                    onDeleted={handleRecordingDeleted}
                    onActionStart={handleActionStart}
                    onActionEnd={handleActionEnd}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {import.meta.env.DEV && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About playback</CardTitle>
          </CardHeader>
          <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Play URLs include Zoom passcodes when required. Downloads are proxied through the backend with OAuth so
              you are not prompted for a password in the browser.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
