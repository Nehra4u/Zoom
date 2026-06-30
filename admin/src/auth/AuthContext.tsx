import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredAdmin,
  getStoredRefreshToken,
  setStoredAdmin,
  setStoredTokens,
} from '@/api/client'
import { loginAdmin as apiLogin, logoutAdmin as apiLogout } from '@/api/admins'
import type { Admin } from '@/types/admin'

interface AuthContextValue {
  admin: Admin | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  login: (email: string, password: string) => Promise<Admin>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => getStoredAdmin<Admin>())

  const isAuthenticated = Boolean(getStoredAccessToken() && admin)
  const isSuperAdmin = admin?.role === 'super_admin'

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password)
    setStoredTokens(result.accessToken, result.refreshToken)
    setStoredAdmin(result.admin)
    setAdmin(result.admin)
    return result.admin
  }, [])

  const logout = useCallback(async () => {
    await apiLogout(getStoredRefreshToken())
    clearStoredTokens()
    setAdmin(null)
  }, [])

  const value = useMemo(
    () => ({ admin, isAuthenticated, isSuperAdmin, login, logout }),
    [admin, isAuthenticated, isSuperAdmin, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
