import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PhoneOff } from 'lucide-react'
import { toast } from 'sonner'
import { endMeeting } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { triggerLocalRecordingFinalize } from '@/components/LocalRecordingDialog'
import { useSessionStore } from '@/stores/sessionStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EndMeetingButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'secondary' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function EndMeetingButton({
  variant = 'destructive',
  size = 'sm',
  className,
}: EndMeetingButtonProps) {
  const queryClient = useQueryClient()
  const canEndMeeting = useSessionStore((s) => s.canEndMeeting)
  const clearSession = useSessionStore((s) => s.clearSession)

  const endMutation = useMutation({
    mutationFn: endMeeting,
    onSuccess: () => {
      triggerLocalRecordingFinalize()
      clearSession()
      void queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      toast.success('Meeting ended')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  if (!canEndMeeting) return null

  return (
    <Button
      variant={variant}
      size={size}
      className={cn('gap-1.5', className)}
      disabled={endMutation.isPending}
      onClick={() => endMutation.mutate()}
    >
      <PhoneOff className="h-3.5 w-3.5" />
      {endMutation.isPending ? 'Ending…' : 'End meeting'}
    </Button>
  )
}
