import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load backend/.env explicitly by absolute path, so this works no matter
// which folder you run the script from (fixes the "always mock" issue you
// get if you `cd temp && node test-add-user.js` — dotenv otherwise only
// looks for .env in your current working directory).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Turn on request/response logging inside zoomApi.js for this run.
process.env.ZOOM_DEBUG = 'true';

const { createZoomUser } = await import('../src/services/zoomApi.js');

// Usage:
//   node temp/test-add-user.js <email> [firstName] [lastName] [action]
// Example:
//   node temp/test-add-user.js jane.doe@yourdomain.com Jane Doe create
const [, , email, firstName = 'Test', lastName = 'Admin', action = 'create'] = process.argv;

if (!email) {
  console.error('Usage: node temp/test-add-user.js <email> [firstName] [lastName] [action]');
  process.exit(1);
}

const run = async () => {
  console.log('--- test-add-user ---');
  console.log('Args:', { email, firstName, lastName, action });

  const created = await createZoomUser({ email, firstName, lastName, action });

  console.log('--- RESULT ---');
  console.log(created);

  if (String(created.id).startsWith('mock-zoom-user-')) {
    console.log('');
    console.log('NOTE: this is a MOCK result, not a real Zoom API call.');
    console.log('Check the "[zoomApi] mock mode is ON because:" log above this line —');
    console.log('it tells you exactly which env var is missing or which one forced mock mode.');
  } else {
    console.log('');
    console.log('This is a REAL Zoom user. Save this id as the zoomHostUserId, and use');
    console.log('temp/test-delete-user.js ' + created.id + '  to remove it once you\'re done testing.');
  }
};

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
