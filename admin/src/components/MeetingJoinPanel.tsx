import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fetchAdminJoinToken, type AdminJoinCredentials } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSessionStore } from '@/stores/sessionStore'

interface MeetingJoinPanelProps {
  meetingLive: boolean
  mode?: 'visible' | 'background'
}

/**
 * Zoom Meeting SDK Client View runs in an isolated iframe (React 19 incompatible with embedded SDK).
 * Joins automatically when the meeting is live so admins can manage participants while in the call.
 */
export function MeetingJoinPanel({
  meetingLive,
  mode = 'visible',
}: MeetingJoinPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingJoinRef = useRef<{ credentials: AdminJoinCredentials; leaveUrl: string } | null>(
    null
  )
  const endedHandledRef = useRef(false)
  const {
    portalJoined,
    portalJoinAttempted,
    setPortalJoined,
    setPortalJoinAttempted,
  } = useSessionStore()
  const [joining, setJoining] = useState(false)
  const [showFrame, setShowFrame] = useState(false)
  const isBackground = mode === 'background'

  const closeFrame = useCallback(() => {
    setShowFrame(false)
    setJoining(false)
    pendingJoinRef.current = null
    endedHandledRef.current = false
    setPortalJoined(false)
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank'
    }
  }, [setPortalJoined])

  useEffect(() => {
    if (!meetingLive) {
      setPortalJoinAttempted(false)
      if (showFrame) closeFrame()
    }
  }, [meetingLive, showFrame, closeFrame, setPortalJoinAttempted])

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
        if (!isBackground) {
          toast.success('Joined meeting in portal')
        }
      }

      if (data.type === 'ZOOM_ERROR') {
        setJoining(false)
        setPortalJoinAttempted(false)
        if (!isBackground) {
          toast.error(data.message || 'Failed to join meeting')
        }
      }

      if (data.type === 'ZOOM_LEFT' && data.ended) {
        if (endedHandledRef.current) return
        endedHandledRef.current = true
        closeFrame()
        // Allow auto-rejoin while the server-side meeting is still live.
        setPortalJoinAttempted(false)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [showFrame, closeFrame, isBackground, setPortalJoinAttempted])

  useEffect(() => {
    if (!showFrame || !pendingJoinRef.current) return
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.src = `/zoom-join.html?t=${Date.now()}`
  }, [showFrame])

  const joinInPortal = useCallback(async () => {
    if (joining || showFrame || portalJoined) return

    setJoining(true)
    endedHandledRef.current = false
    try {
      const credentials = await fetchAdminJoinToken()
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
      setPortalJoinAttempted(false)
      closeFrame()
      if (!isBackground) {
        toast.error(getErrorMessage(err))
      }
    }
  }, [
    joining,
    showFrame,
    portalJoined,
    closeFrame,
    isBackground,
    setPortalJoinAttempted,
  ])

  useEffect(() => {
    if (!meetingLive || showFrame || joining || portalJoinAttempted || portalJoined) return
    setPortalJoinAttempted(true)
    void joinInPortal()
  }, [
    meetingLive,
    showFrame,
    joining,
    portalJoinAttempted,
    portalJoined,
    joinInPortal,
    setPortalJoinAttempted,
  ])

  if (!meetingLive) return null

  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        showFrame && 'gap-0 rounded-none border-0 py-0',
        isBackground && 'h-full rounded-none border-0 bg-black shadow-none'
      )}
    >
      {!showFrame && !isBackground && (
        <CardHeader>
          <CardTitle>In-portal meeting</CardTitle>
          <CardDescription>
            You join automatically when the meeting starts. Manage participants below while in the call
            — you appear as <strong>your admin name</strong>.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent
        className={cn(
          'flex flex-1 flex-col space-y-4',
          showFrame && 'p-0',
          isBackground && 'p-0'
        )}
      >
        {joining && !showFrame && !isBackground && (
          <p className="text-sm text-muted-foreground">Joining meeting in portal…</p>
        )}

        {(showFrame || isBackground) && (
          <div className={cn('h-full w-full flex-1 bg-black', isBackground && 'h-[720px] w-[1280px]')}>
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
