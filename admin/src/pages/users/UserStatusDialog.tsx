import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { activateUser, deactivateUser, deleteUser, logoutUser } from '@/api/users'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ApkUser } from '@/types/user'

type StatusAction = 'activate' | 'deactivate' | 'logout' | 'delete'

const ACTIONS: { key: StatusAction; label: string; description: string; icon: LucideIcon }[] = [
  { key: 'activate', label: 'Activate', description: 'Allow this user to log in and join meetings', icon: ShieldCheck },
  { key: 'deactivate', label: 'Deactivate', description: 'Disable the account and force-leave any live call', icon: ShieldOff },
  { key: 'logout', label: 'Logout', description: "Sign the user's devices out without disabling the account", icon: LogOut },
  { key: 'delete', label: 'Delete', description: 'Soft-delete this account permanently', icon: Trash2 },
]

function currentActionFor(user: ApkUser): StatusAction {
  if (user.device?.loggedOut) return 'logout'
  if (user.status === 'inactive') return 'deactivate'
  return 'activate'
}

interface UserStatusDialogProps {
  user: ApkUser | null
  onClose: () => void
}

export function UserStatusDialog({ user, onClose }: UserStatusDialogProps) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<StatusAction>('activate')

  useEffect(() => {
    if (user) setAction(currentActionFor(user))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const activateMutation = useMutation({
    mutationFn: () => activateUser(user!.id),
    onSuccess: () => {
      invalidateUsers()
      toast.success('User activated — rejoin signal sent')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateUser(user!.id),
    onSuccess: () => {
      invalidateUsers()
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      toast.success('User deactivated — client notified')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(user!.id),
    onSuccess: () => {
      invalidateUsers()
      queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      toast.success('User logged out of all devices')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user!.id),
    onSuccess: () => {
      invalidateUsers()
      toast.success('User deleted')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const isPending =
    activateMutation.isPending || deactivateMutation.isPending || logoutMutation.isPending || deleteMutation.isPending

  function handleOpenChange(open: boolean) {
    if (!open) {
      setAction('activate')
      onClose()
    }
  }

  function handleUpdate() {
    if (action === 'activate') activateMutation.mutate()
    else if (action === 'deactivate') deactivateMutation.mutate()
    else if (action === 'logout') logoutMutation.mutate()
    else if (action === 'delete') deleteMutation.mutate()
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>Update status</DialogTitle>
              <DialogDescription>Choose an action for {user.name}, then confirm with Update.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              {ACTIONS.map((item) => {
                const Icon = item.icon
                const isSelected = action === item.key
                const isCurrent = item.key === currentActionFor(user)
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAction(item.key)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      isSelected
                        ? isCurrent
                          ? 'border-success bg-success/5'
                          : 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isCurrent ? 'text-success' : item.key === 'delete' ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'block text-sm',
                            isCurrent
                              ? 'font-bold text-success'
                              : item.key === 'delete'
                                ? 'font-medium text-destructive'
                                : 'font-medium text-foreground'
                          )}
                        >
                          {item.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-success">
                            Current
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={action === 'delete' ? 'destructive' : 'default'}
                disabled={isPending}
                onClick={handleUpdate}
              >
                {isPending ? 'Updating…' : 'Update'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
