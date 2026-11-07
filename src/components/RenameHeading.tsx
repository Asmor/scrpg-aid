/**
 * The name in a wizard's header, renamed in place (scrpg-aid-designs/hero-wizard/spec.md, Renaming
 * from the header): a button with a pencil that swaps in a text field of the same size with
 * the name selected. Enter or leaving the field saves, Escape cancels, and an empty name keeps
 * the one there was. Focus goes back to the button afterwards.
 */
import { useEffect, useRef, useState } from 'react'

interface RenameHeadingProps {
  /** What's shown: the name, the alias, or "Unnamed hero". */
  shown: string
  /** The name field's current value, which the text field starts from. */
  name: string
  /** Shown in muted italics: nothing's named yet. */
  placeholder: boolean
  /** "hero" or "villain", for the button's name. */
  noun: string
  onRename: (name: string) => void
}

function Pencil() {
  return (
    <svg className="rename__pencil" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function RenameHeading({ shown, name, placeholder, noun, onRename }: RenameHeadingProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Set when Enter or Escape has already finished, so the blur that follows doesn't save again.
  const done = useRef(false)
  const refocus = useRef(false)
  useEffect(() => {
    if (editing) {
      input.current?.focus()
      input.current?.select()
    } else if (refocus.current) {
      refocus.current = false
      button.current?.focus()
    }
  }, [editing])

  const start = () => {
    done.current = false
    setValue(name)
    setEditing(true)
  }
  const finish = (save: boolean, focusButton: boolean) => {
    if (done.current) return
    done.current = true
    const trimmed = value.trim()
    if (save && trimmed && trimmed !== name) onRename(trimmed)
    refocus.current = focusButton
    setEditing(false)
  }

  return (
    <h2 className={placeholder && !editing ? 'rename placeholder' : 'rename'}>
      {editing ? (
        <input
          ref={input}
          className="rename__input"
          type="text"
          aria-label={`Rename ${noun}`}
          value={value}
          size={Math.max(8, value.length + 1)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finish(true, true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              finish(false, true)
            }
          }}
          onBlur={() => finish(true, false)}
        />
      ) : (
        <button ref={button} type="button" className="rename__button" aria-label={`Rename ${noun}: ${shown}`} onClick={start}>
          {shown}
          <Pencil />
        </button>
      )}
    </h2>
  )
}
