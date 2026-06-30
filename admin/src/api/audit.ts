import { api } from './client'
import type { AuditLogEntry } from '@/types/audit'

export async function fetchAuditLogs(params?: { action?: string; limit?: number }) {
  const { data } = await api.get<{ logs: AuditLogEntry[]; scope: 'all' | 'own' }>('/audit-logs', {
    params,
  })
  return data
}

export async function triggerReconciliation() {
  const { data } = await api.post<{ result: unknown }>('/audit-logs/reconcile')
  return data
}
