import {
  endOfUtcDay,
  getAdminLicenseStatus,
  parseLicenseEndDateInput,
} from '../src/services/adminLicenseService.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return endOfUtcDay(date);
}

function runCase(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

runCase('super admin is always licensed', () => {
  const status = getAdminLicenseStatus({ role: 'super_admin', licenseEndDate: daysFromNow(-1) });
  assert(status.isActive === true, 'expected active');
  assert(status.endDate === null, 'expected null endDate');
});

runCase('null licenseEndDate means unlimited', () => {
  const status = getAdminLicenseStatus({ role: 'admin', licenseEndDate: null });
  assert(status.isActive === true, 'expected active');
  assert(status.daysRemaining === null, 'expected null daysRemaining');
  assert(status.expiringThisWeek === false, 'expected not expiring');
});

runCase('expired license is inactive', () => {
  const status = getAdminLicenseStatus({
    role: 'admin',
    licenseEndDate: daysFromNow(-2),
  });
  assert(status.isActive === false, 'expected inactive');
  assert(status.daysRemaining === 0, 'expected 0 days remaining');
});

runCase('license expiring in 3 days is flagged this week', () => {
  const status = getAdminLicenseStatus({
    role: 'admin',
    licenseEndDate: daysFromNow(3),
  });
  assert(status.isActive === true, 'expected active');
  assert(status.expiringThisWeek === true, 'expected expiringThisWeek');
  assert(status.daysRemaining <= 7, 'expected <= 7 days remaining');
});

runCase('license expiring in 10 days is not flagged this week', () => {
  const status = getAdminLicenseStatus({
    role: 'admin',
    licenseEndDate: daysFromNow(10),
  });
  assert(status.isActive === true, 'expected active');
  assert(status.expiringThisWeek === false, 'expected not expiringThisWeek');
});

runCase('parseLicenseEndDateInput clears empty values', () => {
  assert(parseLicenseEndDateInput(null) === null, 'null input');
  assert(parseLicenseEndDateInput('') === null, 'empty input');
});

runCase('endOfUtcDay uses end of UTC calendar day', () => {
  const end = endOfUtcDay('2026-07-19');
  assert(end.toISOString() === '2026-07-19T23:59:59.999Z', `got ${end.toISOString()}`);
});

if (process.exitCode) {
  console.error('\nAdmin license tests failed');
  process.exit(process.exitCode);
}

console.log('\nAll admin license tests passed');
