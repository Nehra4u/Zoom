import mongoose from 'mongoose';

const sessionStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    zoomParticipantId: { type: String, default: null },
    zoomDisplayName: { type: String, required: true },
    inCall: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    meetingId: { type: String, default: null },
  },
  { timestamps: true }
);

sessionStateSchema.index({ userId: 1 });
sessionStateSchema.index({ inCall: 1 });
sessionStateSchema.index({ zoomParticipantId: 1 });

export const SessionState = mongoose.model('SessionState', sessionStateSchema);
