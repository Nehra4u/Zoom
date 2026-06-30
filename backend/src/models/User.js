import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    passwordHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'deleted'],
      default: 'pending',
    },
    zoomDisplayName: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    lastActiveAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    profileComplete: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastSdkJti: { type: String, default: null },
    lastSdkJtiExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ status: 1 });
userSchema.index({ createdBy: 1 });

export const User = mongoose.model('User', userSchema);
