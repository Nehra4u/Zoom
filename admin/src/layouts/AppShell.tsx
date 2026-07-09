import { useMemo } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell,
  CalendarCheck2,
  ClipboardList,
  Film,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useAdminSocket } from '@/hooks/useAdminSocket'
import { useSessionSync } from '@/hooks/useSessionSync'
import { MeetingActiveBanner } from '@/components/MeetingActiveBanner'
import { MeetingPortalHost } from '@/components/MeetingPortalHost'
import { RightPanel } from '@/layouts/RightPanel'
import { useSessionStore } from '@/stores/sessionStore'
import { fetchSubscription } from '@/api/settings'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  superAdminOnly?: boolean
}

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'User Management', icon: Users },
  { to: '/audit-logs', label: 'Admin Logs', icon: ClipboardList },
  { to: '/admins', label: 'Admin Details', icon: Shield, superAdminOnly: true },
  { to: '/app-info', label: 'App Details', icon: Rocket },
]

const RECORDS_ITEMS: NavItem[] = [
  { to: '/recordings', label: 'Recording', icon: Film },
  { to: '/system', label: 'Settings', icon: Settings },
]

function formatSubscriptionRenewal(endDate: string | null, isActive: boolean) {
  if (!endDate) {
    return {
      daysRemaining: null as number | null,
      isUrgent: false,
      formatted: 'Not configured',
      headline: isActive ? 'Subscription active' : 'Subscription ended',
      expired: !isActive,
    }
  }

  const renewalDate = new Date(endDate)
  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const daysRemaining = Math.ceil((renewalDate.getTime() - now.getTime()) / msPerDay)
  const expired = !isActive
  const isUrgent = !expired && daysRemaining <= 7
  const formatted = renewalDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  let headline = 'Subscription active'
  if (expired) headline = 'Subscription ended'
  else if (isUrgent) headline = `Renews in ${daysRemaining} days`

  return { daysRemaining, isUrgent, formatted, headline, expired }
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
            ? 'bg-primary text-primary-foreground font-medium shadow-sm'
            : 'text-foreground/80 hover:bg-muted/80 hover:text-foreground'
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
  const { admin, isSuperAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { meetingLive, socketConnected } = useSessionStore()
  useAdminSocket(true)
  useSessionSync()

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  })

  const isDashboard = location.pathname.startsWith('/dashboard')
  const showPortalBackground = meetingLive && !isDashboard

  const navItems = OPERATIONS_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin)
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
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-chart-1">
            <Video className="h-5 w-5 text-primary-foreground" />
          </div>
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
        <div className="px-4">
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
            {RECORDS_ITEMS.map((item) => (
              <NavButton key={item.to} item={item} />
            ))}
          </nav>
        </div>

        {/* Bottom section */}
        <div className="space-y-3 border-t border-border px-4 py-4">
          {/* Subscription renewal — prominent, positive framing */}
          <div
            className={cn(
              'rounded-xl border p-3',
              renewal.expired || renewal.isUrgent
                ? 'border-destructive/20 bg-destructive/10'
                : 'border-success/20 bg-success/10'
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  renewal.expired || renewal.isUrgent ? 'bg-destructive/15' : 'bg-success/15'
                )}
              >
                <CalendarCheck2
                  className={cn('h-4 w-4', renewal.expired || renewal.isUrgent ? 'text-destructive' : 'text-success')}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xs font-semibold',
                    renewal.expired || renewal.isUrgent ? 'text-destructive' : 'text-success'
                  )}
                >
                  {renewal.headline}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {renewal.expired
                    ? 'Contact Administration to reactivate'
                    : `Next renewal on ${renewal.formatted}`}
                </p>
              </div>
            </div>
          </div>

          {/* Profile */}
          <div className="flex w-full items-center gap-3 rounded-xl px-2 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-1/20">
              <span className="text-sm font-medium text-chart-1">{initials(admin?.name)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{admin?.name}</p>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {isSuperAdmin ? (
                  <ShieldCheck className="h-3 w-3 text-chart-1" />
                ) : (
                  <Shield className="h-3 w-3" />
                )}
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-8">
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
              title={socketConnected ? 'Realtime connected' : 'Realtime disconnected — polling every 30s'}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  socketConnected ? 'bg-success animate-pulse' : 'bg-muted-foreground'
                )}
              />
              {socketConnected ? 'Live' : 'Offline'}
            </span>
            {meetingLive && !isDashboard && (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
              >
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                Meeting live
              </button>
            )}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries()}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
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
        <div className="relative flex-1 overflow-hidden">
          {meetingLive && (
            <MeetingPortalHost mode={isDashboard ? 'visible' : 'background'} />
          )}
          <div
            className={cn(
              'h-full overflow-y-auto p-6',
              meetingLive && isDashboard && 'invisible'
            )}
          >
            <Outlet />
          </div>
          {showPortalBackground && <MeetingActiveBanner />}
        </div>
      </main>

      {/* Right Panel */}
      <RightPanel />
    </div>
  )
}
