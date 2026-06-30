export type AuditAction =
  | 'admin_created'
  | 'admin_updated'
  | 'admin_deactivated'
  | 'admin_activated'
  | 'admin_deleted'
  | 'user_created'
  | 'user_updated'
  | 'user_activated'
  | 'user_deactivated'
  | 'user_deleted'
  | 'user_force_dropped'
  | 'token_issued'
  | 'token_revoked'
  | 'recording_accessed'

export interface AuditLogEntry {
  id: string
  actorId: string
  actorName: string | null
  actorEmail: string | null
  actorRole: string
  action: AuditAction
  targetAdminId: string | null
  targetUserId: string | null
  meta: Record<string, unknown>
  createdAt: string
}
