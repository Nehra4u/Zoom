import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

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
  const [label, setLabel] = useState(() => {
    if (!expiresAt) return 'No retention limit'
    return formatRemaining(new Date(expiresAt).getTime() - Date.now())
  })

  useEffect(() => {
    if (!expiresAt) return

    const tick = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now()
      const nextLabel = formatRemaining(remaining)
      setLabel(nextLabel)
      if (remaining <= 0) {
        queryClient.invalidateQueries({ queryKey: ['recordings'] })
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt, queryClient, recordingId])

  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false

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
