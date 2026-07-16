import { api } from './client'
import type { ApkUser, UserStatus } from '@/types/user'

type RawApkUser = ApkUser & { name?: string }

function normalizeApkUser(raw: RawApkUser): ApkUser {
  const username = raw.username ?? raw.name ?? ''
  return { ...raw, username, name: raw.name ?? username }
}

export async function fetchUsers(params?: { status?: UserStatus }) {
  const { data } = await api.get<{ users: RawApkUser[] }>('/users', { params })
  return data.users.map(normalizeApkUser)
}

export async function fetchUser(id: string) {
  const { data } = await api.get<{ user: RawApkUser }>(`/users/${id}`)
  return normalizeApkUser(data.user)
}

export async function createUser(payload: {
  username: string
  password: string
  phone?: string
  email: string
  status?: UserStatus
}) {
  const { data } = await api.post<{ user: RawApkUser }>('/users', {
    username: payload.username.trim(),
    email: payload.email.trim(),
    password: payload.password,
    phone: payload.phone,
    status: payload.status,
  })
  return normalizeApkUser(data.user)
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
  const body: Record<string, string | undefined> = {}
  if (payload.username !== undefined) body.username = payload.username.trim()
  if (payload.email !== undefined) body.email = payload.email || undefined
  if (payload.phone !== undefined) body.phone = payload.phone
  if (payload.zoomDisplayName !== undefined) body.zoomDisplayName = payload.zoomDisplayName
  if (payload.status !== undefined) body.status = payload.status

  const { data } = await api.patch<{ user: RawApkUser }>(`/users/${id}`, body)
  return normalizeApkUser(data.user)
}

export async function activateUser(id: string) {
  const { data } = await api.post<{ user: RawApkUser }>(`/users/${id}/activate`)
  return normalizeApkUser(data.user)
}

export async function deactivateUser(id: string) {
  const { data } = await api.post<{ user: RawApkUser }>(`/users/${id}/deactivate`)
  return normalizeApkUser(data.user)
}

export async function logoutUser(id: string) {
  const { data } = await api.post<{ user: RawApkUser }>(`/users/${id}/logout`)
  return normalizeApkUser(data.user)
}

export async function deleteUser(id: string) {
  const { data } = await api.delete<{ user: RawApkUser }>(`/users/${id}`)
  return normalizeApkUser(data.user)
}
