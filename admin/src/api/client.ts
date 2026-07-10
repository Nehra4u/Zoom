import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_PREFIX } from '@/config'
import type { Admin } from '@/types/admin'

const ACCESS_KEY = 'zc_access_token'
const REFRESH_KEY = 'zc_refresh_token'
const ADMIN_KEY = 'zc_admin'
const SESSION_ID_KEY = 'zc_session_id'
const REFRESH_LOCK_KEY = 'zc_refresh_lock'
const REFRESH_LOCK_TTL_MS = 30_000
const AUTH_CHANNEL_NAME = 'zc_auth_sync'

export const TOKEN_REFRESH_EVENT = 'zc:token-refreshed'
export const AUTH_SESSION_EXPIRED_EVENT = 'zc:auth-session-expired'

let refreshPromise: Promise<string | null> | null = null
let authChannel: BroadcastChannel | null = null

function getAuthChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!authChannel) authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME)
  return authChannel
}

export function getTokenExpiryMs(token: string): number | null {
  try {
    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!base64) return null
    const payload = JSON.parse(atob(base64)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function broadcastAuthMessage(message: Record<string, unknown>) {
  getAuthChannel()?.postMessage(message)
}

function isRefreshLocked() {
  const lock = localStorage.getItem(REFRESH_LOCK_KEY)
  if (!lock) return false
  const ts = Number.parseInt(lock, 10)
  if (Number.isNaN(ts) || Date.now() - ts > REFRESH_LOCK_TTL_MS) {
    localStorage.removeItem(REFRESH_LOCK_KEY)
    return false
  }
  return true
}

function waitForCrossTabRefresh(timeoutMs = REFRESH_LOCK_TTL_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = getAuthChannel()
    if (!channel) {
      resolve(getStoredAccessToken())
      return
    }

    const timer = setTimeout(() => {
      channel.removeEventListener('message', onMessage)
      resolve(getStoredAccessToken())
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'tokens-updated') {
        clearTimeout(timer)
        channel!.removeEventListener('message', onMessage)
        resolve(getStoredAccessToken())
      } else if (event.data?.type === 'session-expired') {
        clearTimeout(timer)
        channel!.removeEventListener('message', onMessage)
        resolve(null)
      }
    }

    channel.addEventListener('message', onMessage)
  })
}

export function getStoredAccessToken() {
  return sessionStorage.getItem(ACCESS_KEY)
}

export function getStoredSessionId() {
  return sessionStorage.getItem(SESSION_ID_KEY)
}

export function getStoredRefreshToken() {
  return sessionStorage.getItem(REFRESH_KEY)
}

export function setStoredTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem(ACCESS_KEY, accessToken)
  sessionStorage.setItem(REFRESH_KEY, refreshToken)
}

export function setStoredSessionId(sessionId: string) {
  sessionStorage.setItem(SESSION_ID_KEY, sessionId)
}

export function clearStoredTokens() {
  sessionStorage.removeItem(ACCESS_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem(ADMIN_KEY)
  sessionStorage.removeItem(SESSION_ID_KEY)
}

export function getStoredAdmin<T>() {
  const raw = sessionStorage.getItem(ADMIN_KEY)
  return raw ? (JSON.parse(raw) as T) : null
}

export function setStoredAdmin<T>(admin: T) {
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
}

export function handleSessionExpired(reason = 'expired') {
  clearStoredTokens()
  broadcastAuthMessage({ type: 'session-expired' })
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?session=${reason}`
  }
}

function applyTokenUpdate(
  accessToken: string,
  refreshToken: string,
  admin?: Admin,
  sessionId?: string
) {
  setStoredTokens(accessToken, refreshToken)
  if (admin) setStoredAdmin(admin)
  if (sessionId) setStoredSessionId(sessionId)
  window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT, { detail: admin }))
}

export function broadcastAuthLogin(
  accessToken: string,
  refreshToken: string,
  admin: Admin,
  sessionId: string
) {
  localStorage.removeItem('zc_active_tab')
  broadcastAuthMessage({
    type: 'tokens-updated',
    accessToken,
    refreshToken,
    admin,
    sessionId,
  })
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  if (isRefreshLocked()) {
    return waitForCrossTabRefresh()
  }

  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) return null

    localStorage.setItem(REFRESH_LOCK_KEY, String(Date.now()))
    try {
      const { data } = await axios.post<{
        accessToken: string
        refreshToken: string
        admin: Admin
        sessionId?: string
      }>(`${API_PREFIX}/auth/admin/refresh`, { refreshToken })

      applyTokenUpdate(data.accessToken, data.refreshToken, data.admin, data.sessionId)
      broadcastAuthMessage({
        type: 'tokens-updated',
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        admin: data.admin,
        sessionId: data.sessionId,
      })
      return data.accessToken
    } catch {
      handleSessionExpired('expired')
      return null
    } finally {
      localStorage.removeItem(REFRESH_LOCK_KEY)
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function initAuthSync() {
  const channel = getAuthChannel()
  if (!channel) return () => {}

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'tokens-updated') {
      const { accessToken, refreshToken, admin, sessionId } = event.data as {
        accessToken: string
        refreshToken: string
        admin?: Admin
        sessionId?: string
      }
      if (accessToken && refreshToken) {
        applyTokenUpdate(accessToken, refreshToken, admin, sessionId)
      }
    } else if (event.data?.type === 'session-expired') {
      clearStoredTokens()
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
    }
  }

  channel.addEventListener('message', onMessage)
  return () => channel.removeEventListener('message', onMessage)
}

export const api = axios.create({
  baseURL: API_PREFIX,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; code?: string }>) => {
    if (
      error.response?.status === 403 &&
      error.response.data?.code === 'SUBSCRIPTION_EXPIRED'
    ) {
      handleSessionExpired('subscription')
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && error.response.data?.code === 'SESSION_SUPERSEDED') {
      handleSessionExpired('superseded')
      return Promise.reject(error)
    }

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const newToken = await refreshAccessToken()
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
    }
    return Promise.reject(error)
  }
)

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
