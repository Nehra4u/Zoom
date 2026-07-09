import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearStoredTokens,
  getStoredAccessToken,
  getStoredAdmin,
  getStoredRefreshToken,
  initAuthSync,
  setStoredAdmin,
  setStoredSessionId,
  setStoredTokens,
  TOKEN_REFRESH_EVENT,
} from '@/api/client'
import { loginAdmin as apiLogin, logoutAdmin as apiLogout } from '@/api/admins'
import { useTokenRefresh } from '@/hooks/useTokenRefresh'
import type { Admin } from '@/types/admin'

interface AuthContextValue {
  admin: Admin | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  login: (email: string, password: string) => Promise<Admin>
  logout: () => Promise<void>
  setAdminProfile: (admin: Admin) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => getStoredAdmin<Admin>())

  const isAuthenticated = Boolean(getStoredAccessToken() && admin)
  const isSuperAdmin = admin?.role === 'super_admin'

  useTokenRefresh(isAuthenticated)

  useEffect(() => {
    const cleanupAuthSync = initAuthSync()

    function onTokenRefreshed(event: Event) {
      const detail = (event as CustomEvent<Admin>).detail
      if (detail) setAdmin(detail)
    }

    function onSessionExpired() {
      setAdmin(null)
    }

    window.addEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)

    return () => {
      cleanupAuthSync()
      window.removeEventListener(TOKEN_REFRESH_EVENT, onTokenRefreshed)
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password)
    setStoredTokens(result.accessToken, result.refreshToken)
    setStoredAdmin(result.admin)
    if (result.sessionId) {
      setStoredSessionId(result.sessionId)
    }
    setAdmin(result.admin)
    return result.admin
  }, [])

  const logout = useCallback(async () => {
    await apiLogout(getStoredRefreshToken())
    clearStoredTokens()
    setAdmin(null)
  }, [])

  const setAdminProfile = useCallback((nextAdmin: Admin) => {
    setStoredAdmin(nextAdmin)
    setAdmin(nextAdmin)
  }, [])

  const value = useMemo(
    () => ({ admin, isAuthenticated, isSuperAdmin, login, logout, setAdminProfile }),
    [admin, isAuthenticated, isSuperAdmin, login, logout, setAdminProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
