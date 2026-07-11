import { api } from './client'
import type { ApkUser, UserStatus } from '@/types/user'

export async function fetchUsers(params?: { status?: UserStatus }) {
  const { data } = await api.get<{ users: ApkUser[] }>('/users', { params })
  return data.users
}

export async function fetchUser(id: string) {
  const { data } = await api.get<{ user: ApkUser }>(`/users/${id}`)
  return data.user
}

export async function createUser(payload: {
  username: string
  password: string
  phone?: string
  email?: string
  status?: UserStatus
}) {
  const { data } = await api.post<{ user: ApkUser }>('/users', payload)
  return data.user
}

export async function updateUser(
  id: string,
  payload: {
    username?: string
    email?: string
    phone?: string
    zoomDisplayName?: string
    status?: UserStatus
  }
) {
  const { data } = await api.patch<{ user: ApkUser }>(`/users/${id}`, payload)
  return data.user
}

export async function activateUser(id: string) {
  const { data } = await api.post<{ user: ApkUser }>(`/users/${id}/activate`)
  return data.user
}

export async function deactivateUser(id: string) {
  const { data } = await api.post<{ user: ApkUser }>(`/users/${id}/deactivate`)
  return data.user
}

export async function logoutUser(id: string) {
  const { data } = await api.post<{ user: ApkUser }>(`/users/${id}/logout`)
  return data.user
}

export async function deleteUser(id: string) {
  const { data } = await api.delete<{ user: ApkUser }>(`/users/${id}`)
  return data.user
}
