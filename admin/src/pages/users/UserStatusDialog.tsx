import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, LogOut, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
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

function currentActionFor(user: ApkUser): StatusAction | null {
  if (user.device?.loggedOut) return 'logout'
  if (user.status === 'inactive') return 'deactivate'
  if (user.status === 'active') return 'activate'
  return null
}

interface UserStatusDialogProps {
  user: ApkUser | null
  onClose: () => void
}

export function UserStatusDialog({ user, onClose }: UserStatusDialogProps) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<StatusAction | null>(null)

  useEffect(() => {
    if (user) setAction(null)
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
      setAction(null)
      onClose()
    }
  }

  function handleUpdate() {
    if (!action) return
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

            <div className="space-y-2">
              {ACTIONS.map((item) => {
                const Icon = item.icon
                const isSelected = action === item.key
                const isCurrent = item.key === currentActionFor(user)
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setAction(item.key)}
                    className={cn(
                      'group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200',
                      isSelected
                        ? item.key === 'delete'
                          ? 'border-destructive/50 bg-destructive/8 shadow-md shadow-destructive/10 ring-2 ring-destructive/15'
                          : 'border-primary/55 bg-primary/8 shadow-md shadow-primary/10 ring-2 ring-primary/15'
                        : isCurrent
                          ? 'cursor-not-allowed border-border/60 bg-muted/50 opacity-60 grayscale-[0.2]'
                          : 'cursor-pointer border-white/80 bg-white/40 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/75 hover:shadow-sm'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                        isSelected
                          ? item.key === 'delete'
                            ? 'bg-destructive text-white'
                            : 'bg-primary text-primary-foreground'
                          : isCurrent
                            ? 'bg-muted text-muted-foreground'
                            : item.key === 'delete'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-chart-1/10 text-chart-1'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'block text-sm',
                            item.key === 'delete'
                              ? 'font-medium text-destructive'
                              : 'font-semibold text-foreground'
                          )}
                        >
                          {item.label}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-muted-foreground/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                            Current status
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <span
                      className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
                        isSelected
                          ? item.key === 'delete'
                            ? 'border-destructive bg-destructive text-white'
                            : 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/80 bg-white/50 text-transparent'
                      )}
                    >
                      <Check className="h-3 w-3" />
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
                disabled={isPending || action === null}
                onClick={handleUpdate}
              >
                {isPending ? 'Updating…' : action ? 'Apply update' : 'Select an update'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
