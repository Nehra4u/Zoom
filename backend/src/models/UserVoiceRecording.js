import mongoose from 'mongoose';

const userVoiceRecordingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    s3Key: { type: String, required: true },
    s3Bucket: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSizeBytes: { type: Number, required: true, min: 0 },
    durationMs: { type: Number, default: 0, min: 0 },
    recordedAt: { type: Date, required: true },
    deviceId: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

userVoiceRecordingSchema.index({ userId: 1, recordedAt: -1 });
userVoiceRecordingSchema.index({ managedBy: 1, recordedAt: -1 });

export const UserVoiceRecording = mongoose.model('UserVoiceRecording', userVoiceRecordingSchema);
