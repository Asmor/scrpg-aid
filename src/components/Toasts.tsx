/**
 * Toasts (scrpg-aid-designs/game-table/game-table-spec-addendum-game-codes.md, "Toasts"): they float
 * over the page, bottom right (bottom center on phones), never in the content flow. New ones
 * stack upward, three at most; the oldest closes when a fourth arrives. Each closes itself after
 * 8 seconds (10 with an action), or with ×, and the timer pauses while the pointer is over it or
 * focus is inside it. Their text goes to a polite live region.
 *
 * Errors that block the player (removed, refused) aren't toasts: they use an alert or a banner.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { TOAST_ACTION_MS, TOAST_MAX, TOAST_MS } from './toast-timing'

export interface ToastData {
  id: string
  text: ReactNode
  /** Something went wrong (but nothing is blocked). */
  warn?: boolean
  action?: { label: string; onClick: () => void }
}

/** One toast: closes itself after its time, paused while hovered or focused. */
function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  // Time left, and when the running stretch started (undefined while paused).
  const left = useRef(toast.action ? TOAST_ACTION_MS : TOAST_MS)
  const started = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hovered = useRef(false)
  const focused = useRef(false)
  const id = toast.id

  useEffect(() => {
    const run = () => {
      started.current = Date.now()
      timer.current = setTimeout(() => dismiss.current(id), left.current)
    }
    run()
    return () => clearTimeout(timer.current)
  }, [id])

  const pause = () => {
    if (started.current === undefined) return
    clearTimeout(timer.current)
    left.current = Math.max(0, left.current - (Date.now() - started.current))
    started.current = undefined
  }
  const resume = () => {
    if (started.current !== undefined || hovered.current || focused.current) return
    started.current = Date.now()
    timer.current = setTimeout(() => dismiss.current(id), left.current)
  }

  return (
    <div
      className={toast.warn ? 'toast toast--warn' : 'toast'}
      onPointerEnter={() => {
        hovered.current = true
        pause()
      }}
      onPointerLeave={() => {
        hovered.current = false
        resume()
      }}
      onFocus={() => {
        focused.current = true
        pause()
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        focused.current = false
        resume()
      }}
    >
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="button button--small"
          onClick={() => {
            toast.action!.onClick()
            onDismiss(id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="icon-button toast__close" aria-label="Dismiss" onClick={() => onDismiss(id)}>
        ×
      </button>
    </div>
  )
}

/** The page's toasts, oldest first. More than three: the oldest are dismissed. */
export function Toasts({ toasts, onDismiss }: { toasts: readonly ToastData[]; onDismiss: (id: string) => void }) {
  const extra = toasts.length > TOAST_MAX ? toasts.slice(0, toasts.length - TOAST_MAX).map((t) => t.id) : []
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  const extraKey = extra.join(' ')
  useEffect(() => {
    for (const id of extraKey ? extraKey.split(' ') : []) dismiss.current(id)
  }, [extraKey])
  const shown = toasts.slice(-TOAST_MAX)
  // The region is always there, so screen readers hear toasts added to it.
  return (
    <div className="toasts" role="status" aria-live="polite">
      {shown.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
