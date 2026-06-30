import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mic, MicOff, PhoneOff, Play, Radio, UserMinus, UserX, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  endMeeting,
  fetchCurrentSession,
  removeParticipantFromCall,
  simulateSessionEvent,
  startMeeting,
} from '@/api/session'
import { fetchUsers, deactivateUser } from '@/api/users'
import { getErrorMessage } from '@/api/client'
import { useSessionStore } from '@/stores/sessionStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SessionParticipant } from '@/types/session'

const isDev = import.meta.env.DEV

function ParticipantCard({
  participant,
  onRemove,
  onBlock,
  removing,
  blocking,
}: {
  participant: SessionParticipant
  onRemove: (userId: string) => void
  onBlock: (userId: string) => void
  removing: boolean
  blocking: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${participant.isMuted ? 'bg-muted' : 'bg-destructive/15'}`}
          >
            {participant.isMuted ? (
              <MicOff className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Mic className="h-5 w-5 text-destructive" />
            )}
          </div>
          <div>
            <p className="font-medium">{participant.displayName}</p>
            <p className="text-sm text-muted-foreground">{participant.zoomDisplayName}</p>
            {participant.joinedAt && (
              <p className="text-xs text-muted-foreground">
                Joined {new Date(participant.joinedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={participant.isMuted ? 'secondary' : 'success'}>
            {participant.isMuted ? 'Muted' : 'Live'}
          </Badge>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/users/${participant.userId}`}>View</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={removing}
            onClick={() => onRemove(participant.userId)}
          >
            <UserMinus className="h-4 w-4" />
            Remove
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={blocking}
            onClick={() => onBlock(participant.userId)}
          >
            <UserX className="h-4 w-4" />
            Block
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const { participants, meetingLive, meeting, socketConnected, setSnapshot } =
    useSessionStore()

  const sessionQuery = useQuery({
    queryKey: ['session', 'current'],
    queryFn: fetchCurrentSession,
    refetchInterval: 15_000,
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
    enabled: isDev,
  })

  useEffect(() => {
    if (sessionQuery.data) {
      setSnapshot(sessionQuery.data)
    }
  }, [sessionQuery.data, setSnapshot])

  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
  }

  const startMutation = useMutation({
    mutationFn: startMeeting,
    onSuccess: (started) => {
      invalidateSession()
      toast.success(`Meeting started — ID ${started.meetingNumber}`)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const endMutation = useMutation({
    mutationFn: endMeeting,
    onSuccess: () => {
      setEndDialogOpen(false)
      invalidateSession()
      toast.success('Meeting ended')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const removeMutation = useMutation({
    mutationFn: removeParticipantFromCall,
    onSuccess: () => {
      invalidateSession()
      toast.success('Participant removed from call')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const blockMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      invalidateSession()
      toast.success('User blocked and removed from call')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const simulateMutation = useMutation({
    mutationFn: simulateSessionEvent,
    onSuccess: () => invalidateSession(),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const demoUser = usersQuery.data?.[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Live Dashboard</h1>
          <p className="text-muted-foreground">Start meetings, monitor participants, and manage access</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={socketConnected ? 'success' : 'destructive'} className="gap-1">
            {socketConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {socketConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Badge variant={meetingLive ? 'success' : 'secondary'} className="gap-1">
            <Radio className="h-3 w-3" />
            {meetingLive ? 'Meeting live' : 'No meeting'}
          </Badge>
          {!meetingLive ? (
            <Button
              size="sm"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              <Play className="h-4 w-4" />
              Start Meeting
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={endMutation.isPending}
              onClick={() => setEndDialogOpen(true)}
            >
              <PhoneOff className="h-4 w-4" />
              End Meeting
            </Button>
          )}
        </div>
      </div>

      {meeting && meetingLive && (
        <Card>
          <CardContent className="flex flex-wrap gap-6 pt-6 text-sm">
            <p>
              <span className="text-muted-foreground">Meeting ID:</span>{' '}
              <span className="font-mono">{meeting.meetingNumber}</span>
            </p>
            {meeting.startedAt && (
              <p>
                <span className="text-muted-foreground">Started:</span>{' '}
                {new Date(meeting.startedAt).toLocaleString()}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Participants:</span> {participants.length}
            </p>
          </CardContent>
        </Card>
      )}

      {sessionQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading session…</p>
      ) : !meetingLive ? (
        <Card>
          <CardHeader>
            <CardTitle>No active meeting</CardTitle>
            <CardDescription>
              Click Start Meeting to create an instant Zoom session. Active APK users will be notified to join.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : participants.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for participants</CardTitle>
            <CardDescription>
              Meeting is live. When APK clients join, they will appear here in real time.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {participants.map((p) => (
            <ParticipantCard
              key={p.userId}
              participant={p}
              onRemove={(id) => removeMutation.mutate(id)}
              onBlock={(id) => blockMutation.mutate(id)}
              removing={removeMutation.isPending}
              blocking={blockMutation.isPending}
            />
          ))}
        </div>
      )}

      {isDev && demoUser && meetingLive && (
        <Card>
          <CardHeader>
            <CardTitle>Dev simulator</CardTitle>
            <CardDescription>
              Simulate events for {demoUser.name} ({demoUser.email})
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={simulateMutation.isPending}
              onClick={() =>
                simulateMutation.mutate({
                  event: 'joined',
                  userId: demoUser.id,
                  displayName: demoUser.name,
                  zoomParticipantId: `sim-${demoUser.id}`,
                  meetingId: meeting?.meetingNumber,
                })
              }
            >
              Simulate join
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate({ event: 'left', userId: demoUser.id })}
            >
              Simulate leave
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate({ event: 'muted', userId: demoUser.id })}
            >
              Simulate mute
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate({ event: 'unmuted', userId: demoUser.id })}
            >
              Simulate unmute
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End meeting?</DialogTitle>
            <DialogDescription>
              This will end the Zoom meeting for all participants. Cloud recording will be processed after the
              meeting ends.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEndDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={endMutation.isPending} onClick={() => endMutation.mutate()}>
              End Meeting
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
