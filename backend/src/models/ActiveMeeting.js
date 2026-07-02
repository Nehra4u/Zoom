import mongoose from 'mongoose';

const activeMeetingSchema = new mongoose.Schema(
  {
    meetingNumber: { type: String, required: true },
    password: { type: String, default: '' },
    zoomMeetingUuid: { type: String, required: true },
    zoomMeetingId: { type: String, default: null },
    hostUserId: { type: String, default: null },
    startUrl: { type: String, default: null },
    joinUrl: { type: String, default: null },
    topic: { type: String, default: 'ZoomControl Session' },
    hostDisplayName: { type: String, default: null },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

activeMeetingSchema.index({ status: 1 });
activeMeetingSchema.index({ startedBy: 1, status: 1 });
activeMeetingSchema.index({ startedAt: -1 });

export const ActiveMeeting = mongoose.model('ActiveMeeting', activeMeetingSchema);
