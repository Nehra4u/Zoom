import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fetchAdminJoinToken, type AdminJoinCredentials } from '@/api/session'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MeetingJoinPanelProps {
  meetingLive: boolean
}

/**
 * Zoom Meeting SDK Client View runs in an isolated iframe (React 19 incompatible with embedded SDK).
 * Embedded inline on the dashboard so admins can manage participants while in the call.
 */
export function MeetingJoinPanel({ meetingLive }: MeetingJoinPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingJoinRef = useRef<{ credentials: AdminJoinCredentials; leaveUrl: string } | null>(
    null
  )
  const [joining, setJoining] = useState(false)
  const [inMeeting, setInMeeting] = useState(false)
  const [showFrame, setShowFrame] = useState(false)

  const closeFrame = useCallback(() => {
    setShowFrame(false)
    setInMeeting(false)
    setJoining(false)
    pendingJoinRef.current = null
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank'
    }
  }, [])

  useEffect(() => {
    if (!meetingLive && (inMeeting || showFrame)) {
      closeFrame()
    }
  }, [meetingLive, inMeeting, showFrame, closeFrame])

  useEffect(() => {
    if (!showFrame) return

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const iframe = iframeRef.current
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return

      const data = event.data as { type?: string; message?: string }

      if (data.type === 'ZOOM_READY' && pendingJoinRef.current) {
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
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [showFrame])

  useEffect(() => {
    if (!showFrame || !pendingJoinRef.current) return
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.src = `/zoom-join.html?t=${Date.now()}`
  }, [showFrame])

  const joinInPortal = async () => {
    setJoining(true)
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
        leaveUrl: `${window.location.origin}/dashboard`,
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
        <div className="flex flex-wrap gap-2">
          {!showFrame ? (
            <Button size="sm" disabled={joining} onClick={() => void joinInPortal()}>
              {joining ? 'Connecting…' : 'Join in Portal'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={closeFrame}>
              {inMeeting ? 'Leave meeting view' : 'Cancel join'}
            </Button>
          )}
        </div>

        {showFrame && (
          <div className="relative w-full overflow-hidden rounded-lg border bg-black">
            {joining && !inMeeting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-sm text-white">
                Connecting to meeting…
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="Zoom meeting"
              className="h-[420px] w-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
