/**
 * The form for adding a bonus or penalty: its size, what it is, and whether it's persistent
 * or exclusive. In a game session (Phase 4) it can go to another hero instead.
 */
import { useId, useState } from 'react'
import type { PlayMod } from '../hero/model'

const MOD_VALUES = [-4, -3, -2, -1, 1, 2, 3, 4] as const
/** The For choice's value while the chosen hero has left (never a client id). */
export const GONE = '\u0000gone'

/** Another hero at the table a mod can go to. */
export interface ModTarget {
  id: string
  name: string
}

interface Props {
  /** Other heroes it can go to; with none, it's for the hero themself. */
  targets?: readonly ModTarget[]
  /** Whether "Me" is a choice (the GM has no hero of their own). */
  self?: boolean
  /** The button's label; by default "Add" for the hero themself and "Give" for another. */
  submitLabel?: string
  /** `to` is the target's id, or undefined for the hero themself. False keeps the form filled in (it didn't go). */
  onSubmit: (mod: Omit<PlayMod, 'id'>, to?: string) => boolean | void
}

export function ModForm({ targets = [], self = true, submitLabel, onSubmit }: Props) {
  const id = useId()
  const [label, setLabel] = useState('')
  const [value, setValue] = useState<number>(-1)
  const [persistent, setPersistent] = useState(false)
  const [exclusive, setExclusive] = useState(false)
  const [to, setTo] = useState<ModTarget | null>(null)
  // A hero who was chosen and has since left isn't swapped for someone else: that could put a penalty on the wrong hero.
  const gone = to !== null && !targets.some((t) => t.id === to.id)
  const target = gone ? '' : (to?.id ?? (self ? '' : (targets[0]?.id ?? '')))
  const blocked = gone || (!self && !target)
  return (
    <form
      className="play-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (blocked || !label.trim()) return
        if (onSubmit({ label, value, ...(persistent ? { persistent: true } : {}), ...(exclusive ? { exclusive: true } : {}) }, target || undefined) === false) return
        setLabel('')
        setPersistent(false)
        setExclusive(false)
      }}
    >
      {(targets.length > 0 || !self || gone) && (
        <label className="field" htmlFor={`${id}-to`}>
          <span>For</span>
          <select id={`${id}-to`} value={gone ? GONE : target} onChange={(e) => setTo(targets.find((t) => t.id === e.target.value) ?? null)} disabled={!targets.length && !gone}>
            {gone && (
              <option value={GONE} disabled>
                Choose who it’s for
              </option>
            )}
            {self && <option value="">Me</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor={`${id}-value`}>
        <span>Size</span>
        <select id={`${id}-value`} value={value} onChange={(e) => setValue(Number(e.target.value))}>
          {MOD_VALUES.map((v) => (
            <option key={v} value={v}>
              {v > 0 ? `+${v} bonus` : `${v} penalty`}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor={`${id}-label`}>
        <span>What it is</span>
        <input id={`${id}-label`} type="text" maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. tied up" />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />
        Persistent
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        Exclusive
      </label>
      {/* A mod needs a name (docs/design/hero-sheet/spec.md, "Bonuses and penalties"). */}
      <button type="submit" className="button" disabled={blocked || !label.trim()}>
        {submitLabel ?? (target ? 'Give' : 'Add')}
      </button>
      {gone && <p className="hint">{to.name} has left the game. Choose who it’s for.</p>}
    </form>
  )
}
