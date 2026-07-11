/**
 * One-time migration: copy legacy `email` field to `username` and drop `profileComplete`.
 *
 * Usage: node scripts/migrate-email-to-username.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';

async function migrate() {
  await connectDb();
  const db = mongoose.connection.db;
  const collection = db.collection('users');

  const users = await collection.find({}).toArray();
  let migrated = 0;

  for (const user of users) {
    const updates = {};
    const unset = {};

    if (!user.username && user.email) {
      updates.username = String(user.email).toLowerCase().trim();
      updates.name = user.name || updates.username;
      updates.zoomDisplayName = user.zoomDisplayName || updates.username;
    }

    if (user.profileComplete !== undefined) {
      unset.profileComplete = '';
    }

    if (Object.keys(updates).length > 0 || Object.keys(unset).length > 0) {
      await collection.updateOne(
        { _id: user._id },
        {
          ...(Object.keys(updates).length > 0 ? { $set: updates } : {}),
          ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        }
      );
      migrated += 1;
    }
  }

  // Drop legacy unique index on email if it exists
  try {
    const indexes = await collection.indexes();
    for (const idx of indexes) {
      if (idx.key?.email && idx.unique) {
        await collection.dropIndex(idx.name);
        console.log('Dropped legacy email index:', idx.name);
      }
    }
  } catch (err) {
    console.warn('Index cleanup skipped:', err.message);
  }

  console.log(`Migration complete — updated ${migrated} user(s).`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
