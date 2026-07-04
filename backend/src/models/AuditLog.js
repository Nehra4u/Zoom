import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    actorRole: { type: String, enum: ['admin', 'super_admin'], required: true },
    action: {
      type: String,
      enum: [
        'admin_created',
        'admin_updated',
        'admin_deactivated',
        'admin_activated',
        'admin_deleted',
        'user_created',
        'user_updated',
        'user_activated',
        'user_deactivated',
        'user_deleted',
        'user_force_dropped',
        'token_issued',
        'token_revoked',
        'recording_accessed',
        'recording_removed',
        'settings_updated',
        'meeting_started',
        'meeting_ended',
        'participant_removed',
        'participant_muted',
        'participant_unmuted',
        'admin_join_token_issued',
      ],
      required: true,
    },
    targetAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetAdminId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
