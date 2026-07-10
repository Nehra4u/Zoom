import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireRegularAdmin() {
  const { isSuperAdmin } = useAuth()

  if (isSuperAdmin) {
    return <Navigate to="/admins" replace />
  }

  return <Outlet />
}
