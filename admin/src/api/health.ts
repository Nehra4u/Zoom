import { api } from './client'

export interface HealthStatus {
  ok: boolean
  service: string
  reconciliation: {
    lastRunAt: string | null
    lastRunStatus: string
  }
}

export async function fetchHealth() {
  const { data } = await api.get<HealthStatus>('/health')
  return data
}
