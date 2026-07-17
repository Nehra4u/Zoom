import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, LoaderCircle, Mic, Pause, Play, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadUserVoiceRecording,
  fetchUserVoiceRecordingPlayUrl,
  fetchUserVoiceRecordings,
} from '@/api/userVoiceRecordings'
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
import type {
  UserVoiceRecordingItem,
  UserVoiceRecordingUserGroup,
} from '@/types/userVoiceRecording'

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function userContactLine(user: UserVoiceRecordingUserGroup['user']) {
  const parts = [user.name || user.username, user.email, user.phone].filter(Boolean)
  return parts.join(' · ')
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

function UserVoiceRecordingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function RecordingRow({
  recording,
  onPlay,
  onDownload,
  playingId,
  loadingId,
}: {
  recording: UserVoiceRecordingItem
  onPlay: (recording: UserVoiceRecordingItem) => void
  onDownload: (recording: UserVoiceRecordingItem) => void
  playingId: string | null
  loadingId: string | null
}) {
  const isPlaying = playingId === recording.id
  const isLoading = loadingId === recording.id

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 sm:flex-nowrap">
      <div className="min-w-[4.5rem] text-sm font-medium text-foreground">{formatTime(recording.recordedAt)}</div>
      <div className="text-sm text-muted-foreground">{formatDuration(recording.durationMs)}</div>
      <div className="text-sm text-muted-foreground">{formatFileSize(recording.fileSizeBytes)}</div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => onPlay(recording)}
        >
          {isLoading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isPlaying ? 'Playing' : 'Play'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDownload(recording)}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  )
}

export function UserVoiceRecordingsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [playerTitle, setPlayerTitle] = useState('')
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['user-voice-recordings', debouncedSearch],
    queryFn: () => fetchUserVoiceRecordings(debouncedSearch ? { q: debouncedSearch } : undefined),
  })

  async function handlePlay(recording: UserVoiceRecordingItem) {
    if (playingId === recording.id && playerOpen) {
      audioRef.current?.pause()
      setPlayingId(null)
      setPlayerOpen(false)
      setPlayerUrl(null)
      return
    }

    setLoadingId(recording.id)
    try {
      const { playUrl, fileName } = await fetchUserVoiceRecordingPlayUrl(recording.id)
      setPlayerTitle(fileName)
      setPlayerUrl(playUrl)
      setPlayingId(recording.id)
      setPlayerOpen(true)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoadingId(null)
    }
  }

  async function handleDownload(recording: UserVoiceRecordingItem) {
    try {
      const ext = recording.mimeType.includes('mpeg') ? 'mp3' : recording.mimeType.includes('wav') ? 'wav' : 'm4a'
      await downloadUserVoiceRecording(recording.id, `voice-${recording.id}.${ext}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function handlePlayerOpenChange(open: boolean) {
    if (!open) {
      audioRef.current?.pause()
      setPlayingId(null)
      setPlayerUrl(null)
    }
    setPlayerOpen(open)
  }

  const groups = data?.groups ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone"
            className="w-full rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {isFetching && !isLoading ? 'Refreshing… · ' : null}
          {data ? `${data.totalRecordings} recordings · ${data.totalUsers} users` : null}
        </div>
      </div>

      {isLoading ? (
        <UserVoiceRecordingsSkeleton />
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Mic className="h-10 w-10 text-muted-foreground/60" />
            <div>
              <p className="font-medium text-foreground">No voice recordings yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Recordings from the Android app will appear here, grouped by user and day.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.user.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {initials(group.user.name || group.user.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{group.user.name || group.user.username}</CardTitle>
                    <CardDescription className="truncate">{userContactLine(group.user)}</CardDescription>
                  </div>
                  <div className="shrink-0 text-sm text-muted-foreground">
                    {group.totalRecordings} recording{group.totalRecordings === 1 ? '' : 's'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {group.days.map((day) => (
                  <div key={`${group.user.id}-${day.date}`} className="space-y-2">
                    <div className="text-sm font-medium text-foreground">
                      {day.label}
                      {day.label !== day.date ? (
                        <span className="ml-2 font-normal text-muted-foreground">{day.date}</span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {day.recordings.map((recording) => (
                        <RecordingRow
                          key={recording.id}
                          recording={recording}
                          onPlay={handlePlay}
                          onDownload={handleDownload}
                          playingId={playingId}
                          loadingId={loadingId}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={playerOpen} onOpenChange={handlePlayerOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voice recording</DialogTitle>
            <DialogDescription>{playerTitle}</DialogDescription>
          </DialogHeader>
          {playerUrl ? (
            <audio
              ref={audioRef}
              src={playerUrl}
              controls
              autoPlay
              className="w-full"
              onEnded={() => {
                setPlayingId(null)
                setPlayerOpen(false)
                setPlayerUrl(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
