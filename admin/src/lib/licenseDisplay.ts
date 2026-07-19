const UTC_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}

/** License dates are stored as end-of-day UTC on the backend. */
export function toDateInputValue(endDate: string | Date | null | undefined): string {
  if (!endDate) return ''
  const date = new Date(endDate)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatLicenseEndDate(endDate: string | Date | null | undefined): string {
  if (!endDate) return 'Not set'
  const date = new Date(endDate)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', UTC_DATE_FORMAT)
}

export function licenseEndDatesMatch(
  sentDate: string | null,
  storedDate: string | null | undefined
): boolean {
  const sent = sentDate?.trim() || null
  const stored = storedDate ? toDateInputValue(storedDate) : null
  return sent === stored
}

export function formatSubscriptionRenewal(endDate: string | null, isActive: boolean) {
  if (!endDate) {
    return {
      daysRemaining: null as number | null,
      isUrgent: false,
      formatted: 'Not configured',
      headline: isActive ? 'Subscription active' : 'Subscription ended',
      expired: !isActive,
    }
  }

  const renewalDate = new Date(endDate)
  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const daysRemaining = Math.ceil((renewalDate.getTime() - now.getTime()) / msPerDay)
  const expired = !isActive
  const isUrgent = !expired && daysRemaining <= 7
  const formatted = renewalDate.toLocaleDateString('en-GB', UTC_DATE_FORMAT)

  let headline = 'Subscription active'
  if (expired) headline = 'Subscription ended'
  else if (isUrgent) headline = `Renews in ${daysRemaining} days`

  return { daysRemaining, isUrgent, formatted, headline, expired }
}

export function isLicenseUrgent(admin: {
  role: string
  licenseIsActive?: boolean
  licenseExpiringThisWeek?: boolean
}): boolean {
  if (admin.role === 'super_admin') return false
  return Boolean(!admin.licenseIsActive || admin.licenseExpiringThisWeek)
}
