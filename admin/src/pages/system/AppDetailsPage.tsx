import type { ReactElement } from 'react'
import { CheckCircle2, Copy, Download, History, PackageCheck, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { APP_DOWNLOAD_LINKS, CURRENT_RELEASE, PAST_RELEASES } from '@/data/appReleases'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

async function copyLink(url: string, label: string) {
  if (!url) {
    toast.error(`No ${label} link has been set up yet`)
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success(`${label} link copied`)
  } catch {
    toast.error('Could not copy link')
  }
}

// Brand marks for the share destinations — lucide has no Play Store / Drive logos,
// so these are small inline SVGs using each brand's official mark.
function PlayStoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M325 256 48 12a32 32 0 0 0-16 28v432a32 32 0 0 0 16 28l277-244z" fill="#00d4ff" />
      <path d="M405 199 325 256l80 57 78-45a32 32 0 0 0 0-56l-78-13z" fill="#ffe000" />
      <path d="M48 12a32 32 0 0 0-16 28l277 216 96-56z" fill="#00f076" />
      <path d="M32 472a32 32 0 0 0 16 28l309-244-96-56z" fill="#ff3a44" />
    </svg>
  )
}

function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 56.5c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.4z"
        fill="#ea4335"
      />
      <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="M27.5 52H60l-16.35-27z" fill="#2684fc" />
      <path
        d="M57.4 1.2 71.15 25l-13.75 27h27.5c0-1.55-.4-3.1-1.2-4.5L61.9 4.5C60.55 1.9 58 .4 56.05 0z"
        fill="#ffba00"
      />
    </svg>
  )
}

interface ShareTarget {
  icon: (props: { className?: string }) => ReactElement
  iconBg: string
  label: string
  emptyLabel: string
  url: string
}

function ShareRow({ icon: Icon, iconBg, label, emptyLabel, url }: ShareTarget) {
  const handleOpen = () => {
    if (!url) {
      toast.error(emptyLabel)
      return
    }
    window.open(url, '_blank', 'noreferrer')
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleOpen()
      }}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{label}</p>
      <Button
        size="icon-sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation()
          copyLink(url, label)
        }}
        aria-label={`Copy ${label} link`}
        title={`Copy ${label} link`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function handleDownload() {
  if (!APP_DOWNLOAD_LINKS.apkUrl) {
    toast.error('No APK has been uploaded yet — ask engineering for the hosted build link.')
    return
  }
  window.open(APP_DOWNLOAD_LINKS.apkUrl, '_blank', 'noreferrer')
}

export function AppDetailsPage() {
  async function handleShare() {
    const shareUrl = APP_DOWNLOAD_LINKS.apkUrl || APP_DOWNLOAD_LINKS.playStoreUrl || APP_DOWNLOAD_LINKS.driveUrl
    if (!shareUrl) {
      toast.error('No download link has been set up yet')
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ZoomMeets app', url: shareUrl })
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      await copyLink(shareUrl, 'Download')
    }
  }

  return (
    <div className="space-y-6">
      {/* Full release details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Current Deployed App
            <Badge variant="success" className="ml-1">
              Latest
            </Badge>
          </CardTitle>
          <CardDescription>What's live in your users' hands right now</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">App Version</dt>
              <dd className="text-sm font-semibold text-foreground">{CURRENT_RELEASE.versionName}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Version Code</dt>
              <dd className="text-sm font-semibold text-foreground">{CURRENT_RELEASE.versionCode}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Last Released</dt>
              <dd className="text-sm font-semibold text-foreground">{formatDate(CURRENT_RELEASE.releasedAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Package ID</dt>
              <dd className="truncate text-sm font-semibold text-foreground">{CURRENT_RELEASE.packageId}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Min / Target SDK</dt>
              <dd className="text-sm font-semibold text-foreground">
                {CURRENT_RELEASE.minSdk} / {CURRENT_RELEASE.targetSdk}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Platform</dt>
              <dd className="text-sm font-semibold text-foreground">Android</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              App &amp; backend systems healthy
            </Badge>
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              No errors
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{CURRENT_RELEASE.notes}</p>
        </CardContent>
      </Card>

      {/* Download & share */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Latest App
          </CardTitle>
          <CardDescription>Get the APK directly, or share it with someone else</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chart-1/15">
              <Download className="h-6 w-6 text-chart-1" />
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-sm font-semibold text-foreground">ZoomMeets v{CURRENT_RELEASE.versionName}</p>
              <p className="text-xs text-muted-foreground">Android APK · build {CURRENT_RELEASE.versionCode}</p>
              {!APP_DOWNLOAD_LINKS.apkUrl && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No APK has been uploaded yet — ask engineering for the hosted build link.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Download APK
              </Button>
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or Download via</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ShareRow
                icon={PlayStoreIcon}
                iconBg="bg-white"
                label="Play Store"
                emptyLabel="No Play Store link set up yet"
                url={APP_DOWNLOAD_LINKS.playStoreUrl}
              />
              <ShareRow
                icon={GoogleDriveIcon}
                iconBg="bg-white"
                label="Google Drive"
                emptyLabel="No Drive link set up yet"
                url={APP_DOWNLOAD_LINKS.driveUrl}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Past releases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Past releases
          </CardTitle>
          <CardDescription>Release history — for reference only</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {PAST_RELEASES.slice()
              .sort((a, b) => b.versionCode - a.versionCode)
              .map((release) => (
                <div
                  key={release.versionCode}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card p-3"
                >
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-semibold text-foreground">v{release.versionName}</p>
                    <p className="text-[11px] text-muted-foreground">build {release.versionCode}</p>
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{release.notes}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">{formatDate(release.releasedAt)}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
