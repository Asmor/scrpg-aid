/**
 * A modal panel: a dialog in the middle, a drawer from the right, or a bottom sheet. Focus
 * moves to its title (or `initialFocus`) when it opens, stays inside it (Tab wraps around),
 * and goes back to where it was when it closes. Escape and the backdrop close it.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

/** Open modals, innermost last: only the innermost one answers Escape and Tab. */
const open: object[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'

interface ModalProps {
  title: string
  /** Hides the title visually (it still names the panel). */
  hideTitle?: boolean
  variant?: 'dialog' | 'drawer' | 'sheet'
  onClose: () => void
  /** What gets focus when it opens, instead of the title (a dialog whose first choice is the point of it). */
  initialFocus?: RefObject<HTMLElement | null>
  /** A wider dialog that fills a phone's screen, for a long form. */
  wide?: boolean
  /** More classes on the panel, for a dialog with its own size. */
  className?: string
  children: ReactNode
}

export function Modal({ title, hideTitle = false, variant = 'dialog', onClose, initialFocus, wide = false, className, children }: ModalProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const closeRef = useRef(onClose)
  // Read once, when it opens.
  const focusFirst = useRef(initialFocus)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const self = {}
    open.push(self)
    const first = focusFirst.current?.current ?? heading.current
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (open.at(-1) !== self) return
      if (e.key === 'Escape') {
        // Something inside (a field's own Escape) already handled it.
        if (e.defaultPrevented) return
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      const at = document.activeElement
      if (e.shiftKey && (at === first || at === heading.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      open.splice(open.indexOf(self), 1)
      // Back to where focus was, if that's still on the page.
      if (before?.isConnected) before.focus()
    }
  }, [])
  return (
    <div className={`modal-backdrop modal-backdrop--${variant}${wide ? ' modal-backdrop--wide' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${variant}${wide ? ' modal--wide' : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        {variant === 'sheet' && <div className="modal__grab" aria-hidden="true" />}
        <div className="modal__head">
          <h2 id={titleId} ref={heading} tabIndex={-1} className={hideTitle ? 'visually-hidden' : undefined}>
            {title}
          </h2>
          <button type="button" className="button button--small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
