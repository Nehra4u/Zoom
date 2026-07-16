import { DeviceSession } from '../models/DeviceSession.js';
import { User } from '../models/User.js';
import { getLiveMeetingForAdmin } from './meetingService.js';
import { issueZoomCredentialsForUser } from './zoomTokenService.js';

const HB_INTERVAL = 10;

export function getClientWebsocketUrl() {
  const raw = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(
    /\/$/,
    ''
  );
  const wsBase = raw.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}/client`;
}

export function toPublicClientUser(user) {
  return {
    uId: user._id.toString(),
    name: user.name,
    phone: user.phone ?? null,
    uStatus: user.status,
  };
}

export function mapUserFailureStatus(user) {
  if (!user || user.status === 'deleted') return 'SESSION_EXPIRED';
  if (user.status === 'pending') return 'USER_INACTIVE';
  if (user.status === 'inactive') return 'USER_DEACTIVATED';
  return null;
}

export async function resolveLiveMeetingForUser(user) {
  return getLiveMeetingForAdmin(user.createdBy?.toString());
}

export async function buildClientMeetingPayload(user, liveMeeting = null) {
  if (user.status !== 'active') return null;

  const meeting = liveMeeting ?? (await resolveLiveMeetingForUser(user));
  if (!meeting) return null;

  const { sdkJwt, sdkKey } = await issueZoomCredentialsForUser(user);
  const meetingId = meeting.meetingNumber;
  const meetingPassword = meeting.password ?? '';
  const meetingHostUrl = meeting.joinUrl ?? `https://zoom.us/j/${meetingId}`;

  const payload = {
    meetingId,
    meetingPassword,
    meetingHostUrl,
    sdkKey: sdkKey ?? null,
    jwtToken: sdkJwt,
  };

  // #region agent log
  fetch('http://127.0.0.1:7888/ingest/29879b66-38f4-4acd-a773-f8eca05bf505',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e9d75f'},body:JSON.stringify({sessionId:'e9d75f',runId:'post-fix',hypothesisId:'H5',location:'clientMeetingPayload.js:buildClientMeetingPayload',message:'built meeting payload',data:{meetingId,hasSdkKey:Boolean(payload.sdkKey),hasJwtToken:Boolean(payload.jwtToken)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return payload;
}

export async function buildClientStatusPayload(user) {
  const isActive = user.status === 'active';
  const liveMeeting = isActive ? await resolveLiveMeetingForUser(user) : null;
  const shouldBeInMeeting = Boolean(isActive && liveMeeting);

  const payload = { isActive, shouldBeInMeeting };

  if (shouldBeInMeeting) {
    const meeting = await buildClientMeetingPayload(user, liveMeeting);
    if (meeting) {
      Object.assign(payload, meeting);
    } else {
      payload.shouldBeInMeeting = false;
    }
  }

  return payload;
}

async function validateDeviceSession(userId, deviceId) {
  if (!deviceId) return null;

  const session = await DeviceSession.findOne({ userId, active: true, loggedOut: false });
  if (session && session.deviceId !== deviceId) {
    return {
      success: false,
      currentStatus: 'DEVICE_CONFLICT',
      user: null,
      meeting: null,
      websocket: null,
      message: 'This account is active on another device.',
    };
  }
  if (!session) {
    return {
      success: false,
      currentStatus: 'LOGGED_OUT',
      user: null,
      meeting: null,
      websocket: null,
      message: 'You have been logged out. Please login again.',
    };
  }

  await DeviceSession.updateOne({ _id: session._id }, { lastSeenAt: new Date() });
  return null;
}

export async function buildHomeResponse(user, deviceId = null) {
  const deviceError = await validateDeviceSession(user._id, deviceId);
  if (deviceError) return deviceError;

  const failureStatus = mapUserFailureStatus(user);
  if (failureStatus) {
    const messages = {
      SESSION_EXPIRED: 'Your session has expired. Please login again.',
      USER_INACTIVE: 'Your account is inactive. Please contact support.',
      USER_DEACTIVATED: 'Your account has been deactivated. Please contact support.',
    };
    return {
      success: false,
      currentStatus: failureStatus,
      user: null,
      meeting: null,
      websocket: null,
      message: messages[failureStatus],
    };
  }

  const websocket = { url: getClientWebsocketUrl(), hbInterval: HB_INTERVAL };
  const meeting = await buildClientMeetingPayload(user);

  // #region agent log
  fetch('http://127.0.0.1:7888/ingest/29879b66-38f4-4acd-a773-f8eca05bf505',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e9d75f'},body:JSON.stringify({sessionId:'e9d75f',runId:'post-fix',hypothesisId:'H4',location:'clientMeetingPayload.js:buildHomeResponse',message:'home response branch',data:{userId:user._id?.toString(),hasMeeting:Boolean(meeting),meetingHasSdkKey:Boolean(meeting?.sdkKey),adminId:user.createdBy?.toString()},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (!meeting) {
    return {
      success: true,
      currentStatus: 'NO_MEETING_ASSIGNED',
      message: 'No meeting has been assigned yet.',
      user: toPublicClientUser(user),
      meeting: null,
      websocket,
    };
  }

  return {
    success: true,
    currentStatus: 'SUCCESS',
    message: 'Home data loaded successfully.',
    user: toPublicClientUser(user),
    meeting,
    websocket,
  };
}

export async function getClientUserIdsForAdmin(adminId) {
  if (!adminId) return [];
  const users = await User.find({ createdBy: adminId, status: { $ne: 'deleted' } });
  return users.map((u) => u._id.toString());
}
