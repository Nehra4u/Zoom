export function formatLicenseEndDate(endDate: string | Date | null | undefined): string {
  if (!endDate) return 'Not set'
  const date = new Date(endDate)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function toDateInputValue(endDate: string | Date | null | undefined): string {
  if (!endDate) return ''
  const date = new Date(endDate)
  return date.toISOString().slice(0, 10)
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
  const formatted = renewalDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

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
