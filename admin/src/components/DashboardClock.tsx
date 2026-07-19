import { useEffect, useState } from 'react'

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

function msUntilNextMinute() {
  const now = new Date()
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
}

/** Isolated clock — updates once per minute so the rest of the dashboard does not re-render. */
export function DashboardClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      timeoutId = setTimeout(tick, msUntilNextMinute())
    }
    timeoutId = setTimeout(tick, msUntilNextMinute())
    return () => clearTimeout(timeoutId)
  }, [])

  return (
    <>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-chart-1">
        {formatDate(now)}
      </p>
      <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em] text-foreground sm:text-5xl">
        {formatTime(now)}
      </h2>
    </>
  )
}
