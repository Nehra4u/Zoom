import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireSuperAdmin() {
  const { isSuperAdmin } = useAuth()

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
