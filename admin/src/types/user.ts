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
  name: string
  email: string
  phone: string | null
  status: UserStatus
  zoomDisplayName: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastActiveAt: string | null
  /** Most recent activity across login / socket heartbeats — falls back to lastActiveAt. */
  lastSeenAt: string | null
  /** Most recently seen device session for this user, if any has connected. */
  device: UserDevice | null
  /**
   * True only while the user has a live, currently-connected websocket right now.
   * This is distinct from `status === 'active'` ("Activated" — the account is eligible to
   * use the app), which says nothing about whether the user is online this instant.
   */
  isOnline: boolean
}

export const MAX_USERS = 300
