import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    recordingRetentionDays: { type: Number, default: null, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

export const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema, 'system_settings');
