import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { endMeeting, fetchAdminJoinToken, type AdminJoinCredentials } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MeetingJoinPanelProps {
  meetingLive: boolean
  onMeetingEnded?: () => Promise<void>
}

/**
 * Zoom Meeting SDK Client View runs in an isolated iframe (React 19 incompatible with embedded SDK).
 * Joins automatically when the meeting is live so admins can manage participants while in the call.
 */
export function MeetingJoinPanel({ meetingLive, onMeetingEnded }: MeetingJoinPanelProps) {
  const queryClient = useQueryClient()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingJoinRef = useRef<{ credentials: AdminJoinCredentials; leaveUrl: string } | null>(
    null
  )
  const endedHandledRef = useRef(false)
  const joinAttemptedRef = useRef(false)
  const [joining, setJoining] = useState(false)
  const [showFrame, setShowFrame] = useState(false)

  const closeFrame = useCallback(() => {
    setShowFrame(false)
    setJoining(false)
    pendingJoinRef.current = null
    endedHandledRef.current = false
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank'
    }
  }, [])

  const syncMeetingEnded = useCallback(async () => {
    try {
      if (onMeetingEnded) {
        await onMeetingEnded()
      } else {
        await endMeeting()
        await queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
        toast.success('Meeting ended')
      }
    } catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 404) {
        toast.error(getErrorMessage(err))
      }
    }
  }, [onMeetingEnded, queryClient])

  useEffect(() => {
    if (!meetingLive) {
      joinAttemptedRef.current = false
      if (showFrame) closeFrame()
    }
  }, [meetingLive, showFrame, closeFrame])

  useEffect(() => {
    if (!showFrame) return

    async function handlePortalEnd() {
      if (endedHandledRef.current) return
      endedHandledRef.current = true
      closeFrame()
      await syncMeetingEnded()
    }

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
        toast.success('Joined meeting in portal')
      }

      if (data.type === 'ZOOM_ERROR') {
        setJoining(false)
        joinAttemptedRef.current = false
        toast.error(data.message || 'Failed to join meeting')
      }

      if (data.type === 'ZOOM_LEFT' && data.ended) {
        void handlePortalEnd()
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [showFrame, closeFrame, syncMeetingEnded])

  useEffect(() => {
    if (!showFrame || !pendingJoinRef.current) return
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.src = `/zoom-join.html?t=${Date.now()}`
  }, [showFrame])

  const joinInPortal = useCallback(async () => {
    if (joining || showFrame) return

    setJoining(true)
    endedHandledRef.current = false
    try {
      const credentials = await fetchAdminJoinToken()
      if (!credentials.sdkKey && !credentials.sdkJwt.startsWith('mock-')) {
        toast.error('Zoom SDK is not configured on the server')
        setJoining(false)
        joinAttemptedRef.current = false
        return
      }

      if (credentials.sdkJwt.startsWith('mock-')) {
        toast.error('In-portal join requires real Zoom SDK credentials (not mock mode)')
        setJoining(false)
        joinAttemptedRef.current = false
        return
      }

      pendingJoinRef.current = {
        credentials,
        leaveUrl: `${window.location.origin}/zoom-leave.html`,
      }
      setShowFrame(true)
    } catch (err) {
      joinAttemptedRef.current = false
      closeFrame()
      toast.error(getErrorMessage(err))
    }
  }, [joining, showFrame, closeFrame])

  useEffect(() => {
    if (!meetingLive || showFrame || joining || joinAttemptedRef.current) return
    joinAttemptedRef.current = true
    void joinInPortal()
  }, [meetingLive, showFrame, joining, joinInPortal])

  if (!meetingLive) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>In-portal meeting</CardTitle>
        <CardDescription>
          You join automatically when the meeting starts. Manage participants below while in the call
          — you appear as <strong>your admin name</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {joining && !showFrame && (
          <p className="text-sm text-muted-foreground">Joining meeting in portal…</p>
        )}

        {showFrame && (
          <div className="w-full overflow-hidden rounded-lg border bg-black">
            <iframe
              ref={iframeRef}
              title="Zoom meeting"
              className="h-[520px] w-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
