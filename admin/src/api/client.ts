import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_PREFIX } from '@/config'

const ACCESS_KEY = 'zc_access_token'
const REFRESH_KEY = 'zc_refresh_token'
const ADMIN_KEY = 'zc_admin'
const SESSION_ID_KEY = 'zc_session_id'

export const TOKEN_REFRESH_EVENT = 'zc:token-refreshed'

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

let refreshPromise: Promise<string | null> | null = null

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; code?: string }>) => {
    if (
      error.response?.status === 403 &&
      error.response.data?.code === 'SUBSCRIPTION_EXPIRED'
    ) {
      clearStoredTokens()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?subscription=expired'
      }
      return Promise.reject(error)
    }

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const refreshToken = getStoredRefreshToken()
          if (!refreshToken) return null
          try {
            const { data } = await axios.post(`${API_PREFIX}/auth/admin/refresh`, { refreshToken })
            setStoredTokens(data.accessToken, data.refreshToken)
            setStoredAdmin(data.admin)
            window.dispatchEvent(new CustomEvent(TOKEN_REFRESH_EVENT))
            return data.accessToken as string
          } catch {
            clearStoredTokens()
            return null
          } finally {
            refreshPromise = null
          }
        })()
      }
      const newToken = await refreshPromise
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
