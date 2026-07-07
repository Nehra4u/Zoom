import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { fetchAdmins } from '@/api/admins'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AdminStatus } from '@/types/admin'

function statusVariant(status: AdminStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'inactive') return 'warning' as const
  return 'destructive' as const
}

export function AdminListPage() {
  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: () => fetchAdmins(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button asChild>
          <Link to="/admins/new">
            <Plus className="h-4 w-4" />
            Create admin
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All admins</CardTitle>
          <CardDescription>{admins.length} account{admins.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.name}</TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{admin.role.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(admin.status)}>{admin.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admins/${admin.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
