import { api } from './client'
import type { Admin, AuthResponse } from '@/types/admin'

export async function loginAdmin(identifier: string, password: string) {
  const trimmed = identifier.trim()
  const { data } = await api.post<AuthResponse>('/auth/admin/login', {
    identifier: trimmed,
    // Backward compat: older backend deployments only read `email`.
    ...(trimmed.includes('@') ? { email: trimmed } : {}),
    password,
  })
  return data
}

export async function logoutAdmin(refreshToken: string | null) {
  if (refreshToken) {
    await api.post('/auth/admin/logout', { refreshToken })
  }
}

export async function fetchAdmins(params?: { status?: string; role?: string }) {
  const { data } = await api.get<{ admins: Admin[] }>('/admins', { params })
  return data.admins
}

export async function fetchAdmin(id: string) {
  const { data } = await api.get<{ admin: Admin }>(`/admins/${id}`)
  return data.admin
}

export async function createAdmin(payload: {
  name: string
  email?: string
  password: string
  phone?: string
  role?: 'admin' | 'super_admin'
  zoomHostUserId?: string | null
  licenseEndDate?: string | null
}) {
  const { data } = await api.post<{ admin: Admin }>('/admins', payload)
  return data.admin
}

export interface ZoomAccountUser {
  id: string
  email: string | null
  displayName: string
}

export async function fetchZoomAccountUsers() {
  const { data } = await api.get<{ users: ZoomAccountUser[] }>('/admins/zoom-users')
  return data.users
}

export async function updateAdmin(
  id: string,
  payload: {
    name?: string
    email?: string
    phone?: string
    role?: string
    zoomHostUserId?: string | null
    licenseEndDate?: string | null
  }
) {
  const { data } = await api.patch<{ admin: Admin }>(`/admins/${id}`, payload)
  return data.admin
}

export async function activateAdmin(id: string) {
  const { data } = await api.post<{ admin: Admin }>(`/admins/${id}/activate`)
  return data.admin
}

export async function deactivateAdmin(id: string) {
  const { data } = await api.post<{ admin: Admin }>(`/admins/${id}/deactivate`)
  return data.admin
}

export async function deleteAdmin(id: string) {
  const { data } = await api.delete<{ admin: Admin }>(`/admins/${id}`)
  return data.admin
}
