import { Admin } from '../models/Admin.js';
import { AdminRefreshToken } from '../models/AdminRefreshToken.js';
import { SystemSettings } from '../models/SystemSettings.js';
import { writeAuditLog } from './auditService.js';
import { notifyAdminLicenseExpired } from './notificationService.js';

const SETTINGS_ID = 'global';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function endOfUtcDay(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('License end date must be a valid date');
    err.status = 400;
    throw err;
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

export function parseLicenseEndDateInput(endDateInput) {
  if (endDateInput === null || endDateInput === undefined || endDateInput === '') {
    return null;
  }
  return endOfUtcDay(endDateInput);
}

export function getAdminLicenseStatus(admin) {
  if (!admin || admin.role === 'super_admin') {
    return {
      endDate: null,
      isActive: true,
      daysRemaining: null,
      expiringThisWeek: false,
    };
  }

  const endDate = admin.licenseEndDate ?? null;
  if (!endDate) {
    return {
      endDate: null,
      isActive: true,
      daysRemaining: null,
      expiringThisWeek: false,
    };
  }

  const now = Date.now();
  const endMs = new Date(endDate).getTime();
  const isActive = now <= endMs;
  const daysRemaining = isActive ? Math.ceil((endMs - now) / MS_PER_DAY) : 0;
  const expiringThisWeek = isActive && daysRemaining > 0 && daysRemaining <= 7;

  return {
    endDate,
    isActive,
    daysRemaining: isActive ? daysRemaining : 0,
    expiringThisWeek,
  };
}

export function attachLicenseFields(adminDoc) {
  const status = getAdminLicenseStatus(adminDoc);
  return {
    licenseEndDate: status.endDate,
    licenseIsActive: status.isActive,
    licenseDaysRemaining: status.daysRemaining,
    licenseExpiringThisWeek: status.expiringThisWeek,
  };
}

export async function assertAdminLicenseActive(adminId) {
  const admin = await Admin.findById(adminId).select('role licenseEndDate status').lean();
  if (!admin || admin.status !== 'active') {
    return;
  }

  const { isActive } = getAdminLicenseStatus(admin);
  if (!isActive) {
    const err = new Error('Your subscription has ended. Please contact Administration for reactivating.');
    err.status = 403;
    err.code = 'SUBSCRIPTION_EXPIRED';
    throw err;
  }
}

export async function revokeAdminSessions(adminId) {
  await AdminRefreshToken.updateMany(
    { adminId, revokedAt: null },
    { revokedAt: new Date() }
  );
  await Admin.updateOne({ _id: adminId }, { activeSessionId: null });
}

export async function enforceExpiredAdminLicense(adminId) {
  const admin = await Admin.findById(adminId).select('role licenseEndDate status').lean();
  if (!admin || admin.role === 'super_admin' || admin.status !== 'active') {
    return false;
  }

  const { isActive } = getAdminLicenseStatus(admin);
  if (isActive) {
    return false;
  }

  await revokeAdminSessions(adminId);
  notifyAdminLicenseExpired(String(adminId));
  return true;
}

export async function migrateGlobalSubscriptionToAdmins() {
  const settings = await SystemSettings.findById(SETTINGS_ID).select('subscriptionEndDate').lean();
  const globalEndDate = settings?.subscriptionEndDate ?? null;
  if (!globalEndDate) {
    return { updated: 0 };
  }

  const result = await Admin.updateMany(
    { role: 'admin', status: { $ne: 'deleted' }, licenseEndDate: null },
    { licenseEndDate: globalEndDate }
  );

  return { updated: result.modifiedCount ?? 0 };
}

export async function getSubscriptionStatusForAdmin(adminId) {
  const admin = await Admin.findById(adminId).select('role licenseEndDate').lean();
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  const status = getAdminLicenseStatus(admin);
  return {
    endDate: status.endDate,
    isActive: status.isActive,
  };
}

export async function updateAdminLicenseEndDate(adminId, endDateInput, actor) {
  const admin = await Admin.findOne({ _id: adminId, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  if (admin.role === 'super_admin') {
    const err = new Error('Super admin accounts do not use license expiry');
    err.status = 400;
    throw err;
  }

  const licenseEndDate = parseLicenseEndDateInput(endDateInput);
  admin.licenseEndDate = licenseEndDate;
  await admin.save();

  await writeAuditLog({
    actor,
    action: 'admin_license_updated',
    targetAdminId: admin._id,
    meta: { licenseEndDate },
  });

  return attachLicenseFields(admin);
}

export function startAdminLicenseExpiryJob(intervalMs = 60 * 60 * 1000) {
  const run = async () => {
    try {
      const now = new Date();
      const expiredAdmins = await Admin.find({
        role: 'admin',
        status: 'active',
        licenseEndDate: { $ne: null, $lt: now },
      }).select('_id');

      for (const admin of expiredAdmins) {
        await enforceExpiredAdminLicense(admin._id);
      }
    } catch (err) {
      console.error('[admin-license]', err.message);
    }
  };

  run();
  setInterval(run, intervalMs);
  console.log(`[admin-license] Expiry enforcement scheduled every ${intervalMs / 1000}s`);
}
