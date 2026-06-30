import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RequireSuperAdmin } from '@/auth/RequireSuperAdmin'
import { AppShell } from '@/layouts/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { UserListPage } from '@/pages/users/UserListPage'
import { UserCreatePage } from '@/pages/users/UserCreatePage'
import { UserDetailPage } from '@/pages/users/UserDetailPage'
import { AdminListPage } from '@/pages/admins/AdminListPage'
import { AdminCreatePage } from '@/pages/admins/AdminCreatePage'
import { AdminDetailPage } from '@/pages/admins/AdminDetailPage'
import { RecordingListPage } from '@/pages/recordings/RecordingListPage'
import { AuditLogPage } from '@/pages/audit/AuditLogPage'
import { SystemPage } from '@/pages/system/SystemPage'
import { useAuth } from '@/auth/AuthContext'

function HomeRedirect() {
  const { isSuperAdmin } = useAuth()
  return <Navigate to={isSuperAdmin ? '/admins' : '/dashboard'} replace />
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<HomeRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<UserListPage />} />
            <Route path="users/new" element={<UserCreatePage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="recordings" element={<RecordingListPage />} />
            <Route path="audit-logs" element={<AuditLogPage />} />
            <Route path="system" element={<SystemPage />} />
            <Route element={<RequireSuperAdmin />}>
              <Route path="admins" element={<AdminListPage />} />
              <Route path="admins/new" element={<AdminCreatePage />} />
              <Route path="admins/:id" element={<AdminDetailPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
