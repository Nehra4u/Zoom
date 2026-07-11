import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CalendarCheck2,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
} from 'lucide-react'
import { changeAdminPassword, updateAdminProfile } from '@/api/auth'
import { fetchSubscription } from '@/api/settings'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

function initials(name?: string) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatDateTime(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

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
    month: 'long',
    year: 'numeric',
  })

  let headline = 'Subscription active'
  if (expired) headline = 'Subscription ended'
  else if (daysRemaining > 0) headline = `Renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
  else headline = 'Renewal due'

  return { daysRemaining, isUrgent, formatted, headline, expired }
}

interface EditProfileDialogProps {
  open: boolean
  onClose: () => void
  name: string
  email: string
  onSaved: (name: string, email: string) => void
}

function EditProfileDialog({ open, onClose, name, email, onSaved }: EditProfileDialogProps) {
  const mutation = useMutation({
    mutationFn: (payload: { name: string; email: string }) => updateAdminProfile(payload),
    onSuccess: (admin) => {
      toast.success('Profile updated')
      onSaved(admin.name, admin.email ?? '')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    mutation.mutate({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your account details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input id="profile-name" name="name" defaultValue={name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" name="email" type="email" defaultValue={email} required />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
}

function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const mutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      changeAdminPassword(payload.currentPassword, payload.newPassword),
    onSuccess: () => {
      toast.success('Password updated')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match')
      return
    }
    mutation.mutate({
      currentPassword: String(form.get('currentPassword') ?? ''),
      newPassword,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Choose a new password for your admin account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" name="currentPassword" type="password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" name="newPassword" type="password" required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" name="confirmPassword" type="password" required minLength={8} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SystemPage() {
  const { admin, isSuperAdmin, logout, setAdminProfile } = useAuth()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  })

  const renewal = useMemo(
    () =>
      formatSubscriptionRenewal(
        subscriptionQuery.data?.endDate ?? null,
        subscriptionQuery.data?.isActive ?? true
      ),
    [subscriptionQuery.data]
  )

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Could not log out — please try again')
    } finally {
      setLoggingOut(false)
    }
  }

  function handleProfileSaved(name: string, email: string) {
    if (!admin) return
    setAdminProfile({ ...admin, name, email })
  }

  return (
    <div className="space-y-5">
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-chart-1/12 ring-1 ring-chart-1/15">
              <span className="text-xl font-bold text-chart-1">{initials(admin?.name)}</span>
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-success" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-foreground">{admin?.name}</h2>
                <Badge variant={isSuperAdmin ? 'success' : 'secondary'} className="gap-1 rounded-full">
                  {isSuperAdmin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  {isSuperAdmin ? 'Super Admin' : 'Admin'}
                </Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{admin?.email}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last login: {formatDateTime(admin?.lastLoginAt ?? null)}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit profile
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserIcon className="h-4.5 w-4.5 text-chart-1" />
              Profile information
            </CardTitle>
            <CardDescription>Your administrator account details</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border/70 text-sm">
              {[
                { icon: UserIcon, label: 'Full name', value: admin?.name ?? '—' },
                { icon: Mail, label: 'Email address', value: admin?.email ?? '—' },
                { icon: Phone, label: 'Mobile number', value: 'Not set', muted: true },
                { icon: Smartphone, label: 'Account role', value: isSuperAdmin ? 'Super Admin' : 'Admin' },
              ].map(({ icon: Icon, label, value, muted }) => (
                <div key={label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:items-center">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </dt>
                  <dd className={cn('truncate font-medium sm:text-right', muted ? 'text-muted-foreground' : 'text-foreground')}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck2 className="h-4.5 w-4.5 text-success" />
                Subscription
              </CardTitle>
              <CardDescription>Your workspace plan status</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4',
                  renewal.expired || renewal.isUrgent
                    ? 'border-destructive/20 bg-destructive/7'
                    : 'border-success/20 bg-success/7'
                )}
              >
                <span
                  className={cn(
                    'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                    renewal.expired || renewal.isUrgent ? 'bg-destructive' : 'bg-success'
                  )}
                />
                <div>
                  <p className="text-sm font-semibold text-foreground">{renewal.headline}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {renewal.expired ? 'Contact Administration to reactivate' : `Next renewal on ${renewal.formatted}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4.5 w-4.5 text-chart-1" />
                Account security
              </CardTitle>
              <CardDescription>Password and session controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Password</p>
                    <p className="text-xs text-muted-foreground">Keep your account protected</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
                  Change
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Current session
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Signed in on this device</p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleLogout} disabled={loggingOut}>
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditProfileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        name={admin?.name ?? ''}
        email={admin?.email ?? ''}
        onSaved={handleProfileSaved}
      />
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}
