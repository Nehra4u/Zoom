import type { ApkUser } from '@/types/user'

export function resolveUsername(user: Pick<ApkUser, 'username' | 'name' | 'email'>) {
  return user.username ?? user.name ?? user.email ?? ''
}
