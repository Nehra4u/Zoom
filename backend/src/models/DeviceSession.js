import crypto from 'crypto';
import mongoose from 'mongoose';

const deviceSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    deviceModel: { type: String, default: null },
    manufacturer: { type: String, default: null },
    androidVersion: { type: Number, default: null },
    appVersion: { type: String, default: null },
    active: { type: Boolean, default: true },
    loggedOut: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceSessionSchema.index({ userId: 1, active: 1 });
deviceSessionSchema.index({ sessionId: 1 });

export function generateSessionId() {
  return 'ses_' + crypto.randomBytes(16).toString('hex');
}

export const DeviceSession = mongoose.model('DeviceSession', deviceSessionSchema);
