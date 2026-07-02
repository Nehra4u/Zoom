import mongoose from 'mongoose';

const recordingSchema = new mongoose.Schema(
  {
    zoomMeetingId: { type: String, required: true },
    zoomRecordingId: { type: String, required: true, unique: true },
    topic: { type: String, default: '' },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    fileType: { type: String, default: 'MP4' },
    fileSize: { type: Number, default: 0 },
    playUrlFetchedAt: { type: Date, default: null },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

recordingSchema.index({ zoomMeetingId: 1, startTime: -1 });
recordingSchema.index({ startedBy: 1, startTime: -1 });

export const Recording = mongoose.model('Recording', recordingSchema);
