/**
 * Verify Zoom credentials and print webhook URL + host user ID hint
 * Usage: npm run zoom:check
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import {
  createInstantMeeting,
  fetchZoomHostUserId,
  getZoomAccessToken,
  isMockMode,
  normalizeMeetingNumber,
  verifyMeetingExists,
} from '../src/services/zoomApi.js';
import { generateZoomSdkJwt } from '../src/services/zoomTokenService.js';

const publicUrl = process.env.PUBLIC_API_URL ?? '(set PUBLIC_API_URL in .env)';
const webhookUrl = publicUrl.startsWith('http') ? `${publicUrl.replace(/\/$/, '')}/api/webhooks/zoom` : null;

console.log('ZoomControl — Zoom setup check\n');

if (isMockMode()) {
  console.log('Mode: ZOOM_MOCK (or OAuth credentials missing)');
  console.log('  Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and ZOOM_MOCK=false for production.\n');
} else {
  console.log('Mode: Live Zoom API');
  try {
    const token = await getZoomAccessToken();
    console.log('  OAuth token: OK (length', token.length, ')');

    const hostId = process.env.ZOOM_HOST_USER_ID || (await fetchZoomHostUserId());
    console.log('  Host user ID:', hostId);
    if (!process.env.ZOOM_HOST_USER_ID) {
      console.log('  → Add to .env: ZOOM_HOST_USER_ID=' + hostId);
    }
  } catch (err) {
    console.error('  OAuth failed:', err.message);
    process.exit(1);
  }
}

const sdkOk = Boolean(process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET);
console.log('Meeting SDK:', sdkOk ? 'configured' : 'missing ZOOM_SDK_KEY / ZOOM_SDK_SECRET');
console.log('Webhook secret:', process.env.ZOOM_WEBHOOK_SECRET_TOKEN ? 'set' : 'missing ZOOM_WEBHOOK_SECRET_TOKEN');

if (!isMockMode() && sdkOk) {
  try {
    const hostUserId = process.env.ZOOM_HOST_USER_ID || (await fetchZoomHostUserId());
    const testMeeting = await createInstantMeeting({
      topic: 'ZoomControl setup check',
      hostUserId,
    });
    const meetingNumber = normalizeMeetingNumber(testMeeting.meetingNumber);
    const verified = await verifyMeetingExists(meetingNumber);
    const { token: sdkJwt } = generateZoomSdkJwt(meetingNumber, 0);
    const payload = jwt.decode(sdkJwt);

    console.log('\nMeeting number alignment:');
    console.log('  Created meeting ID:', meetingNumber);
    console.log('  Zoom API verify:', verified ? 'OK' : 'FAILED');
    console.log('  JWT mn:', payload?.mn ?? '(missing)');
    console.log('  mn matches:', payload?.mn === meetingNumber ? 'yes' : 'NO — fix SDK credentials');
    console.log('  video_webrtc_mode:', payload?.video_webrtc_mode ?? '(missing)');

    if (payload?.mn !== meetingNumber) {
      console.warn('\n  WARNING: SDK JWT mn does not match meeting number.');
      console.warn('  Ensure Meeting SDK app and Server-to-Server OAuth app are on the same Zoom account.');
    }

    const { endMeeting } = await import('../src/services/zoomApi.js');
    await endMeeting(testMeeting.zoomMeetingUuid || meetingNumber);
    console.log('  Test meeting cleaned up.');
  } catch (err) {
    console.warn('\nMeeting alignment check failed:', err.message);
    console.warn('  If join fails with error 3707, verify both Zoom apps use the same account.');
  }
} else if (!sdkOk) {
  console.log('\nSkipping meeting alignment check — Meeting SDK credentials missing.');
}

if (webhookUrl) {
  console.log('\nRegister this webhook URL in Zoom Marketplace → Event Subscriptions:');
  console.log(' ', webhookUrl);
  console.log('\nEvents: meeting.participant_joined, meeting.participant_left,');
  console.log('        meeting.participant_audio_muted, meeting.participant_audio_unmuted,');
  console.log('        meeting.ended, recording.completed');
} else {
  console.log('\nSet PUBLIC_API_URL=https://your-ngrok-id.ngrok.io in .env to print webhook URL.');
}

console.log('\nZoom account settings (one-time):');
console.log('  • Enable Cloud recording');
console.log('  • Allow join before host');
console.log('  • Disable waiting room (recommended for APK flow)');
console.log('  • Meeting SDK and OAuth apps must belong to the same Zoom account');
