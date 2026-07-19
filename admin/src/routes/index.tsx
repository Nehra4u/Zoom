import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RequireSuperAdmin } from '@/auth/RequireSuperAdmin'
import { RequireRegularAdmin } from '@/auth/RequireRegularAdmin'
import { AppShell } from '@/layouts/AppShell'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAuth } from '@/auth/AuthContext'

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
)
const UserListPage = lazy(() =>
  import('@/pages/users/UserListPage').then((m) => ({ default: m.UserListPage }))
)
const UserCreatePage = lazy(() =>
  import('@/pages/users/UserCreatePage').then((m) => ({ default: m.UserCreatePage }))
)
const UserDetailPage = lazy(() =>
  import('@/pages/users/UserDetailPage').then((m) => ({ default: m.UserDetailPage }))
)
const AdminListPage = lazy(() =>
  import('@/pages/admins/AdminListPage').then((m) => ({ default: m.AdminListPage }))
)
const AdminCreatePage = lazy(() =>
  import('@/pages/admins/AdminCreatePage').then((m) => ({ default: m.AdminCreatePage }))
)
const AdminDetailPage = lazy(() =>
  import('@/pages/admins/AdminDetailPage').then((m) => ({ default: m.AdminDetailPage }))
)
const RecordingListPage = lazy(() =>
  import('@/pages/recordings/RecordingListPage').then((m) => ({ default: m.RecordingListPage }))
)
const UserVoiceRecordingsPage = lazy(() =>
  import('@/pages/user-recordings/UserVoiceRecordingsPage').then((m) => ({
    default: m.UserVoiceRecordingsPage,
  }))
)
const AuditLogPage = lazy(() =>
  import('@/pages/audit/AuditLogPage').then((m) => ({ default: m.AuditLogPage }))
)
const SystemPage = lazy(() =>
  import('@/pages/system/SystemPage').then((m) => ({ default: m.SystemPage }))
)
const AppDetailsPage = lazy(() =>
  import('@/pages/system/AppDetailsPage').then((m) => ({ default: m.AppDetailsPage }))
)

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

function HomeRedirect() {
  const { isSuperAdmin } = useAuth()
  return <Navigate to={isSuperAdmin ? '/admins' : '/dashboard'} replace />
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <LazyPage>
        <LoginPage />
      </LazyPage>
    ),
  },
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
              {
                path: 'dashboard',
                element: (
                  <LazyPage>
                    <DashboardPage />
                  </LazyPage>
                ),
              },
              {
                path: 'users',
                element: (
                  <LazyPage>
                    <UserListPage />
                  </LazyPage>
                ),
              },
              {
                path: 'users/new',
                element: (
                  <LazyPage>
                    <UserCreatePage />
                  </LazyPage>
                ),
              },
              {
                path: 'users/:id',
                element: (
                  <LazyPage>
                    <UserDetailPage />
                  </LazyPage>
                ),
              },
              {
                path: 'recordings',
                element: (
                  <LazyPage>
                    <RecordingListPage />
                  </LazyPage>
                ),
              },
              {
                path: 'user-recordings',
                element: (
                  <LazyPage>
                    <UserVoiceRecordingsPage />
                  </LazyPage>
                ),
              },
            ],
          },
          {
            path: 'audit-logs',
            element: (
              <LazyPage>
                <AuditLogPage />
              </LazyPage>
            ),
          },
          {
            path: 'system',
            element: (
              <LazyPage>
                <SystemPage />
              </LazyPage>
            ),
          },
          {
            path: 'app-info',
            element: (
              <LazyPage>
                <AppDetailsPage />
              </LazyPage>
            ),
          },
          {
            element: <RequireSuperAdmin />,
            children: [
              {
                path: 'admins',
                element: (
                  <LazyPage>
                    <AdminListPage />
                  </LazyPage>
                ),
              },
              {
                path: 'admins/new',
                element: (
                  <LazyPage>
                    <AdminCreatePage />
                  </LazyPage>
                ),
              },
              {
                path: 'admins/:id',
                element: (
                  <LazyPage>
                    <AdminDetailPage />
                  </LazyPage>
                ),
              },
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
