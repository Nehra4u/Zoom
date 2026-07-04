import { User } from '../models/User.js';
import { buildHomeResponse } from './clientMeetingPayload.js';

export async function getHomeData(userId, deviceId) {
  const user = await User.findById(userId);
  if (!user) {
    return {
      success: false,
      currentStatus: 'SESSION_EXPIRED',
      user: null,
      meeting: null,
      websocket: null,
      message: 'Your session has expired. Please login again.',
    };
  }
  return buildHomeResponse(user, deviceId);
}
