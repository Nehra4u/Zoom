import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RequireSuperAdmin } from '@/auth/RequireSuperAdmin'
import { RequireRegularAdmin } from '@/auth/RequireRegularAdmin'
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
import { AppDetailsPage } from '@/pages/system/AppDetailsPage'
import { useAuth } from '@/auth/AuthContext'

function HomeRedirect() {
  const { isSuperAdmin } = useAuth()
  return <Navigate to={isSuperAdmin ? '/admins' : '/dashboard'} replace />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            element: <RequireRegularAdmin />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'users', element: <UserListPage /> },
              { path: 'users/new', element: <UserCreatePage /> },
              { path: 'users/:id', element: <UserDetailPage /> },
              { path: 'recordings', element: <RecordingListPage /> },
            ],
          },
          { path: 'audit-logs', element: <AuditLogPage /> },
          { path: 'system', element: <SystemPage /> },
          { path: 'app-info', element: <AppDetailsPage /> },
          {
            element: <RequireSuperAdmin />,
            children: [
              { path: 'admins', element: <AdminListPage /> },
              { path: 'admins/new', element: <AdminCreatePage /> },
              { path: 'admins/:id', element: <AdminDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
