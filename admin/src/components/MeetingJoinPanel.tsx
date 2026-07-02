import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { endMeeting, fetchAdminJoinToken, type AdminJoinCredentials } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MeetingJoinPanelProps {
  meetingLive: boolean
  onMeetingEnded?: () => Promise<void>
}

/**
 * Zoom Meeting SDK Client View runs in an isolated iframe (React 19 incompatible with embedded SDK).
 * Embedded inline on the dashboard so admins can manage participants while in the call.
 */
export function MeetingJoinPanel({ meetingLive, onMeetingEnded }: MeetingJoinPanelProps) {
  const queryClient = useQueryClient()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingJoinRef = useRef<{ credentials: AdminJoinCredentials; leaveUrl: string } | null>(
    null
  )
  const endedHandledRef = useRef(false)
  const [joining, setJoining] = useState(false)
  const [inMeeting, setInMeeting] = useState(false)
  const [showFrame, setShowFrame] = useState(false)

  const closeFrame = useCallback(() => {
    setShowFrame(false)
    setInMeeting(false)
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
    if (!meetingLive && showFrame) {
      closeFrame()
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
        setInMeeting(true)
        setJoining(false)
        toast.success('Joined meeting in portal')
      }

      if (data.type === 'ZOOM_ERROR') {
        setJoining(false)
        setInMeeting(false)
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

  const joinInPortal = async () => {
    setJoining(true)
    endedHandledRef.current = false
    try {
      const credentials = await fetchAdminJoinToken()
      if (!credentials.sdkKey && !credentials.sdkJwt.startsWith('mock-')) {
        toast.error('Zoom SDK is not configured on the server')
        setJoining(false)
        return
      }

      if (credentials.sdkJwt.startsWith('mock-')) {
        toast.error('In-portal join requires real Zoom SDK credentials (not mock mode)')
        setJoining(false)
        return
      }

      pendingJoinRef.current = {
        credentials,
        leaveUrl: `${window.location.origin}/zoom-leave.html`,
      }
      setShowFrame(true)
    } catch (err) {
      closeFrame()
      toast.error(getErrorMessage(err))
    }
  }

  if (!meetingLive) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>In-portal meeting</CardTitle>
        <CardDescription>
          Join inside the dashboard while managing participants below. You appear as{' '}
          <strong>your admin name</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {!showFrame ? (
            <Button size="sm" disabled={joining} onClick={() => void joinInPortal()}>
              {joining ? 'Fetching credentials…' : 'Join in Portal'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={closeFrame}>
              {inMeeting ? 'Leave meeting view' : 'Cancel join'}
            </Button>
          )}
        </div>

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
