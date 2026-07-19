import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  activateAdmin,
  deactivateAdmin,
  deleteAdmin,
  fetchAdmin,
  updateAdmin,
} from '@/api/admins'
import { getErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { ZoomHostUserField } from '@/components/ZoomHostUserField'
import {
  formatLicenseEndDate,
  licenseEndDatesMatch,
  toDateInputValue,
} from '@/lib/licenseDisplay'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AdminStatus } from '@/types/admin'

function statusVariant(status: AdminStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'inactive') return 'warning' as const
  return 'destructive' as const
}

export function AdminDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { admin: currentAdmin } = useAuth()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin')
  const [zoomHostUserId, setZoomHostUserId] = useState('')
  const [licenseEndDate, setLicenseEndDate] = useState('')

  const { data: admin, isLoading } = useQuery({
    queryKey: ['admins', id],
    queryFn: () => fetchAdmin(id),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (admin) {
      setName(admin.name)
      setEmail(admin.email ?? '')
      setPhone(admin.phone ?? '')
      setRole(admin.role)
      setZoomHostUserId(admin.zoomHostUserId ?? '')
      setLicenseEndDate(toDateInputValue(admin.licenseEndDate))
    }
  }, [admin])

  const isSelf = currentAdmin?.id === id

  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string
      email: string
      phone: string
      role: 'admin' | 'super_admin'
      zoomHostUserId: string | null
    }) =>
      updateAdmin(id, {
        name: payload.name,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        role: payload.role,
        zoomHostUserId: payload.zoomHostUserId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['admins', id] })
      toast.success('Admin updated')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const licenseMutation = useMutation({
    mutationFn: (nextLicenseEndDate: string | null) =>
      updateAdmin(id, { licenseEndDate: nextLicenseEndDate }),
    onSuccess: (updatedAdmin, sentDate) => {
      queryClient.setQueryData(['admins', id], updatedAdmin)
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['admins', id] })

      if (!licenseEndDatesMatch(sentDate, updatedAdmin.licenseEndDate)) {
        toast.error(
          'License date was not saved. Deploy the latest backend (per-admin license support) and try again.'
        )
        return
      }

      toast.success('License updated')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const activateMutation = useMutation({
    mutationFn: () => activateAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['admins', id] })
      toast.success('Admin activated')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['admins', id] })
      toast.success('Admin deactivated')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Admin deleted')
      navigate('/admins')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (isLoading || !admin) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      name,
      email,
      phone,
      role,
      zoomHostUserId: zoomHostUserId.trim() || null,
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/admins" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to admins
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{admin.name}</h1>
          <div className="mt-2 flex gap-2">
            <Badge variant="secondary">{admin.role.replace('_', ' ')}</Badge>
            <Badge variant={statusVariant(admin.status)}>{admin.status}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit account</CardTitle>
          <CardDescription>Update admin profile and role</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email (optional)</Label>
              <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone (optional)</Label>
              <Input id="edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'super_admin')}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>
            {admin.role === 'admin' && (
              <ZoomHostUserField
                id="edit-zoom-host"
                value={zoomHostUserId}
                onChange={setZoomHostUserId}
              />
            )}
            <Button type="submit" disabled={updateMutation.isPending}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {admin.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>License</CardTitle>
            <CardDescription>Set when this admin&apos;s portal access expires</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {!admin.licenseEndDate ? (
                <Badge variant="secondary">Active — no expiry set</Badge>
              ) : !admin.licenseIsActive ? (
                <Badge variant="destructive">Expired</Badge>
              ) : admin.licenseExpiringThisWeek ? (
                <Badge variant="destructive">Expiring this week</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
              {admin.licenseEndDate && (
                <span className="text-sm text-muted-foreground">
                  Expires {formatLicenseEndDate(admin.licenseEndDate)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-end">License expiry date</Label>
              <Input
                id="license-end"
                type="date"
                value={licenseEndDate}
                onChange={(e) => setLicenseEndDate(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={licenseMutation.isPending}
                onClick={() =>
                  licenseMutation.mutate(licenseEndDate.trim() ? licenseEndDate : null)
                }
              >
                Save license
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={licenseMutation.isPending || !admin.licenseEndDate}
                onClick={() => {
                  setLicenseEndDate('')
                  licenseMutation.mutate(null)
                }}
              >
                Clear date (unlimited)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account actions</CardTitle>
          <CardDescription>
            {isSelf ? 'You cannot deactivate or delete your own account.' : 'Manage account status'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {admin.status === 'inactive' ? (
            <Button
              variant="secondary"
              disabled={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              Activate
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={isSelf || deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate()}
            >
              Deactivate
            </Button>
          )}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isSelf}>
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete admin?</DialogTitle>
                <DialogDescription>
                  This will soft-delete {admin.name}&apos;s account. They will no longer be able to log in.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
