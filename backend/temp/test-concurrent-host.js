import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createInterface } from 'readline/promises';

// Load backend/.env explicitly (see test-add-user.js for why this matters).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.ZOOM_DEBUG = 'true';

const { createInstantMeeting, endMeeting, getZoomAccessToken } = await import('../src/services/zoomApi.js');

// This is a manual/interactive test — Zoom's "can't host 2 meetings at once"
// limit only shows up when a host actually JOINS a meeting (becomes live),
// and there is no pure REST call that does that (joining requires the real
// Zoom client/app or the Meeting SDK). So this script creates both meetings
// via the API, then pauses so YOU can actually open each one's start_url in
// your browser and try to go live in both — then it re-checks each
// meeting's status via the API so you can see what Zoom actually did.
//
// Usage:
//   node temp/test-concurrent-host.js [hostUserId]
// If you don't pass a hostUserId, it uses ZOOM_HOST_USER_ID from .env, or
// falls back to "me" (the account tied to your Server-to-Server app).

const hostUserId = process.argv[2] || process.env.ZOOM_HOST_USER_ID || 'me';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pause = (msg) => rl.question(`\n${msg}\nPress Enter here once done... `);

async function getMeetingStatus(meetingId) {
  const token = await getZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { status: 'not_found (deleted/ended)' };
  const data = await res.json();
  return { status: data.status, topic: data.topic, id: data.id };
}

async function run() {
  console.log('Host user for both meetings:', hostUserId);

  console.log('\n--- Creating Meeting 1 ---');
  const meeting1 = await createInstantMeeting({ topic: 'Concurrency Test 1', hostUserId });
  console.log('Meeting 1:', meeting1);

  await pause(
    `Open this URL in your browser and click "Start" to actually go live as host:\n  ${meeting1.startUrl}`
  );

  const status1Before = await getMeetingStatus(meeting1.zoomMeetingId);
  console.log('Meeting 1 status (should be "started"):', status1Before);

  console.log('\n--- Creating Meeting 2 (same host) ---');
  const meeting2 = await createInstantMeeting({ topic: 'Concurrency Test 2', hostUserId });
  console.log('Meeting 2:', meeting2);

  await pause(
    `While STILL live in Meeting 1, now open Meeting 2's start URL in the SAME browser/account and try to start it too:\n  ${meeting2.startUrl}\n(Note whatever Zoom shows you — a warning, an auto-switch, or nothing.)`
  );

  const status1After = await getMeetingStatus(meeting1.zoomMeetingId);
  const status2After = await getMeetingStatus(meeting2.zoomMeetingId);

  console.log('\n--- RESULTS ---');
  console.log('Meeting 1 status after trying to start Meeting 2:', status1After);
  console.log('Meeting 2 status after trying to start Meeting 2:', status2After);

  console.log('\n--- INTERPRETATION ---');
  if (status1After.status !== 'started' && status2After.status === 'started') {
    console.log('CONFIRMED: starting Meeting 2 ended/replaced Meeting 1. One host = one live meeting at a time.');
  } else if (status1After.status === 'started' && status2After.status === 'started') {
    console.log('Both show "started" — unexpected for a single standard license. Double-check you actually joined both as host, not just opened the page.');
  } else {
    console.log('Inspect the two status objects above manually — behavior can vary slightly by plan.');
  }

  await pause('Cleaning up: press Enter to end both test meetings now (safe to run even if already ended).');
  await endMeeting(meeting1.zoomMeetingId).catch(() => {});
  await endMeeting(meeting2.zoomMeetingId).catch(() => {});
  console.log('Done.');

  rl.close();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  rl.close();
  process.exit(1);
});
