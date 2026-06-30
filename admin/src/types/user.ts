export type UserStatus = 'pending' | 'active' | 'inactive' | 'deleted'

export interface ApkUser {
  id: string
  name: string
  email: string
  phone: string | null
  status: UserStatus
  zoomDisplayName: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastActiveAt: string | null
}
