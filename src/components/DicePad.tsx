/**
 * The dice pad (scrpg-aid-designs/settings/spec.md, section 3): three taps and Accept for three dice. Used
 * in the roll dialog, and wherever else a roll is made with physical dice. `MemberPad` takes one
 * number per member of a group, in turn.
 */
import { HelpTip } from '../help/HelpTip'
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { fitsDice, keyNumber, keyOffReason, PAD_NUMBERS, tapNumber, whyNotFits } from '../play/dice-pad'
import type { Die } from '../rules/types'
import { DieIcon } from './icons'

const KEY_HINTS: Readonly<Record<number, string>> = { 10: '0', 11: '-', 12: '=' }
const COLUMNS = 4

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))

/** The pad's keys while it's on screen: capturing, so Escape cancels the pad and not whatever it's inside. */
function usePadKeys(handlers: { onNumber: (n: number) => void; onBackspace: () => void; onAccept: () => void; onCancel: () => void }) {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        latest.current.onCancel()
        return
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        // Enter on Cancel or Roll for me does what they say; on a number key, it accepts.
        if (e.target instanceof HTMLElement && e.target.closest('button') && !e.target.closest('.dice-pad__keys')) return
        e.preventDefault()
        latest.current.onAccept()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        latest.current.onBackspace()
        return
      }
      const n = keyNumber(e.key)
      if (n !== undefined) {
        e.preventDefault()
        latest.current.onNumber(n)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

/** The 1 to 12 keys: one stop in the tab order, with the arrow keys moving between them. */
function PadKeys({ dice, autoFocus = false, onTap }: { dice: readonly Die[]; /** Focus goes to the keys when they appear. */ autoFocus?: boolean; onTap: (n: number) => void }) {
  const on = PAD_NUMBERS.filter((n) => !keyOffReason(n, dice))
  const [current, setCurrent] = useState<number>(on[0] ?? 1)
  const refs = useRef(new Map<number, HTMLButtonElement>())
  const stop = on.includes(current as (typeof on)[number]) ? current : (on[0] ?? 1)
  const idBase = useId()
  const within = useRef(false)
  useEffect(() => {
    if (autoFocus) refs.current.get(stop)?.focus()
    // Only when the keys appear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The next member's die can turn off the key that had focus: it moves to one that's on.
  useEffect(() => {
    if (within.current && on.length && stop !== current) refs.current.get(stop)?.focus()
  })
  const move = (e: ReactKeyboardEvent, n: number) => {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[e.key]
    if (by === undefined) return
    e.preventDefault()
    let next = n + by
    while (next >= 1 && next <= PAD_NUMBERS.length && keyOffReason(next, dice)) next += by
    if (next < 1 || next > PAD_NUMBERS.length) return
    setCurrent(next)
    refs.current.get(next)?.focus()
  }
  return (
    <div className="dice-pad__keys" role="group" aria-label="Number pad">
      {PAD_NUMBERS.map((n) => {
        const why = keyOffReason(n, dice)
        const hint = KEY_HINTS[n]
        const whyId = `${idBase}-${n}`
        return (
          <button
            key={n}
            ref={(el) => {
              if (el) refs.current.set(n, el)
              else refs.current.delete(n)
            }}
            type="button"
            className="dice-pad__key"
            disabled={Boolean(why)}
            title={why}
            aria-describedby={why ? whyId : undefined}
            tabIndex={n === stop ? 0 : -1}
            onClick={() => onTap(n)}
            onFocus={() => {
              within.current = true
              setCurrent(n)
            }}
            onBlur={() => {
              within.current = false
            }}
            onKeyDown={(e) => move(e, n)}
          >
            {n}
            {hint && (
              <span className="dice-pad__hint" aria-hidden="true">
                {hint}
              </span>
            )}
          </button>
        )
      })}
      {/* Outside the buttons, so each is still named just by its number. */}
      {PAD_NUMBERS.flatMap((n) => {
        const why = keyOffReason(n, dice)
        return why
          ? [
              <span key={n} id={`${idBase}-${n}`} className="visually-hidden">
                {why}
              </span>,
            ]
          : []
      })}
    </div>
  )
}

export interface PadDie {
  die: Die
  label: string
}

interface DicePadProps {
  dice: readonly PadDie[]
  /** The numbers, in the order tapped. */
  onAccept: (values: number[]) => void
  onCancel: () => void
  onRollForMe: () => void
  /** Focus goes to the keys when the pad appears: for a pad opened in place of the button that opened it. */
  autoFocus?: boolean
}

export function DicePad({ dice, onAccept, onCancel, onRollForMe, autoFocus = false }: DicePadProps) {
  const id = useId()
  const sizes = dice.map((d) => d.die)
  const [values, setValues] = useState<number[]>([])
  const ok = fitsDice(values, sizes)
  const why = whyNotFits(values, sizes)
  const tap = (n: number) => {
    if (!keyOffReason(n, sizes)) setValues((v) => tapNumber(v, n, dice.length))
  }
  const accept = () => {
    if (ok) onAccept(values)
  }
  usePadKeys({ onNumber: tap, onBackspace: () => setValues((v) => v.slice(0, -1)), onAccept: accept, onCancel })
  return (
    <div className="dice-pad">
      <div>
        {/* A div: the help popover inside can't sit in a paragraph. */}
        <div className="dice-pad__dice">
          <strong>Your dice</strong> <span className="muted">Order doesn't matter.</span> <HelpTip tip="dicePad" />
        </div>
        <ul className="dice-pad__chips">
          {dice.map((d, i) => (
            <li key={i} className="dice-pad__chip">
              <DieIcon die={d.die} size="compact" /> {d.label}
            </li>
          ))}
        </ul>
      </div>
      <ul className="dice-pad__slots" aria-label={`Entered numbers, ${values.length} of ${dice.length}`}>
        {dice.map((_, i) => {
          const v = values[i]
          return (
            <li key={i}>
              {v === undefined ? (
                <span className="dice-pad__slot" aria-hidden="true">
                  –
                </span>
              ) : (
                <button type="button" className="dice-pad__slot dice-pad__slot--full" aria-label={`Remove ${v}`} onClick={() => setValues((all) => all.filter((_x, j) => j !== i))}>
                  {v}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted dice-pad__count" id={`${id}-count`}>
        {values.length} of {dice.length} entered
      </p>
      <p className="error dice-pad__why" role="status" aria-live="polite">
        {why ?? ''}
      </p>
      <PadKeys dice={sizes} autoFocus={autoFocus} onTap={tap} />
      <div className="dice-pad__actions">
        <button type="button" className="button dice-pad__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button dice-pad__roll" onClick={onRollForMe}>
          Roll for me
        </button>
        <span className="dice-pad__gap" />
        <button type="button" className="button dice-pad__clear" onClick={() => setValues([])}>
          Clear
        </button>
        <button type="button" className="button button--primary dice-pad__accept" disabled={!ok} onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  )
}

interface MemberPadProps {
  /** Who rolls, in turn, each with their own die. */
  members: readonly { id: string; name: string; die: Die }[]
  /** Each member's number, by id. */
  onAccept: (values: Readonly<Record<string, number>>) => void
  onCancel: () => void
  onRollForMe: () => void
}

/** One number per member in turn ("Burglar 2 of 4 · d6"), moving on after each. */
export function MemberPad({ members, onAccept, onCancel, onRollForMe }: MemberPadProps) {
  const [values, setValues] = useState<number[]>([])
  const at = Math.min(values.length, members.length - 1)
  const member = members[at]!
  const full = values.length === members.length
  const tap = (n: number) => {
    if (full || keyOffReason(n, [member.die])) return
    setValues((v) => [...v, n])
  }
  const back = () => setValues((v) => v.slice(0, -1))
  // With everyone entered the keys are off, so focus goes on to Accept.
  const acceptRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (full) acceptRef.current?.focus()
  }, [full])
  const accept = () => {
    if (full) onAccept(Object.fromEntries(members.map((m, i) => [m.id, values[i]!])))
  }
  usePadKeys({ onNumber: tap, onBackspace: back, onAccept: accept, onCancel })
  return (
    <div className="dice-pad">
      <h4 className="dice-pad__member" aria-live="polite">
        {full ? 'All entered' : `${member.name} ${at + 1} of ${members.length} · ${member.die}`}
      </h4>
      <ol className="dice-pad__entered" aria-label={`Entered numbers, ${values.length} of ${members.length}`}>
        {values.map((v, i) => (
          <li key={i} className="dice-pad__chip">
            {members[i]!.name}: <strong>{v}</strong>
          </li>
        ))}
      </ol>
      <PadKeys dice={full ? [] : [member.die]} onTap={tap} />
      <div className="dice-pad__actions">
        <button type="button" className="button dice-pad__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button dice-pad__roll" onClick={onRollForMe}>
          Roll for me
        </button>
        <span className="dice-pad__gap" />
        <button type="button" className="button dice-pad__clear" disabled={values.length === 0} onClick={back}>
          Back
        </button>
        <button ref={acceptRef} type="button" className="button button--primary dice-pad__accept" disabled={!full} onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  )
}
