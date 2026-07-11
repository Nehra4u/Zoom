export type UserStatus = 'pending' | 'active' | 'inactive' | 'deleted'

export interface UserDevice {
  deviceId: string
  deviceModel: string | null
  manufacturer: string | null
  androidVersion: number | null
  appVersion: string | null
  active: boolean
  loggedOut: boolean
}

export interface ApkUser {
  id: string
  username: string
  name: string
  email: string | null
  phone: string | null
  status: UserStatus
  zoomDisplayName: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastActiveAt: string | null
  lastSeenAt: string | null
  device: UserDevice | null
  isOnline: boolean
}

export const MAX_USERS = 300
