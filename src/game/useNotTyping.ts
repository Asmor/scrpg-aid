/** Holding a dialog back while someone is typing in a field (scrpg-aid-designs/issues/spec.md, section 9). */
import { useEffect, useState } from 'react'

const typing = () => {
  const at = document.activeElement
  return at instanceof HTMLElement && at.matches('input, textarea, select, [contenteditable="true"]')
}

/** Whether something wanting to open can. It waits until focus leaves the field; once open it stays, whatever gets focus then. */
export function useNotTyping(wanted: boolean): boolean {
  const [free, setFree] = useState(false)
  const [, recheck] = useState(0)
  if (free !== (wanted && (free || !typing()))) setFree(!free)
  const waiting = wanted && !free
  useEffect(() => {
    if (!waiting) return
    // Focus has landed wherever it's going by the time this runs.
    let timer: ReturnType<typeof setTimeout>
    const left = () => {
      timer = setTimeout(() => recheck((n) => n + 1))
    }
    document.addEventListener('focusout', left)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('focusout', left)
    }
  }, [waiting])
  return wanted && (free || !typing())
}
