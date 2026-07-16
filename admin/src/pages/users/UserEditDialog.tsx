import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, SmartphoneNfc } from 'lucide-react'
import { toast } from 'sonner'
import { logoutUser, updateUser } from '@/api/users'
import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ApkUser, UserStatus } from '@/types/user'

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

function formatDateTime(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

interface UserEditDialogProps {
  user: ApkUser | null
  onClose: () => void
}

export function UserEditDialog({ user, onClose }: UserEditDialogProps) {
  const queryClient = useQueryClient()
  const [changeMobile, setChangeMobile] = useState(false)

  useEffect(() => {
    setChangeMobile(false)
  }, [user?.id])

  const saveMutation = useMutation({
    mutationFn: async (payload: { username: string; email: string; phone: string }) => {
      const phoneChanged = payload.phone !== (user?.phone ?? '')
      await updateUser(user!.id, {
        username: payload.username,
        email: payload.email || undefined,
        phone: payload.phone,
      })
      if (changeMobile && !phoneChanged) {
        await logoutUser(user!.id)
      }
      return phoneChanged
    },
    onSuccess: (phoneChanged) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      if (changeMobile && !phoneChanged) {
        toast.success('User updated — device cleared for a new phone')
      } else if (phoneChanged) {
        toast.success('User updated — device cleared for new phone number')
      } else {
        toast.success('User updated')
      }
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()

    if (!username) {
      toast.error('Username is required')
      return
    }

    saveMutation.mutate({
      username,
      email,
      phone,
    })
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>Update account details for {user.username}.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(user.status)}>{statusLabel(user.status)}</Badge>
              {user.device?.loggedOut && <Badge variant="outline">Logged out</Badge>}
              <span className="text-xs text-muted-foreground">Last seen: {formatDateTime(user.lastSeenAt)}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input id="edit-username" name="username" defaultValue={user.username} required autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email (optional)</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={user.email ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone (optional)</Label>
                <Input id="edit-phone" name="phone" type="tel" defaultValue={user.phone ?? ''} />
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    Device details
                  </p>
                  <button
                    type="button"
                    onClick={() => setChangeMobile((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      changeMobile
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <SmartphoneNfc className="h-3.5 w-3.5" />
                    Change Mobile
                  </button>
                </div>

                {changeMobile && (
                  <p className="mb-3 rounded-lg bg-primary/5 p-2 text-[11px] text-muted-foreground">
                    On save, device details will be cleared so the user can sign in from a new phone.
                  </p>
                )}

                {user.device ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">Device ID</dt>
                    <dd className="truncate font-mono text-foreground" title={user.device.deviceId}>
                      {user.device.deviceId}
                    </dd>
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="text-foreground">{user.device.deviceModel ?? '—'}</dd>
                    <dt className="text-muted-foreground">Manufacturer</dt>
                    <dd className="text-foreground">{user.device.manufacturer ?? '—'}</dd>
                    <dt className="text-muted-foreground">Android version</dt>
                    <dd className="text-foreground">{user.device.androidVersion ?? '—'}</dd>
                    <dt className="text-muted-foreground">App version</dt>
                    <dd className="text-foreground">{user.device.appVersion ?? '—'}</dd>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-foreground">{user.phone ?? '—'}</dd>
                    <dt className="text-muted-foreground">Connection</dt>
                    <dd className="text-foreground">
                      {user.device.loggedOut ? 'Logged out' : user.device.active ? 'Active' : 'Inactive'}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No device has connected yet. Phone on file: {user.phone ?? '—'}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
