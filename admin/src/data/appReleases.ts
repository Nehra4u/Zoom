// Static, developer-maintained reference data for the "App Details" screen.
// This is intentionally NOT backed by the database — it's read-only reference info
// that's the same for every admin, so there is nothing here for an admin to edit
// through the UI. Update this file directly whenever a new build is cut.
//
// Version/build numbers below are pulled from android/app/build.gradle.kts to stay
// accurate. `releasedAt` and the download/share links are placeholders — swap them
// for the real release date and hosting links when available.

export interface AppRelease {
  versionName: string
  versionCode: number
  releasedAt: string // ISO date
  notes: string
}

export const CURRENT_RELEASE: AppRelease & {
  packageId: string
  minSdk: number
  targetSdk: number
  compileSdk: number
} = {
  versionName: '1.0.0',
  versionCode: 1,
  packageId: 'com.zoomcontrol.app',
  minSdk: 26,
  targetSdk: 35,
  compileSdk: 35,
  // TODO: replace with the actual release date once this build ships.
  releasedAt: '2026-07-01',
  notes: 'Initial release — meeting join flow, admin-managed accounts, cloud recordings.',
}

// TODO: point these at the real hosted APK / Play Store listing / Drive folder.
export const APP_DOWNLOAD_LINKS = {
  apkUrl: '',
  playStoreUrl: '',
  driveUrl: '',
}

// TODO: append an entry here each time a new build is released.
export const PAST_RELEASES: AppRelease[] = [
  {
    versionName: '1.0.0',
    versionCode: 1,
    releasedAt: '2026-07-01',
    notes: 'Initial release — meeting join flow, admin-managed accounts, cloud recordings.',
  },
]
