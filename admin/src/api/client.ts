import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const ACCESS_KEY = 'zc_access_token'
const REFRESH_KEY = 'zc_refresh_token'
const ADMIN_KEY = 'zc_admin'

export function getStoredAccessToken() {
  return sessionStorage.getItem(ACCESS_KEY)
}

export function getStoredRefreshToken() {
  return sessionStorage.getItem(REFRESH_KEY)
}

export function setStoredTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem(ACCESS_KEY, accessToken)
  sessionStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearStoredTokens() {
  sessionStorage.removeItem(ACCESS_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem(ADMIN_KEY)
}

export function getStoredAdmin<T>() {
  const raw = sessionStorage.getItem(ADMIN_KEY)
  return raw ? (JSON.parse(raw) as T) : null
}

export function setStoredAdmin<T>(admin: T) {
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
}

export const api = axios.create({
  baseURL: '/api',
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
  async (error: AxiosError<{ error?: string }>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const refreshToken = getStoredRefreshToken()
          if (!refreshToken) return null
          try {
            const { data } = await axios.post('/api/auth/admin/refresh', { refreshToken })
            setStoredTokens(data.accessToken, data.refreshToken)
            setStoredAdmin(data.admin)
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
