import 'dotenv/config';
import { createZoomUser, deleteZoomUser } from '../src/services/zoomApi.js';

// Scratch script to manually verify createZoomUser / deleteZoomUser against
// your real Zoom account. Requires backend/.env to have ZOOM_MOCK=false and
// valid ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET.
//
// Run from the backend/ folder:
//   node temp/test-zoom-user.js
//
// Delete this whole temp/ folder once you're done verifying.

const testEmail = 'zoomcontrol-test-user@yourdomain.com'; // use a real, reachable address

const run = async () => {
  console.log('Creating licensed user for', testEmail, '...');
  const created = await createZoomUser({
    email: testEmail,
    firstName: 'Test',
    lastName: 'Admin',
  });
  console.log('Created:', created);

  console.log('Waiting 5s before cleanup...');
  await new Promise((r) => setTimeout(r, 5000));

  console.log('Deleting', created.id, '...');
  await deleteZoomUser(created.id);
  console.log('Deleted OK');
};

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
