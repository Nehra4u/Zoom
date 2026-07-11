import { useQuery } from '@tanstack/react-query'
import { fetchZoomAccountUsers } from '@/api/admins'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ZoomHostUserFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
}

export function ZoomHostUserField({ id, value, onChange }: ZoomHostUserFieldProps) {
  const { data: zoomUsers = [], isLoading, isError } = useQuery({
    queryKey: ['admins', 'zoom-users'],
    queryFn: fetchZoomAccountUsers,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const showSelect = !isError && zoomUsers.length > 0

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Zoom host user</Label>
      {showSelect ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">Not assigned</option>
          {zoomUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
              {user.email ? ` (${user.email})` : ''}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isLoading ? 'Loading Zoom users…' : 'Zoom host user ID'}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Assign each admin their own Zoom Business user so they can host meetings and record locally
        in the Zoom desktop app.
        {isError && ' Enter the Zoom user ID manually if the user list could not be loaded.'}
      </p>
    </div>
  )
}
