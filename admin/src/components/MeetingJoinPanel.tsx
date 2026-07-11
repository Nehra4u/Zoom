import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { fetchAdminJoinToken, fetchCurrentSession, endMeeting, type AdminJoinCredentials } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DesktopMeetingJoinCard } from '@/components/DesktopMeetingJoinCard'
import { EndMeetingButton } from '@/components/EndMeetingButton'
import { JoinModeBadge } from '@/components/JoinModeBadge'
import { triggerLocalRecordingFinalize, triggerLocalRecordingStart } from '@/components/LocalRecordingDialog'
import { useSessionStore } from '@/stores/sessionStore'

interface MeetingJoinPanelProps {
  meetingLive: boolean
  mode?: 'visible' | 'mini'
}

function toErrorMessage(message: unknown) {
  return typeof message === 'string' && message.length > 0 ? message : 'Failed to join meeting'
}

function decodeJwtMn(token: string): string | null {
  try {
    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!base64) return null
    const payload = JSON.parse(atob(base64)) as { mn?: string }
    return payload.mn ?? null
  } catch {
    return null
  }
}

function isMeetingNotFoundError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('meeting number') ||
    lower.includes('3707') ||
    lower.includes('3706')
  )
}

function isMeetingEndedError(err: unknown) {
  if (!axios.isAxiosError(err)) return false
  const status = err.response?.status
  const code = (err.response?.data as { code?: string })?.code
  return status === 404 || code === 'MEETING_ENDED'
}

/**
 * Zoom Meeting SDK Client View runs in an isolated iframe (React 19 incompatible with embedded SDK).
 * Portal mode joins automatically when the meeting is live; desktop mode shows Zoom app join details.
 */
