import { useEffect, useState } from 'react'

/** Re-renders every half minute, so "3 minutes ago" stays true. */
export function useTick(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}
