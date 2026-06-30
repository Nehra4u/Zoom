import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Film, Play } from 'lucide-react'
import { toast } from 'sonner'
import { fetchRecordings, fetchRecordingPlayUrl } from '@/api/recordings'
import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

function RecordingRow({ recording }: { recording: Recording }) {
  const playMutation = useMutation({
    mutationFn: () => fetchRecordingPlayUrl(recording.id),
    onSuccess: (data) => {
      window.open(data.playUrl, '_blank', 'noopener,noreferrer')
      toast.success('Opening recording — URL is time-limited')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{recording.topic}</TableCell>
      <TableCell>{new Date(recording.startTime).toLocaleString()}</TableCell>
      <TableCell>{formatDuration(recording.duration)}</TableCell>
      <TableCell>
        <Badge variant="secondary">{recording.fileType}</Badge>
      </TableCell>
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
  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: fetchRecordings,
  })

  // Recordings list auto-refreshes via socket in AppShell

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Recordings</h1>
        <p className="text-muted-foreground">Cloud recordings from Zoom — play URLs fetched fresh on demand</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            All recordings
          </CardTitle>
          <CardDescription>
            {recordings.length} recording{recordings.length !== 1 ? 's' : ''}. URLs expire — click Play to fetch a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recordings.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>No recordings yet.</p>
              <p>Recordings appear when Zoom sends a <code className="text-foreground">recording.completed</code> webhook.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((r) => (
                  <RecordingRow key={r.id} recording={r} />
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
              Play URLs are time-limited and fetched from the Zoom API at click time — never stored in our database.
              With <code className="text-foreground">ZOOM_MOCK=true</code>, mock URLs open example.com.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
