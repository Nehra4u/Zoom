/**
 * Verify Zoom credentials and print webhook URL + host user ID hint
 * Usage: npm run zoom:check
 */
import 'dotenv/config';
import {
  fetchZoomHostUserId,
  getZoomAccessToken,
  isMockMode,
} from '../src/services/zoomApi.js';

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
