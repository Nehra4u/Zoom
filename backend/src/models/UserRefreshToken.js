import mongoose from 'mongoose';

const userRefreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserRefreshToken = mongoose.model('UserRefreshToken', userRefreshTokenSchema);
