import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Film, ClipboardList, LayoutDashboard, LogOut, Server, Shield, Users, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/auth/AuthContext'
import { useAdminSocket } from '@/hooks/useAdminSocket'
import { toast } from 'sonner'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )

export function AppShell() {
  const { admin, isSuperAdmin, logout } = useAuth()
  const navigate = useNavigate()
  useAdminSocket(true)

  async function handleLogout() {
    try {
      await logout()
      toast.success('Logged out')
      navigate('/login')
    } catch {
      toast.error('Failed to log out')
    }
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-6 py-5">
          <Video className="h-6 w-6 text-destructive" />
          <div>
            <p className="font-mono text-sm font-semibold">ZoomControl</p>
            <p className="text-xs text-muted-foreground">Admin Portal</p>
          </div>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-4">
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
        <Separator />
        <div className="p-4">
          <div className="mb-3 rounded-md bg-muted/50 px-3 py-2">
            <p className="truncate text-sm font-medium">{admin?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{admin?.email}</p>
            <p className="mt-1 font-mono text-xs capitalize text-destructive">{admin?.role?.replace('_', ' ')}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
