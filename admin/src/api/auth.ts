import { api } from './client'
import type { Admin } from '@/types/admin'

export async function fetchAdminProfile() {
  const { data } = await api.get<{ admin: Admin }>('/auth/admin/me')
  return data.admin
}

export async function updateAdminProfile(payload: { name?: string; email?: string }) {
  const { data } = await api.patch<{ admin: Admin }>('/auth/admin/me', payload)
  return data.admin
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post<{ ok: boolean }>('/auth/admin/change-password', {
    currentPassword,
    newPassword,
  })
  return data
}
