import { useMemo, lazy, Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell,
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  Film,
  LayoutDashboard,
  Mic,
  Rocket,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSubscriptionRenewal } from '@/lib/licenseDisplay'
import { useAuth } from '@/auth/AuthContext'
import { useAdminSocket } from '@/hooks/useAdminSocket'
import { useSessionSync } from '@/hooks/useSessionSync'
import { MeetingActiveBanner } from '@/components/MeetingActiveBanner'
import { EndMeetingButton } from '@/components/EndMeetingButton'
import { TabSessionBlocker } from '@/components/TabSessionBlocker'
import { RecordingInterruptedBanner, RestartRecordingButton } from '@/components/RecordingInterruptedBanner'
import { useLocalRecordingLifecycle } from '@/lib/localRecordingEvents'
import { RightPanel } from '@/layouts/RightPanel'
import { useSessionStore } from '@/stores/sessionStore'
import { fetchSubscription } from '@/api/settings'
import logo from '@/assets/logo.svg'

const MeetingPortalHost = lazy(() =>
  import('@/components/MeetingPortalHost').then((m) => ({ default: m.MeetingPortalHost }))
)
const LocalRecordingDialog = lazy(() =>
  import('@/components/LocalRecordingDialog').then((m) => ({ default: m.LocalRecordingDialog }))
)
const DesktopMeetingEndedDialog = lazy(() =>
  import('@/components/DesktopMeetingEndedDialog').then((m) => ({
    default: m.DesktopMeetingEndedDialog,
  }))
)

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  superAdminOnly?: boolean
  adminOnly?: boolean
}

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/users', label: 'User Management', icon: Users, adminOnly: true },
  { to: '/audit-logs', label: 'Admin Logs', icon: ClipboardList },
  { to: '/admins', label: 'Admin Details', icon: Shield, superAdminOnly: true },
  { to: '/app-info', label: 'App Details', icon: Rocket },
]

const RECORDS_ITEMS: NavItem[] = [
  { to: '/recordings', label: 'Recording', icon: Film, adminOnly: true },
  { to: '/user-recordings', label: 'User Recordings', icon: Mic, adminOnly: true },
  { to: '/system', label: 'Settings', icon: Settings },
]

function isNavItemVisible(item: NavItem, isSuperAdmin: boolean) {
  if (item.superAdminOnly && !isSuperAdmin) return false
  if (item.adminOnly && isSuperAdmin) return false
  return true
}

function getPageHeading(pathname: string, isSuperAdmin: boolean): { title: string; subtitle: string } {
  if (pathname.startsWith('/dashboard')) {
    return { title: 'Meeting Dashboard', subtitle: 'Start meetings, monitor participants, and manage access' }
  }
  if (pathname === '/users/new') {
    return { title: 'Add APK User', subtitle: 'Create a client account for the Android app' }
  }
  if (/^\/users\/[^/]+$/.test(pathname)) {
    return { title: 'User Details', subtitle: "View and edit this user's account" }
  }
  if (pathname.startsWith('/users')) {
    return { title: 'User Management', subtitle: 'Manage client accounts that join via the Android app' }
  }
  if (pathname.startsWith('/user-recordings')) {
    return {
      title: 'User Recordings',
      subtitle: 'Push-to-talk voice recordings from Android users, grouped by user and day',
    }
  }
  if (pathname.startsWith('/recordings')) {
    return { title: 'Recording', subtitle: 'Cloud recordings from Zoom — play URLs fetched fresh on demand' }
  }
  if (pathname.startsWith('/audit-logs')) {
    return {
      title: 'Admin Logs',
      subtitle: isSuperAdmin ? 'All platform actions across admins and users' : 'Your actions only',
    }
  }
  if (pathname.startsWith('/app-info')) {
    return { title: 'App Details', subtitle: 'Version, downloads & release history' }
  }
  if (pathname.startsWith('/system')) {
    return { title: 'Settings', subtitle: 'Your profile, password & subscription' }
  }
  if (pathname === '/admins/new') {
    return { title: 'Create Admin', subtitle: 'Add a new portal admin account' }
  }
  if (/^\/admins\/[^/]+$/.test(pathname)) {
    return { title: 'Admin Profile', subtitle: "View and edit this admin's account" }
  }
  if (pathname.startsWith('/admins')) {
    return { title: 'Admin Details', subtitle: 'Create and manage portal admin accounts' }
  }
  return { title: 'ZoomMeets', subtitle: '' }
}

