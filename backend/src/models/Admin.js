import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'super_admin'], default: 'admin' },
    status: { type: String, enum: ['active', 'inactive', 'deleted'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    /** Zoom user ID on your Business account — each admin should have their own for parallel meetings */
    zoomHostUserId: { type: String, default: null, trim: true },
    /** Active portal session — only one device/tab at a time */
    activeSessionId: { type: String, default: null },
    /** Optional license expiry for regular admins (end of UTC day); null = no expiry */
    licenseEndDate: { type: Date, default: null },
  },
  { timestamps: true }
);

adminSchema.index({ role: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ createdBy: 1 });
adminSchema.index({ email: 1 }, { unique: true, sparse: true });
adminSchema.index({ phone: 1 }, { unique: true, sparse: true });
adminSchema.index({ role: 1, licenseEndDate: 1 });

export const Admin = mongoose.model('Admin', adminSchema);
