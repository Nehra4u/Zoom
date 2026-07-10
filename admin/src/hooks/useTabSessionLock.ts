import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { clearStoredTokens, handleSessionExpired } from '@/api/client'
import { useSessionStore } from '@/stores/sessionStore'

const TAB_LOCK_KEY = 'zc_active_tab'
const HEARTBEAT_MS = 3_000
const STALE_MS = 5_000
const TAB_CHANNEL_NAME = 'zc_tab_lock'

type TabLockRecord = {
  tabId: string
  heartbeat: number
}

function readTabLock(): TabLockRecord | null {
  try {
    const raw = localStorage.getItem(TAB_LOCK_KEY)
    return raw ? (JSON.parse(raw) as TabLockRecord) : null
  } catch {
    return null
  }
}

function writeTabLock(tabId: string) {
  localStorage.setItem(
    TAB_LOCK_KEY,
    JSON.stringify({ tabId, heartbeat: Date.now() } satisfies TabLockRecord)
  )
}

function releaseTabLock(tabId: string) {
  const current = readTabLock()
  if (current?.tabId === tabId) {
    localStorage.removeItem(TAB_LOCK_KEY)
  }
}

function isLockStale(lock: TabLockRecord | null) {
  if (!lock) return true
  return Date.now() - lock.heartbeat > STALE_MS
}

function getTabChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(TAB_CHANNEL_NAME)
}

function generateTabId() {
  return `tab-${crypto.randomUUID()}`
}

export type TabLockState = 'leader' | 'blocked' | 'checking'

export function useTabSessionLock(enabled: boolean) {
  const tabIdRef = useRef(generateTabId())
  const isLeaderRef = useRef(false)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [state, setState] = useState<TabLockState>(enabled ? 'checking' : 'leader')

  const forceLogout = useCallback((message: string) => {
    releaseTabLock(tabIdRef.current)
    isLeaderRef.current = false
    clearStoredTokens()
    useSessionStore.getState().reset()
    toast.error(message)
    window.location.href = '/login?session=superseded'
  }, [])

  const claimLock = useCallback(() => {
    writeTabLock(tabIdRef.current)
    isLeaderRef.current = true
    setState('leader')
  }, [])

  const evaluateLock = useCallback(() => {
    const current = readTabLock()
    if (!current || isLockStale(current) || current.tabId === tabIdRef.current) {
      claimLock()
      return
    }
    isLeaderRef.current = false
    setState('blocked')
  }, [claimLock])

  const takeOver = useCallback(() => {
    const channel = getTabChannel()
    channel?.postMessage({ type: 'tab-superseded', tabId: tabIdRef.current })
    channel?.close()
    claimLock()
    toast.success('This tab is now the active session')
  }, [claimLock])

  const goToLogin = useCallback(() => {
    releaseTabLock(tabIdRef.current)
    handleSessionExpired('superseded')
  }, [])

  useEffect(() => {
    isLeaderRef.current = state === 'leader'
  }, [state])

  useEffect(() => {
    if (!enabled) {
      isLeaderRef.current = true
      setState('leader')
      return
    }

    evaluateLock()

    heartbeatRef.current = setInterval(() => {
      if (isLeaderRef.current) {
        writeTabLock(tabIdRef.current)
      }
    }, HEARTBEAT_MS)

    const channel = getTabChannel()
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'tab-superseded') {
        if (event.data.tabId !== tabIdRef.current) {
          forceLogout('Session moved to another tab')
        }
      }
    }
    channel?.addEventListener('message', onMessage)

    const onBeforeUnload = () => releaseTabLock(tabIdRef.current)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      channel?.removeEventListener('message', onMessage)
      channel?.close()
      window.removeEventListener('beforeunload', onBeforeUnload)
      releaseTabLock(tabIdRef.current)
    }
  }, [enabled, evaluateLock, forceLogout])

  return { state, takeOver, goToLogin }
}
