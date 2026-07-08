export type AdminRole = 'admin' | 'super_admin'
export type AdminStatus = 'active' | 'inactive' | 'deleted'

export interface Admin {
  id: string
  name: string
  email: string
  role: AdminRole
  status: AdminStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
  zoomHostUserId: string | null
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  admin: Admin
  sessionId?: string
}

export interface JwtPayload {
  sub: string
  role: AdminRole
  type: string
  email: string
  exp: number
}
