import { useEffect } from 'react'
import {
  getStoredAccessToken,
  getTokenExpiryMs,
  refreshAccessToken,
  TOKEN_REFRESH_EVENT,
} from '@/api/client'

const REFRESH_BEFORE_MS = 5 * 60 * 1000

export function useTokenRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    function scheduleRefresh() {
      if (timeoutId) clearTimeout(timeoutId)

      const token = getStoredAccessToken()
      if (!token) return

      const expiry = getTokenExpiryMs(token)
      if (!expiry) return

      const delay = Math.max(expiry - REFRESH_BEFORE_MS - Date.now(), 0)

      timeoutId = setTimeout(async () => {
        await refreshAccessToken()
        scheduleRefresh()
      }, delay)
    }

    scheduleRefresh()

    function onTokenRefreshed() {
      scheduleRefresh()
    }

    window.addEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)
    }
  }, [enabled])
}
