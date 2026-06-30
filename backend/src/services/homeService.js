import { User } from '../models/User.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { getLiveMeeting } from './meetingService.js';

export async function getHomeData(userId, deviceId) {
  const user = await User.findById(userId);

  if (!user || user.status === 'deleted') {
    return { success: false, status: 'SESSION_EXPIRED', message: 'Your session has expired. Please login again.' };
  }

  if (user.status === 'inactive') {
    return { success: false, status: 'USER_INACTIVE', message: 'Your account is inactive. Please contact support.' };
  }

  if (user.status === 'deactivated') {
    return { success: false, status: 'USER_DEACTIVATED', message: 'Your account has been deactivated. Please contact support.' };
  }

  // Validate device if provided
  if (deviceId) {
    const session = await DeviceSession.findOne({ userId, active: true, loggedOut: false });
    if (session && session.deviceId !== deviceId) {
      return {
        success: false,
        status: 'DEVICE_CONFLICT',
        message: 'This account is active on another device.',
      };
    }
    if (!session) {
      return { success: false, status: 'LOGGED_OUT', message: 'You have been logged out. Please login again.' };
    }
    // Update lastSeenAt
    await DeviceSession.updateOne({ _id: session._id }, { lastSeenAt: new Date() });
  }

  // Fetch live meeting
  const liveMeeting = await getLiveMeeting();

  const publicUrl = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

  if (!liveMeeting) {
    return {
      success: true,
      status: 'NO_MEETING_ASSIGNED',
      message: 'No meeting has been assigned yet.',
      user: {
        userId: user._id.toString(),
        name: user.name,
        phone: user.phone ?? null,
        active: true,
      },
      meeting: null,
      websocket: {
        url: `${publicUrl}/client`,
        heartbeatIntervalSeconds: 10,
      },
    };
  }

  const meetingLink = `https://zoom.us/j/${liveMeeting.meetingNumber}`;

  return {
    success: true,
    status: 'SUCCESS',
    message: 'Home data loaded successfully.',
    user: {
      userId: user._id.toString(),
      name: user.name,
      phone: user.phone ?? null,
      active: true,
    },
    meeting: {
      meetingId: liveMeeting.meetingNumber,
      meetingLink,
      meetingPassword: liveMeeting.password ?? '',
      sdkKey: process.env.ZOOM_SDK_KEY ?? null,
      title: liveMeeting.topic ?? 'ZoomControl Session',
      hostName: 'ZoomMeet Support',
      startsAt: liveMeeting.startedAt?.toISOString() ?? null,
      timezone: 'Asia/Kolkata',
    },
    websocket: {
      url: `${publicUrl}/client`,
      heartbeatIntervalSeconds: 10,
    },
  };
}
