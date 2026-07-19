import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { createAdmin } from '@/api/admins'
import { getErrorMessage } from '@/api/client'
import { ZoomHostUserField } from '@/components/ZoomHostUserField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AdminCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin')
  const [zoomHostUserId, setZoomHostUserId] = useState('')
  const [licenseEndDate, setLicenseEndDate] = useState('')

  const mutation = useMutation({
    mutationFn: createAdmin,
    onSuccess: (admin) => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('Admin created')
      navigate(`/admins/${admin.id}`)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      name,
      email: email || undefined,
      phone: phone || undefined,
      password,
      role,
      zoomHostUserId: zoomHostUserId.trim() || null,
      licenseEndDate: role === 'admin' && licenseEndDate.trim() ? licenseEndDate : undefined,
    })
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>Name and password are required. Email and phone are optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'super_admin')}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>
            {role === 'admin' && (
              <>
                <ZoomHostUserField
                  id="zoom-host"
                  value={zoomHostUserId}
                  onChange={setZoomHostUserId}
                />
                <div className="space-y-2">
                  <Label htmlFor="license-end">License expiry date (optional)</Label>
                  <Input
                    id="license-end"
                    type="date"
                    value={licenseEndDate}
                    onChange={(e) => setLicenseEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating…' : 'Create admin'}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admins">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
