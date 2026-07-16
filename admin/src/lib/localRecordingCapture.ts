import { useLocalRecordingStore } from '@/stores/localRecordingStore'
import { useSessionStore } from '@/stores/sessionStore'

export type LocalRecordingStartResult =
  | { ok: true; hasAudio: boolean }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'failed' }

type CaptureConstraints = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
  selfBrowserSurface?: 'include' | 'exclude'
  systemAudio?: 'include' | 'exclude'
}

let mediaRecorder: MediaRecorder | null = null
let displayStream: MediaStream | null = null
let recordingStream: MediaStream | null = null
let micStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let chunks: BlobPart[] = []
let captureStarted = false

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function stopTracks() {
  stopStream(recordingStream)
  stopStream(displayStream)
  stopStream(micStream)
  recordingStream = null
  displayStream = null
  micStream = null
  if (audioContext) {
    void audioContext.close()
    audioContext = null
  }
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm'
}

async function requestDisplayStream() {
  const tabConstraints: CaptureConstraints = {
    video: { displaySurface: 'browser' } as MediaTrackConstraints,
    audio: {
      suppressLocalAudioPlayback: false,
    } as MediaTrackConstraints,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'include',
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(tabConstraints)
  } catch {
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        suppressLocalAudioPlayback: false,
      } as MediaTrackConstraints,
    })
  }
}

async function requestMicStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })
  } catch {
    return null
  }
}

async function buildRecordingStream(source: MediaStream) {
  const videoTracks = source.getVideoTracks()
  const displayAudioTracks = source.getAudioTracks()
  micStream = await requestMicStream()
  const micAudioTracks = micStream?.getAudioTracks() ?? []

  const hasDisplayAudio = displayAudioTracks.some((track) => track.readyState === 'live')
  const hasMicAudio = micAudioTracks.some((track) => track.readyState === 'live')

  if (!hasDisplayAudio && !hasMicAudio) {
    return new MediaStream(videoTracks)
  }

  if (hasDisplayAudio && !hasMicAudio) {
    stopStream(micStream)
    micStream = null
    return new MediaStream([...videoTracks, ...displayAudioTracks])
  }

  if (!hasDisplayAudio && hasMicAudio) {
    return new MediaStream([...videoTracks, ...micAudioTracks])
  }

  audioContext = new AudioContext()
  const destination = audioContext.createMediaStreamDestination()
  const displaySource = audioContext.createMediaStreamSource(new MediaStream(displayAudioTracks))
  const micSource = audioContext.createMediaStreamSource(new MediaStream(micAudioTracks))
  displaySource.connect(destination)
  micSource.connect(destination)

  return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()])
}

async function stopActiveRecorder() {
  const recorder = mediaRecorder
  mediaRecorder = null
  captureStarted = false

  await new Promise<void>((resolve) => {
    if (!recorder || recorder.state === 'inactive') {
      resolve()
      return
    }
    recorder.onstop = () => resolve()
    recorder.stop()
  })
}

async function handleSharingStopped() {
  const store = useLocalRecordingStore.getState()
  const status = store.status
  if (status === 'finalizing' || status === 'ready' || status === 'interrupted') return
  if (!captureStarted && status !== 'recording') return

  await stopActiveRecorder()
  stopTracks()

  if (useSessionStore.getState().meetingLive) {
    store.setStatus('interrupted')
    return
  }

  await finalizeLocalRecordingCapture()
}

export async function startLocalRecordingCapture(): Promise<LocalRecordingStartResult> {
  const storeStatus = useLocalRecordingStore.getState().status
  if (captureStarted || typeof MediaRecorder === 'undefined') {
    return { ok: false, reason: 'unsupported' }
  }
  if (storeStatus !== 'idle' && storeStatus !== 'interrupted') {
    return { ok: false, reason: 'unsupported' }
  }

  try {
    displayStream = await requestDisplayStream()
    recordingStream = await buildRecordingStream(displayStream)

    displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void handleSharingStopped()
    })

    const hasAudio = recordingStream.getAudioTracks().some((track) => track.readyState === 'live')
    const mimeType = pickMimeType()
    if (storeStatus === 'idle') {
      chunks = []
    }
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType })
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    mediaRecorder.start(1000)
    captureStarted = true
    useLocalRecordingStore.getState().setStatus('recording')
    return { ok: true, hasAudio }
  } catch (err) {
    stopTracks()
    captureStarted = false
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return { ok: false, reason: 'cancelled' }
    }
    return { ok: false, reason: 'failed' }
  }
}

export async function restartLocalRecordingCapture(): Promise<LocalRecordingStartResult> {
  const store = useLocalRecordingStore.getState()
  if (store.status !== 'interrupted') {
    return { ok: false, reason: 'unsupported' }
  }
  return startLocalRecordingCapture()
}

export async function finalizeLocalRecordingCapture() {
  const store = useLocalRecordingStore.getState()
  const status = store.status

  if (status === 'finalizing' || status === 'ready') return
  if (!captureStarted && status !== 'recording' && status !== 'interrupted') return

  store.setStatus('finalizing')
  store.setProgress(10)

  await stopActiveRecorder()
  store.setProgress(45)
  stopTracks()

  await new Promise((r) => setTimeout(r, 200))
  store.setProgress(70)

  const mimeType = chunks.length > 0 && chunks[0] instanceof Blob ? (chunks[0] as Blob).type : 'video/webm'
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
  chunks = []

  await new Promise((r) => setTimeout(r, 200))
  store.setProgress(90)

  if (blob.size === 0) {
    store.reset()
    return
  }

  const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
  const fileName = `meeting-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`
  const blobUrl = URL.createObjectURL(blob)
  store.setBlob(blobUrl, fileName)
}

export function cancelLocalRecordingCapture() {
  void stopActiveRecorder()
  chunks = []
  stopTracks()
  useLocalRecordingStore.getState().reset()
}
