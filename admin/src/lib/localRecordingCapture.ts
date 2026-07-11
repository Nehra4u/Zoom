import { useLocalRecordingStore } from '@/stores/localRecordingStore'

let mediaRecorder: MediaRecorder | null = null
let captureStream: MediaStream | null = null
let chunks: BlobPart[] = []
let captureStarted = false

function stopTracks() {
  captureStream?.getTracks().forEach((track) => track.stop())
  captureStream = null
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm'
}

async function requestCaptureStream() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' } as MediaTrackConstraints,
      audio: true,
    })
  } catch {
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
  }
}

export async function startLocalRecordingCapture() {
  if (captureStarted || typeof MediaRecorder === 'undefined') return

  try {
    captureStream = await requestCaptureStream()

    captureStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void finalizeLocalRecordingCapture()
    })

    const mimeType = pickMimeType()
    chunks = []
    mediaRecorder = new MediaRecorder(captureStream, { mimeType })
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    mediaRecorder.start(1000)
    captureStarted = true
    useLocalRecordingStore.getState().setStatus('recording')
  } catch {
    stopTracks()
    captureStarted = false
  }
}

export async function finalizeLocalRecordingCapture() {
  if (!captureStarted && useLocalRecordingStore.getState().status !== 'recording') return

  const store = useLocalRecordingStore.getState()
  if (store.status === 'finalizing' || store.status === 'ready') return

  store.setStatus('finalizing')
  store.setProgress(10)

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
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null
  chunks = []
  captureStarted = false
  stopTracks()
}
