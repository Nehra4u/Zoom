import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load backend/.env explicitly by absolute path — see test-add-user.js for why.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Turn on request/response logging inside zoomApi.js for this run.
process.env.ZOOM_DEBUG = 'true';

const { deleteZoomUser } = await import('../src/services/zoomApi.js');

// Usage:
//   node temp/test-delete-user.js <zoomUserId> [action]
// Example:
//   node temp/test-delete-user.js zOu-hZs4Q9K3abEXAMPLE
//   node temp/test-delete-user.js zOu-hZs4Q9K3abEXAMPLE disassociate
const [, , zoomUserId, action = 'delete'] = process.argv;

if (!zoomUserId) {
  console.error('Usage: node temp/test-delete-user.js <zoomUserId> [action]');
  process.exit(1);
}

const run = async () => {
  console.log('--- test-delete-user ---');
  console.log('Args:', { zoomUserId, action });

  await deleteZoomUser(zoomUserId, action);

  console.log('--- RESULT ---');
  console.log('Deleted (or already gone). Go check the Zoom dashboard Users list');
  console.log('and confirm the seat count went down by 1.');
};

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