function initials(name?: string) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function NavButton({ item, meetingLive }: { item: NavItem; meetingLive?: boolean }) {
  const Icon = item.icon
  const isDashboard = item.to === '/dashboard'
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isActive
            ? 'bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/20'
            : 'text-foreground/75 hover:bg-white/65 hover:text-foreground hover:shadow-sm'
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {isDashboard && meetingLive && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-success animate-pulse" title="Meeting live" />
      )}
    </NavLink>
  )
}

export function AppShell() {
  const { admin, isSuperAdmin, isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const meetingLive = useSessionStore((s) => s.meetingLive)
  const socketConnected = useSessionStore((s) => s.socketConnected)
  const canEndMeeting = useSessionStore((s) => s.canEndMeeting)
  useAdminSocket(!isSuperAdmin, isSuperAdmin)
  useSessionSync(!isSuperAdmin)
  useLocalRecordingLifecycle()

  useEffect(() => {
    if (isSuperAdmin || !location.pathname.startsWith('/dashboard')) return
    void import('@/components/MeetingPortalHost')
  }, [isSuperAdmin, location.pathname])

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  })

  const isDashboard = location.pathname.startsWith('/dashboard')
  const isUsersRoute = location.pathname.startsWith('/users')
  const showMeetingUi = !isSuperAdmin && meetingLive
  const showPortalBackground = showMeetingUi && !isDashboard
  const showRightPanel =
    meetingLive || isDashboard || (!isSuperAdmin && isUsersRoute)

  const navItems = OPERATIONS_ITEMS.filter((item) => isNavItemVisible(item, isSuperAdmin))
  const recordsItems = RECORDS_ITEMS.filter((item) => isNavItemVisible(item, isSuperAdmin))
  const heading = useMemo(
    () => getPageHeading(location.pathname, isSuperAdmin),
    [location.pathname, isSuperAdmin]
  )

  const renewal = useMemo(
    () =>
      formatSubscriptionRenewal(
        subscriptionQuery.data?.endDate ?? null,
        subscriptionQuery.data?.isActive ?? true
      ),
    [subscriptionQuery.data]
  )

  return (
    <div className="app-surface flex h-screen overflow-hidden">
      <TabSessionBlocker enabled={isAuthenticated} />
      {!isSuperAdmin && (
        <Suspense fallback={null}>
          <LocalRecordingDialog />
          <DesktopMeetingEndedDialog />
        </Suspense>
      )}
      {/* Left Sidebar */}
      <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-white/70 bg-card/95 shadow-[12px_0_40px_-34px_rgba(30,64,175,0.35)]">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/70 px-5">
          <img src={logo} alt="ZoomMeets" className="h-9 w-9 drop-shadow-sm" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">ZoomMeets</span>
          <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            Live
          </span>
        </div>

        {/* Search */}
        {/* <div className="px-4 py-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-2.5 transition-colors hover:bg-muted"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left text-sm text-muted-foreground">Search anything here</span>
            <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              /
            </kbd>
          </button>
        </div> */}

        {/* Operations */}
        <div className="px-4 pt-5">
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </p>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <NavButton key={item.to} item={item} meetingLive={meetingLive} />
            ))}
          </nav>
        </div>

        {/* Records */}
        <div className="mt-4 flex-1 px-4">
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Records
          </p>
          <nav className="space-y-0.5">
            {recordsItems.map((item) => (
              <NavButton key={item.to} item={item} />
            ))}
          </nav>
        </div>

        {/* Bottom section */}
        <div className="space-y-2.5 border-t border-white/70 bg-white/40 px-4 py-4">
          {/* Subscription renewal */}
          <div
            className={cn(
              'group relative overflow-hidden rounded-2xl border p-3.5 shadow-[0_14px_32px_-24px_rgba(30,64,175,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-22px_rgba(30,64,175,0.5)]',
              isSuperAdmin
                ? 'border-chart-1/20 bg-gradient-to-br from-chart-1/12 to-white/60'
                : renewal.expired || renewal.isUrgent
                  ? 'border-destructive/20 bg-gradient-to-br from-destructive/12 to-white/55'
                  : 'border-success/20 bg-gradient-to-br from-success/12 to-white/60'
            )}
          >
            <div
              className={cn(
                'pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-90',
                isSuperAdmin
                  ? 'bg-chart-1/25'
                  : renewal.expired || renewal.isUrgent
                    ? 'bg-destructive/25'
                    : 'bg-success/25'
              )}
            />
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 shadow-sm',
                  isSuperAdmin
                    ? 'bg-chart-1/15'
                    : renewal.expired || renewal.isUrgent
                      ? 'bg-destructive/15'
                      : 'bg-success/15'
                )}
              >
                <CalendarCheck2
                  className={cn(
                    'h-4 w-4',
                    isSuperAdmin
                      ? 'text-chart-1'
                      : renewal.expired || renewal.isUrgent
                        ? 'text-destructive'
                        : 'text-success'
                  )}
                />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {isSuperAdmin ? 'Platform access' : 'Workspace plan'}
                </p>
                <p
                  className={cn(
                    'text-xs font-bold',
                    isSuperAdmin
                      ? 'text-chart-1'
                      : renewal.expired || renewal.isUrgent
                        ? 'text-destructive'
                        : 'text-success'
                  )}
                >
                  {isSuperAdmin ? 'Platform admin' : renewal.headline}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {isSuperAdmin
                    ? 'No license expiry applies'
                    : renewal.expired
                      ? 'Contact Administration to reactivate'
                      : `Next renewal on ${renewal.formatted}`}
                </p>
              </div>
              <span
                className={cn(
                  'relative mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.55)]',
                  isSuperAdmin
                    ? 'bg-chart-1'
                    : renewal.expired || renewal.isUrgent
                      ? 'bg-destructive'
                      : 'bg-success'
                )}
              />
            </div>
          </div>

          {/* Profile */}
          <button
            type="button"
            onClick={() => navigate('/system')}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-2.5 text-left shadow-sm transition-all duration-200 hover:border-chart-1/20 hover:bg-white/80 hover:shadow-md"
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-chart-1/20 to-violet-300/25 ring-1 ring-white/75">
              <span className="text-sm font-bold text-chart-1">{initials(admin?.name)}</span>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-success" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{admin?.name}</p>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {isSuperAdmin ? (
                  <ShieldCheck className="h-3 w-3 text-chart-1" />
                ) : (
                  <Shield className="h-3 w-3" />
                )}
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-chart-1" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/70 bg-card/95 px-8 shadow-[0_10px_32px_-28px_rgba(30,64,175,0.4)]">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{heading.title}</h1>
            {heading.subtitle && <p className="text-sm text-muted-foreground">{heading.subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium',
                socketConnected
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              )}
              title={socketConnected ? 'Realtime connected' : meetingLive ? 'Realtime disconnected — polling every 10s' : 'Realtime disconnected — polling every 30s'}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  socketConnected ? 'bg-success animate-pulse' : 'bg-muted-foreground'
                )}
              />
              {socketConnected ? 'Live' : 'Offline'}
            </span>
            {showMeetingUi && !isDashboard && (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
              >
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                Meeting live
              </button>
            )}
            {showMeetingUi && canEndMeeting && (
              <>
                <RestartRecordingButton />
                <EndMeetingButton variant="outline" size="sm" />
              </>
            )}
            <button
              type="button"
              onClick={() => toast.info('No new notifications')}
              className="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/system')}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Account settings"
              title="Account settings"
            >
              <UserRound className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
        <RecordingInterruptedBanner />
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute left-[8%] top-[5%] h-72 w-72 rounded-full bg-blue-300/15" />
          <div className="pointer-events-none absolute bottom-[4%] right-[10%] h-80 w-80 rounded-full bg-violet-300/15" />
          {showMeetingUi && (
            <Suspense fallback={null}>
              <MeetingPortalHost mode={isDashboard ? 'visible' : 'mini'} />
            </Suspense>
          )}
          <div
            className={cn(
              'h-full overflow-y-auto p-6',
              showMeetingUi && isDashboard && 'invisible'
            )}
          >
            <Outlet />
          </div>
          {showPortalBackground && <MeetingActiveBanner />}
        </div>
      </main>

      {showRightPanel && <RightPanel />}
    </div>
  )
}
