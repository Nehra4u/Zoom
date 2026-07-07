import { useMemo } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell,
  CalendarCheck2,
  ClipboardList,
  Film,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  Search,
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
import { RightPanel } from '@/layouts/RightPanel'

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

// TODO: wire this up to a real billing/subscription API once one exists.
// Placeholder renewal date so the UI has something meaningful to render.
const SUBSCRIPTION_RENEWAL_DATE = new Date('2026-07-19T00:00:00')

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

function NavButton({ item }: { item: NavItem }) {
  const Icon = item.icon
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
    </NavLink>
  )
}

export function AppShell() {
  const { admin, isSuperAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useAdminSocket(true)

  const navItems = OPERATIONS_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin)
  const heading = useMemo(
    () => getPageHeading(location.pathname, isSuperAdmin),
    [location.pathname, isSuperAdmin]
  )

  const renewal = useMemo(() => {
    const now = new Date()
    const msPerDay = 1000 * 60 * 60 * 24
    const daysRemaining = Math.ceil((SUBSCRIPTION_RENEWAL_DATE.getTime() - now.getTime()) / msPerDay)
    const isUrgent = daysRemaining <= 7
    const formatted = SUBSCRIPTION_RENEWAL_DATE.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return { daysRemaining, isUrgent, formatted }
  }, [])

  return (
<<<<<<< HEAD
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-chart-1">
            <Video className="h-5 w-5 text-primary-foreground" />
=======
    <div className="flex h-svh overflow-hidden">
      <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
        <div className="flex shrink-0 items-center gap-2 px-6 py-5">
          <Video className="h-6 w-6 text-destructive" />
          <div>
            <p className="font-mono text-sm font-semibold">ZoomControl</p>
            <p className="text-xs text-muted-foreground">Admin Portal</p>
>>>>>>> 442b6025946742ec093718b234a05ff215321ca3
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">ZoomMeets</span>
          <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            Live
          </span>
        </div>
<<<<<<< HEAD

        {/* Search */}
        <div className="px-4 py-4">
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
        </div>

        {/* Operations */}
        <div className="px-4">
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </p>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <NavButton key={item.to} item={item} />
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
              renewal.isUrgent
                ? 'border-destructive/20 bg-destructive/10'
                : 'border-success/20 bg-success/10'
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  renewal.isUrgent ? 'bg-destructive/15' : 'bg-success/15'
                )}
              >
                <CalendarCheck2
                  className={cn('h-4 w-4', renewal.isUrgent ? 'text-destructive' : 'text-success')}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xs font-semibold',
                    renewal.isUrgent ? 'text-destructive' : 'text-success'
                  )}
                >
                  {renewal.isUrgent ? `Renews in ${renewal.daysRemaining} days` : 'Subscription active'}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Next renewal on {renewal.formatted}
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
=======
        <Separator className="shrink-0" />
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
          <NavLink to="/dashboard" className={navLinkClass}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink to="/users" className={navLinkClass}>
            <Users className="h-4 w-4" />
            Users
          </NavLink>
          <NavLink to="/recordings" className={navLinkClass}>
            <Film className="h-4 w-4" />
            Recordings
          </NavLink>
          <NavLink to="/audit-logs" className={navLinkClass}>
            <ClipboardList className="h-4 w-4" />
            Audit Log
          </NavLink>
          <NavLink to="/system" className={navLinkClass}>
            <Server className="h-4 w-4" />
            System
          </NavLink>
          {isSuperAdmin && (
            <NavLink to="/admins" className={navLinkClass}>
              <Shield className="h-4 w-4" />
              Admins
            </NavLink>
          )}
        </nav>
        <Separator className="shrink-0" />
        <div className="shrink-0 p-4">
          <div className="mb-3 rounded-md bg-muted/50 px-3 py-2">
            <p className="truncate text-sm font-medium">{admin?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{admin?.email}</p>
            <p className="mt-1 font-mono text-xs capitalize text-destructive">{admin?.role?.replace('_', ' ')}</p>
>>>>>>> 442b6025946742ec093718b234a05ff215321ca3
          </div>
        </div>
      </aside>
<<<<<<< HEAD

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{heading.title}</h1>
            {heading.subtitle && <p className="text-sm text-muted-foreground">{heading.subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
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
        <div className="flex-1 overflow-y-auto p-6">
=======
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-8">
>>>>>>> 442b6025946742ec093718b234a05ff215321ca3
          <Outlet />
        </div>
      </main>

      {/* Right Panel */}
      <RightPanel />
    </div>
  )
}
