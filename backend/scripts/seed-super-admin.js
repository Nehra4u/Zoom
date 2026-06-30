import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { Admin } from '../src/models/Admin.js';

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await Admin.findOne({ role: 'super_admin', status: { $ne: 'deleted' } });
  if (existing) {
    console.log('Super admin already exists:', existing.email);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.create({
    name: 'Super Admin',
    email: email.toLowerCase(),
    passwordHash,
    role: 'super_admin',
    status: 'active',
    createdBy: null,
  });

  console.log('Super admin created:', admin.email);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
