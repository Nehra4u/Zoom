import type { Page } from '@playwright/test'

const MOCK_ADMIN = {
  id: 'admin-1',
  name: 'Test Admin',
  email: 'admin@test.com',
  phone: null,
  role: 'admin' as const,
  status: 'active' as const,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
  zoomHostUserId: null,
}

const MOCK_SUPER_ADMIN = {
  ...MOCK_ADMIN,
  id: 'super-1',
  name: 'Super Admin',
  email: 'super@test.com',
  role: 'super_admin' as const,
}

export async function seedAdminSession(page: Page, role: 'admin' | 'super_admin' = 'admin') {
  const admin = role === 'super_admin' ? MOCK_SUPER_ADMIN : MOCK_ADMIN
  await page.addInitScript((stored) => {
    sessionStorage.clear()
    localStorage.clear()
    sessionStorage.setItem('zc_access_token', stored.token)
    sessionStorage.setItem('zc_refresh_token', stored.refresh)
    sessionStorage.setItem('zc_admin', JSON.stringify(stored.admin))
    sessionStorage.setItem('zc_session_id', 'session-1')
  }, {
    token: 'mock-access-token',
    refresh: 'mock-refresh-token',
    admin,
  })
}

export async function mockApiRoutes(page: Page, role: 'admin' | 'super_admin' = 'admin') {
  const admin = role === 'super_admin' ? MOCK_SUPER_ADMIN : MOCK_ADMIN

  await page.route('**/socket.io/**', (route) => route.abort())

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = route.request().method()

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

    if (path === '/health') {
      return json({ ok: true, service: 'mock' })
    }
    if (path === '/settings/subscription') {
      return json({ endDate: '2027-01-01T00:00:00.000Z', isActive: true })
    }
    if (path === '/session/current') {
      return json({
        sessionActive: false,
        meetingLive: false,
        meeting: null,
        meetingOwnedByMe: false,
        canEndMeeting: false,
        participants: [],
      })
    }
    if (path === '/users' || path.startsWith('/users/')) {
      if (path.match(/^\/users\/[^/]+$/)) {
        return json({
          user: {
            id: 'user-1',
            name: 'Test User',
            phone: '1234567890',
            status: 'active',
            isOnline: false,
          },
        })
      }
      return json({ users: [] })
    }
    if (path === '/admins' || path.startsWith('/admins/')) {
      if (path === '/admins/zoom-users') return json({ users: [] })
      if (path.match(/^\/admins\/[^/]+$/)) return json({ admin: MOCK_ADMIN })
      return json({ admins: [MOCK_ADMIN] })
    }
    if (path === '/recordings/sync' && method === 'POST') {
      return json({
        synced: 0,
        total: 0,
        from: '',
        to: '',
        recordings: [],
        recordingRetentionDays: 30,
      })
    }
    if (path === '/recordings' || path.startsWith('/recordings/')) {
      return json({ recordings: [], recordingRetentionDays: 30 })
    }
    if (path === '/user-voice-recordings' || path.startsWith('/user-voice-recordings')) {
      return json({ groups: [], totalUsers: 0, totalRecordings: 0 })
    }
    if (path === '/audit-logs' || path.startsWith('/audit-logs')) {
      return json({ logs: [], scope: 'own' })
    }
    if (path === '/settings') {
      return json({
        settings: {
          recordingRetentionDays: 30,
          subscriptionEndDate: '2027-01-01T00:00:00.000Z',
          updatedAt: null,
        },
      })
    }
    if (path === '/auth/admin/login') {
      return json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        admin,
        sessionId: 'session-1',
      })
    }
    if (path.startsWith('/auth/admin/refresh')) {
      return json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        admin,
        sessionId: 'session-1',
      })
    }

    return json({ error: 'Not mocked', path, method }, 404)
  })
}
