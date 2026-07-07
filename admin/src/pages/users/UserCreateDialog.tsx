import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createUser } from '@/api/users'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_USERS } from '@/types/user'

interface UserCreateDialogProps {
  open: boolean
  onClose: () => void
  atLimit: boolean
}

export function UserCreateDialog({ open, onClose, atLimit }: UserCreateDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') ?? '')
    mutation.mutate({
      name,
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? '') || undefined,
      password: String(form.get('password') ?? ''),
      zoomDisplayName: String(form.get('zoomDisplayName') ?? '') || name,
      status: 'active',
    })
  }

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a new APK client account. The account is active immediately. Password must be at least 8
            characters.
          </DialogDescription>
        </DialogHeader>

        {atLimit ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            User limit reached — a maximum of {MAX_USERS} users can be created. Delete or deactivate an
            existing user to free up a slot.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Full name</Label>
              <Input id="create-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input id="create-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-phone">Phone (optional)</Label>
              <Input id="create-phone" name="phone" type="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-zoom">Zoom display name</Label>
              <Input id="create-zoom" name="zoomDisplayName" placeholder="Shown in Zoom session" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input id="create-password" name="password" type="password" minLength={8} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
