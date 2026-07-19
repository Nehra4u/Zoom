import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const RecordingExpiryContext = createContext<number>(Date.now())

export function RecordingExpiryProvider({ children }: { children: ReactNode }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <RecordingExpiryContext.Provider value={nowMs}>{children}</RecordingExpiryContext.Provider>
  )
}

export function useRecordingNowMs() {
  return useContext(RecordingExpiryContext)
}
