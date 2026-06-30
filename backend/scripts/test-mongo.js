/**
 * Test MongoDB Atlas / local connection
 * Usage: npm run test:mongo
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}

console.log('Connecting to MongoDB…');
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  const ping = await db.admin().command({ ping: 1 });
  const collections = await db.listCollections().toArray();
  console.log('Connected successfully');
  console.log('  Database:', db.databaseName);
  console.log('  Ping:', ping.ok === 1 ? 'ok' : ping);
  console.log(
    '  Collections:',
    collections.length ? collections.map((c) => c.name).join(', ') : '(empty — run npm run seed)'
  );
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('Connection failed:', err.message);
  if (err.message.includes('whitelist')) {
    console.error('\nFix: MongoDB Atlas → Network Access → Add Current IP Address (or 0.0.0.0/0 for dev)');
  }
  process.exit(1);
}
