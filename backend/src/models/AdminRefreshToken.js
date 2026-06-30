import mongoose from 'mongoose';

const adminRefreshTokenSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminRefreshToken = mongoose.model('AdminRefreshToken', adminRefreshTokenSchema);
