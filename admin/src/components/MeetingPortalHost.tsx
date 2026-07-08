import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { endMeeting } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { MeetingJoinPanel } from '@/components/MeetingJoinPanel'
import { useSessionStore } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'

interface MeetingPortalHostProps {
  mode: 'visible' | 'background'
}

export function MeetingPortalHost({ mode }: MeetingPortalHostProps) {
  const queryClient = useQueryClient()
  const { meetingLive, canEndMeeting } = useSessionStore()

  const endMutation = useMutation({
    mutationFn: endMeeting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      toast.success('Meeting ended — recording will appear in Recordings when ready')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (!meetingLive) return null

  return (
    <div
      className={cn(
        mode === 'visible' && 'absolute inset-0 overflow-hidden p-6',
        mode === 'background' &&
          'pointer-events-none fixed left-[-9999px] top-0 z-[-1] h-[720px] w-[1280px] overflow-hidden'
      )}
    >
      <div
        className={cn(
          mode === 'visible' && '-m-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)]',
          mode === 'background' && 'h-full w-full'
        )}
      >
        <MeetingJoinPanel
          meetingLive={meetingLive}
          mode={mode}
          endPending={endMutation.isPending}
          onEndMeeting={canEndMeeting ? () => endMutation.mutate() : undefined}
          onMeetingEnded={async () => {
            await endMutation.mutateAsync()
          }}
        />
      </div>
    </div>
  )
}
