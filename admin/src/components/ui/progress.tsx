import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  className?: string
  indeterminate?: boolean
}

export function Progress({ value, className, indeterminate }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-all duration-300',
          indeterminate && 'w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]'
        )}
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  )
}
