import { useMutation, useQuery } from '@tanstack/react-query'
import { Film, Play } from 'lucide-react'
import { toast } from 'sonner'
import { deleteRecording, fetchRecordings, fetchRecordingPlayUrl, syncRecordingsFromZoom } from '@/api/recordings'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

function RecordingsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="hidden sm:grid sm:grid-cols-[2fr_1.5fr_0.75fr_0.5fr_0.75fr_5rem] sm:gap-4 sm:px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={`head-${i}`} className="h-4 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 sm:grid-cols-[2fr_1.5fr_0.75fr_0.5fr_0.75fr_5rem] sm:items-center sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0"
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

function RecordingRow({
  recording,
  onDeleted,
}: {
  recording: Recording
  onDeleted: (id: string) => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)

  const playMutation = useMutation({
    mutationFn: () => fetchRecordingPlayUrl(recording.id),
    onSuccess: (data) => {
      window.open(data.playUrl, '_blank', 'noopener,noreferrer')
      toast.success('Opening recording — URL is time-limited')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecording(recording.id),
    onSuccess: () => {
      onDeleted(recording.id)
      setDeleteOpen(false)
      toast.success('Recording removed from portal')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{recording.topic}</TableCell>
      <TableCell>{new Date(recording.startTime).toLocaleString()}</TableCell>
      <TableCell>{formatDuration(recording.duration)}</TableCell>
      <TableCell className="text-muted-foreground">{formatFileSize(recording.fileSize)}</TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={playMutation.isPending}
          onClick={() => playMutation.mutate()}
        >
          {playMutation.isPending ? (
            'Loading…'
          ) : (
            <>
              <Play className="h-4 w-4" />
              Play
            </>
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function RecordingListPage() {
  const queryClient = useQueryClient()
  const autoSyncedRef = useRef(false)

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: fetchRecordings,
    staleTime: 60_000,
  })

  const syncMutation = useMutation({
    mutationFn: async (opts?: { manual?: boolean }) => {
      const result = await syncRecordingsFromZoom()
      return { ...result, manual: opts?.manual ?? false }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['recordings'], result.recordings)
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
    queryClient.setQueryData<Recording[]>(['recordings'], (current = []) =>
      current.filter((recording) => recording.id !== id)
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
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
              {isSyncing && recordings.length === 0 ? (
                <span className="ml-2 text-foreground/80">Syncing from Zoom…</span>
              ) : null}
            </CardDescription>
          )}
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
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((r) => (
                  <RecordingRow key={r.id} recording={r} onDeleted={handleRecordingDeleted} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
