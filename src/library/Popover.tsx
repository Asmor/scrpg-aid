/**
 * Popovers and menus for the library (scrpg-aid-designs/library/spec.md, "Accessibility"): each is a
 * dialog or a menu that takes focus when it opens and gives it back to its trigger when it
 * closes. Escape or a click outside closes it, and opening one closes any other.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { OpenContext, type Popover } from './popover-state'

export function PopoverGroup({ children }: { children: ReactNode }) {
  const state = useState<string | null>(null)
  return <OpenContext.Provider value={state}>{children}</OpenContext.Provider>
}

/**
 * Closes on Escape (focus back to the trigger) or a pointer press outside the popover and its
 * trigger (the anchor it's rendered in). Places it too: popovers are fixed to the viewport
 * under their anchor, so a scrolling box (the table) doesn't clip them; a bottom sheet
 * (popover--sheet) is placed by CSS.
 */
function useDismiss(wrap: RefObject<HTMLElement | null>, onClose: () => void, onOutside: () => void) {
  useLayoutEffect(() => {
    const place = () => {
      const el = wrap.current
      const anchor = el?.parentElement
      if (!el || !anchor || el.classList.contains('popover--sheet')) return
      const r = anchor.getBoundingClientRect()
      const viewWidth = document.documentElement.clientWidth || window.innerWidth
      const width = el.offsetWidth
      const height = el.offsetHeight
      const left = Math.max(8, Math.min(el.classList.contains('popover--end') ? r.right - width : r.left, viewWidth - width - 8))
      const below = r.bottom + 6
      const top = below + height > window.innerHeight - 8 && r.top - 6 - height > 8 ? r.top - 6 - height : below
      // Placed imperatively, on scroll and resize too, without re-rendering.
      el.style.setProperty('left', `${left}px`)
      el.style.setProperty('top', `${top}px`)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [wrap])
  const closeRef = useRef(onClose)
  const outsideRef = useRef(onOutside)
  useEffect(() => {
    closeRef.current = onClose
    outsideRef.current = onOutside
  })
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
    }
    const onDown = (e: PointerEvent) => {
      const inside = wrap.current?.parentElement ?? wrap.current
      if (!inside?.contains(e.target as Node)) outsideRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [wrap])
}

interface PanelProps {
  popover: Popover
  label: string
  className?: string
  children: ReactNode
  /** What takes focus on open; the first focusable element by default. */
  initialFocus?: RefObject<HTMLElement | null>
}

/** A popover dialog. Render it next to its trigger, inside a positioned wrapper. */
export function PopoverDialog({ popover, label, className, children, initialFocus }: PanelProps) {
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(panel, popover.close, () => popover.setOpen(false))
  useEffect(() => {
    const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>('input, button, a[href], [tabindex="0"]') ?? panel.current
    target?.focus()
  }, [initialFocus])
  return (
    <div ref={panel} role="dialog" aria-label={label} tabIndex={-1} className={`popover ${className ?? ''}`}>
      {children}
    </div>
  )
}

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  /** A link instead of an action. */
  href?: string
  /** One of a set of radio choices (role menuitemradio), checked or not. */
  checked?: boolean
  /** A line of information above the menu's items, not an action ("Library sheet changed 2 days ago"). */
  note?: true
}

/** Arrow keys move between a menu's items; Home and End jump. */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
  const at = items.indexOf(document.activeElement as HTMLElement)
  const go = (i: number) => {
    e.preventDefault()
    items[(i + items.length) % items.length]?.focus()
  }
  if (e.key === 'ArrowDown') go(at + 1)
  else if (e.key === 'ArrowUp') go(at - 1)
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(items.length - 1)
}

/** A menu of actions; choosing one closes it (focus goes back to the trigger unless the action moves it). */
export function PopoverMenu({ popover, label, items, className, header }: { popover: Popover; label: string; items: readonly MenuItem[]; className?: string; header?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(panel, popover.close, () => popover.setOpen(false))
  useEffect(() => {
    // The checked radio choice, if there is one, or else the first item.
    ;(panel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'))?.focus()
  }, [])
  return (
    <div ref={panel} className={`popover popover--menu ${className ?? ''}`}>
      {header}
      {items
        .filter((item) => item.note)
        .map((item) => (
          <p key={item.label} className="popover__note">
            {item.label}
          </p>
        ))}
      <div role="menu" aria-label={label} onKeyDown={moveFocus}>
        {items.filter((item) => !item.note).map((item) =>
          item.href ? (
            <a key={item.label} role="menuitem" tabIndex={-1} className={item.danger ? 'menu-item menu-item--danger' : 'menu-item'} href={item.href} onClick={() => popover.setOpen(false)}>
              {item.label}
            </a>
          ) : (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              tabIndex={-1}
              className={item.danger ? 'menu-item menu-item--danger' : 'menu-item'}
              onClick={() => {
                popover.close()
                item.onSelect()
              }}
            >
              {item.checked !== undefined && <span className={item.checked ? 'menu-radio menu-radio--on' : 'menu-radio'} aria-hidden="true" />}
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
