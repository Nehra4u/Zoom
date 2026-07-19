import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useRecordingNowMs } from '@/components/RecordingExpiryProvider'

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Expired'

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} Day${days === 1 ? '' : 's'}`)
  parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  parts.push(`${minutes} min`)
  parts.push(`${seconds} sec`)
  return `Expires in ${parts.join(' ')}`
}

interface ExpiryCountdownProps {
  expiresAt: string | null
  recordingId: string
  className?: string
}

export function ExpiryCountdown({ expiresAt, recordingId, className }: ExpiryCountdownProps) {
  const queryClient = useQueryClient()
  const nowMs = useRecordingNowMs()
  const expiredHandledRef = useRef(false)

  const remaining = expiresAt ? new Date(expiresAt).getTime() - nowMs : null
  const label = !expiresAt
    ? 'No retention limit'
    : formatRemaining(remaining ?? 0)

  useEffect(() => {
    if (!expiresAt || remaining === null || remaining > 0) return
    if (expiredHandledRef.current) return
    expiredHandledRef.current = true
    queryClient.invalidateQueries({ queryKey: ['recordings'] })
  }, [expiresAt, remaining, queryClient, recordingId])

  useEffect(() => {
    expiredHandledRef.current = false
  }, [expiresAt, recordingId])

  const expired = expiresAt ? (remaining ?? 0) <= 0 : false

  return (
    <span
      className={cn(
        'text-sm',
        expired ? 'font-medium text-destructive' : 'text-destructive',
        !expiresAt && 'text-muted-foreground',
        className
      )}
    >
      {label}
    </span>
  )
}
