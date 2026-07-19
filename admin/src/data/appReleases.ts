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
  versionName: '1.0.1',
  versionCode: 1,
  packageId: 'com.zoomcontrol.app',
  minSdk: 26,
  targetSdk: 35,
  compileSdk: 35,
  releasedAt: '2026-07-19',
  notes: 'MeetVerdure v1.0.1 — meeting join flow, admin-managed accounts, cloud recordings.',
}

const DRIVE_FILE_ID = '1j9XJ5u3xPrNtivXe19SNwLyl3w8QjAoL'

export const APP_DOWNLOAD_LINKS = {
  /** Direct download — triggers file save on click */
  apkUrl: `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`,
  playStoreUrl: '',
  /** Share / view in browser */
  driveUrl: `https://drive.google.com/file/d/${DRIVE_FILE_ID}/view?usp=sharing`,
}

export const PAST_RELEASES: AppRelease[] = [
  {
    versionName: '1.0.0',
    versionCode: 1,
    releasedAt: '2026-07-01',
    notes: 'Initial release — meeting join flow, admin-managed accounts, cloud recordings.',
  },
]
