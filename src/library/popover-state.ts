/** The open state behind ./Popover.tsx: which popover is open, shared so opening one closes the others. */
import { createContext, useCallback, useContext, useId, useState } from 'react'

/** Which popover is open, shared so opening one closes the others. */
export const OpenContext = createContext<[string | null, (id: string | null) => void] | null>(null)

/** One popover's open state and trigger, joined to the page's group (or standalone without one). */
export interface Popover {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Closes it and puts focus back on the trigger. */
  close: () => void
  id: string
}

/** A popover's state, and a callback ref for the button that opens it (focus goes back there on close). */
export function usePopover(): [Popover, (el: HTMLButtonElement | null) => void] {
  const id = useId()
  const group = useContext(OpenContext)
  const [local, setLocal] = useState(false)
  const open = group ? group[0] === id : local
  const [trigger, bindTrigger] = useState<HTMLButtonElement | null>(null)
  const setGroup = group?.[1]
  const setOpen = useCallback(
    (next: boolean) => {
      if (setGroup) setGroup(next ? id : null)
      else setLocal(next)
    },
    [setGroup, id],
  )
  const close = useCallback(() => {
    setOpen(false)
    trigger?.focus()
  }, [setOpen, trigger])
  return [{ open, setOpen, toggle: () => setOpen(!open), close, id }, bindTrigger]
}

