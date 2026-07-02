import { api } from './client'
import type { Admin, AuthResponse } from '@/types/admin'

export async function loginAdmin(email: string, password: string) {
  const { data } = await api.post<AuthResponse>('/auth/admin/login', { email, password })
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
  email: string
  password: string
  role?: 'admin' | 'super_admin'
}) {
  const { data } = await api.post<{ admin: Admin }>('/admins', payload)
  return data.admin
}

export async function updateAdmin(
  id: string,
  payload: { name?: string; email?: string; role?: string; zoomHostUserId?: string | null }
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
