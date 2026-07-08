import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  activateUser,
  deactivateUser,
  deleteUser,
  fetchUser,
  updateUser,
} from '@/api/users'
import { getErrorMessage } from '@/api/client'
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
import type { UserStatus } from '@/types/user'

function statusVariant(status: UserStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'pending') return 'warning' as const
  if (status === 'inactive') return 'secondary' as const
  return 'destructive' as const
}

function statusLabel(status: UserStatus) {
  if (status === 'active') return 'Activated'
  if (status === 'inactive') return 'Deactivated'
  if (status === 'pending') return 'Pending'
  return 'Deleted'
}

export function UserDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [zoomDisplayName, setZoomDisplayName] = useState('')

  const { data: user, isLoading } = useQuery({
    queryKey: ['users', id],
    queryFn: () => fetchUser(id),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setPhone(user.phone ?? '')
      setZoomDisplayName(user.zoomDisplayName)
    }
  }, [user])

  const updateMutation = useMutation({
    mutationFn: () => updateUser(id, { name, email, phone: phone || undefined, zoomDisplayName }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['users', id] })
      const phoneChanged = (phone || null) !== (user?.phone ?? null)
      toast.success(
        phoneChanged ? 'User updated — device unlinked for new phone number' : 'User updated'
      )
      if (phoneChanged && updated.phone !== undefined) {
        setPhone(updated.phone ?? '')
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const activateMutation = useMutation({
    mutationFn: () => activateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['users', id] })
      toast.success('User activated — rejoin signal sent')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['users', id] })
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      toast.success('User deactivated — client notified')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted')
      navigate('/users')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (isLoading || !user) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/users" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to users
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{user.name}</h1>
        <div className="mt-2 flex gap-2">
          <Badge variant={statusVariant(user.status)}>{statusLabel(user.status)}</Badge>
          {user.lastActiveAt && (
            <Badge variant="outline">Last active: {new Date(user.lastActiveAt).toLocaleString()}</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Update client account details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {phone !== (user.phone ?? '') && (
                <p className="text-xs text-muted-foreground">
                  Changing the phone number will unlink the current device so the user can sign in from a new phone.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-zoom">Zoom display name</Label>
              <Input
                id="edit-zoom"
                value={zoomDisplayName}
                onChange={(e) => setZoomDisplayName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meeting access</CardTitle>
          <CardDescription>
            Activate to allow joining. Deactivate to force-drop from any live call (WebSocket in Phase 3).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {user.status !== 'active' && (
            <Button disabled={activateMutation.isPending} onClick={() => activateMutation.mutate()}>
              Activate
            </Button>
          )}
          {user.status === 'active' && (
            <Button
              variant="outline"
              disabled={deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate()}
            >
              Deactivate & force-leave
            </Button>
          )}
          {user.status === 'pending' && (
            <p className="w-full text-sm text-muted-foreground">
              This user is pending — activate when ready to grant meeting access.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Soft-delete this account. Active users will receive a force-leave signal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete user?</DialogTitle>
                <DialogDescription>
                  This will soft-delete {user.name}&apos;s account. They will no longer be able to log in or join
                  meetings.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
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