export function MeetingJoinPanel({
  meetingLive,
  mode = 'visible',
}: MeetingJoinPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeLoadedRef = useRef(false)
  const pendingJoinRef = useRef<{ credentials: AdminJoinCredentials; leaveUrl: string } | null>(
    null
  )
  const endedHandledRef = useRef(false)
  const queryClient = useQueryClient()
  const {
    joinMode,
    portalJoined,
    portalJoinAttempted,
    portalJoinFailed,
    portalJoinError,
    setPortalJoined,
    setPortalJoinAttempted,
    setPortalJoinFailed,
    clearSession,
  } = useSessionStore()
  const [joining, setJoining] = useState(false)
  const [showFrame, setShowFrame] = useState(false)
  const [lastMeetingNumber, setLastMeetingNumber] = useState<string | null>(null)
  const isMini = mode === 'mini'
  const isPortalMode = joinMode === 'portal'

  const closeFrame = useCallback(() => {
    setShowFrame(false)
    setJoining(false)
    iframeLoadedRef.current = false
    pendingJoinRef.current = null
    endedHandledRef.current = false
    setPortalJoined(false)
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank'
    }
  }, [setPortalJoined])

  const stopPortalCapture = useCallback(() => {
    void import('@/lib/localRecordingCapture').then(({ cancelLocalRecordingCapture }) => {
      cancelLocalRecordingCapture()
    })
  }, [])

  useEffect(() => {
    if (!meetingLive) {
      setPortalJoinAttempted(false)
      setPortalJoinFailed(false)
      if (showFrame) closeFrame()
    }
  }, [meetingLive, showFrame, closeFrame, setPortalJoinAttempted, setPortalJoinFailed])

  useEffect(() => {
    if (isPortalMode) return
    if (showFrame || portalJoined) {
      stopPortalCapture()
      closeFrame()
      setPortalJoinAttempted(false)
      setPortalJoinFailed(false)
    }
  }, [
    isPortalMode,
    showFrame,
    portalJoined,
    closeFrame,
    stopPortalCapture,
    setPortalJoinAttempted,
    setPortalJoinFailed,
  ])

  useEffect(() => {
    if (!showFrame) return

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const iframe = iframeRef.current
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return

      const data = event.data as { type?: string; message?: string; ended?: boolean }

      if (data.type === 'ZOOM_READY' && pendingJoinRef.current) {
        setJoining(false)
        iframe.contentWindow.postMessage(
          { type: 'ZOOM_JOIN', ...pendingJoinRef.current },
          window.location.origin
        )
      }

      if (data.type === 'ZOOM_JOINED') {
        setJoining(false)
        setPortalJoined(true)
        setPortalJoinFailed(false)
        triggerLocalRecordingStart()
        if (!isMini) {
          toast.success('Joined meeting in portal')
        }
      }

      if (data.type === 'ZOOM_ERROR') {
        setJoining(false)
        const message = toErrorMessage(data.message)
        setPortalJoinFailed(true, message)
        if (import.meta.env.DEV) {
          console.error('[Zoom join]', data)
        }
        if (!isMini) {
          toast.error(message)
        }
      }

      if (data.type === 'ZOOM_LEFT' && data.ended) {
        if (endedHandledRef.current) return
        endedHandledRef.current = true
        closeFrame()
        setPortalJoinFailed(false)
        triggerLocalRecordingFinalize()
        void (async () => {
          await queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
          const snapshot = await queryClient.fetchQuery({
            queryKey: ['session', 'current'],
            queryFn: fetchCurrentSession,
          })
          if (snapshot.meetingLive) {
            try {
              await endMeeting()
            } catch {
              // Zoom may already be ended; local sync is best-effort
            }
          }
          clearSession()
        })()
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [
    showFrame,
    closeFrame,
    isMini,
    queryClient,
    clearSession,
    setPortalJoined,
    setPortalJoinFailed,
  ])

  useEffect(() => {
    if (!showFrame || !pendingJoinRef.current || iframeLoadedRef.current) return
    const iframe = iframeRef.current
    if (!iframe) return
    iframeLoadedRef.current = true
    iframe.src = `/zoom-join.html?t=${Date.now()}`
  }, [showFrame])

  const joinInPortal = useCallback(async () => {
    if (joining || showFrame || portalJoined) return

    setJoining(true)
    setPortalJoinFailed(false)
    endedHandledRef.current = false
    try {
      const credentials = await fetchAdminJoinToken()
      setLastMeetingNumber(credentials.meetingNumber)
      if (import.meta.env.DEV) {
        const jwtMn = decodeJwtMn(credentials.sdkJwt)
        console.info('[Zoom join] credentials', {
          joinMode: credentials.joinMode,
          role: credentials.role,
          hasZak: Boolean(credentials.zak),
          meetingNumber: credentials.meetingNumber,
          jwtMn,
          mnMatch: jwtMn === credentials.meetingNumber,
        })
        if (jwtMn && jwtMn !== credentials.meetingNumber) {
          console.warn('[Zoom join] JWT mn does not match meetingNumber', { jwtMn, meetingNumber: credentials.meetingNumber })
        }
      }
      if (!credentials.sdkKey && !credentials.sdkJwt.startsWith('mock-')) {
        toast.error('Zoom SDK is not configured on the server')
        setJoining(false)
        setPortalJoinAttempted(false)
        return
      }

      if (credentials.sdkJwt.startsWith('mock-')) {
        toast.error('In-portal join requires real Zoom SDK credentials (not mock mode)')
        setJoining(false)
        setPortalJoinAttempted(false)
        return
      }

      pendingJoinRef.current = {
        credentials,
        leaveUrl: `${window.location.origin}/zoom-leave.html`,
      }
      setShowFrame(true)
    } catch (err) {
      setJoining(false)
      closeFrame()
      if (isMeetingEndedError(err)) {
        clearSession()
        void queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
        return
      }
      const message = getErrorMessage(err)
      setPortalJoinFailed(true, message)
      if (!isMini) {
        toast.error(message)
      }
    }
  }, [
    joining,
    showFrame,
    portalJoined,
    closeFrame,
    isMini,
    queryClient,
    clearSession,
    setPortalJoinFailed,
    setPortalJoinAttempted,
  ])

  const retryJoin = useCallback(() => {
    closeFrame()
    setPortalJoinFailed(false)
    setPortalJoinAttempted(true)
    void joinInPortal()
  }, [closeFrame, joinInPortal, setPortalJoinAttempted, setPortalJoinFailed])

  useEffect(() => {
    if (!isPortalMode) return
    if (
      !meetingLive ||
      showFrame ||
      joining ||
      portalJoinAttempted ||
      portalJoined ||
      portalJoinFailed
    ) {
      return
    }
    setPortalJoinAttempted(true)
    void joinInPortal()
  }, [
    isPortalMode,
    meetingLive,
    showFrame,
    joining,
    portalJoinAttempted,
    portalJoined,
    portalJoinFailed,
    joinInPortal,
    setPortalJoinAttempted,
  ])

  if (!meetingLive) return null

  if (!isPortalMode) {
    if (isMini) {
      return (
        <div className="flex h-full items-center justify-center p-3 text-center text-[11px] leading-4 text-white/80">
          Using Zoom desktop app. Open the dashboard for join details.
        </div>
      )
    }

    return (
      <Card className="flex h-full flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div>
                <CardTitle>Live meeting</CardTitle>
                <CardDescription>
                  Join in the Zoom desktop app and manage participants from this dashboard.
                </CardDescription>
              </div>
              <JoinModeBadge />
            </div>
            <EndMeetingButton />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col space-y-4">
          <DesktopMeetingJoinCard />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        showFrame && 'gap-0 rounded-none border-0 py-0',
        isMini && 'h-full rounded-none border-0 bg-black shadow-none'
      )}
    >
      {!showFrame && !isMini && (
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div>
                <CardTitle>In-portal meeting</CardTitle>
                <CardDescription>
                  You join automatically when the meeting starts. Manage participants below while in
                  the call — you appear as <strong>your admin name</strong>.
                </CardDescription>
              </div>
              <JoinModeBadge />
            </div>
            <EndMeetingButton />
          </div>
        </CardHeader>
      )}
      <CardContent
        className={cn(
          'flex flex-1 flex-col space-y-4',
          showFrame && 'p-0',
          isMini && 'p-0'
        )}
      >
        {joining && !showFrame && !isMini && (
          <p className="text-sm text-muted-foreground">Joining meeting in portal…</p>
        )}

        {portalJoinFailed && !isMini && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              {portalJoinError ?? 'Failed to join meeting in portal'}
            </p>
            {lastMeetingNumber && (
              <p className="text-xs text-muted-foreground">Meeting ID: {lastMeetingNumber}</p>
            )}
            {portalJoinError && isMeetingNotFoundError(portalJoinError) && (
              <p className="text-xs text-muted-foreground">
                End the meeting from the dashboard, then start a new session.
              </p>
            )}
            <Button variant="outline" size="sm" className="w-fit" onClick={retryJoin}>
              Retry join
            </Button>
          </div>
        )}

        {(showFrame || isMini) && (
          <div className={cn('h-full w-full flex-1 bg-black')}>
            <iframe
              ref={iframeRef}
              title="Zoom meeting"
              className="h-full w-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
