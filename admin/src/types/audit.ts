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
  | 'user_logged_out'
  | 'token_issued'
  | 'token_revoked'
  | 'recording_accessed'
  | 'recording_removed'
  | 'recording_expired'
  | 'settings_updated'

export interface AuditLogEntry {
  id: string
  actorId: string
  actorName: string | null
  actorEmail: string | null
  actorRole: string
  action: AuditAction
  targetAdminId: string | null
  targetAdminName: string | null
  targetUserId: string | null
  targetUserName: string | null
  targetUserPhone: string | null
  meta: Record<string, unknown>
  createdAt: string
}
