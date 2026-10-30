/**
 * "Your minions" (docs/design/hero-sheet/spec.md, status column item 8): one row per minion
 * with its die, name, form, its action (or any, for an Autonomous one), its own bonuses and
 * penalties, and Use, Shrink and Remove. Use opens a small roll under the row: the minion's one
 * die plus its own checked mods, for the action it was made with. Each minion carries its
 * action setting, so the GM's minions can reuse this with any action allowed.
 */
import { useId, useState } from 'react'
import { ActionIcon, DieIcon } from '../components/icons'
import type { PlayMinion, PlayMod } from '../hero/model'
import { rollDie } from '../rules/rolling'
import type { BasicAction, Die, MinionForm } from '../rules/types'
import { minionAction, minionActionText, minionEffect, minionMath, takesAnyAction, type MinionRoll } from './minions'
import { ModForm } from './ModForm'
import { chosenMods, defaultModChoice, toggleMod } from './roll'
import { describeMod, modName } from './state'

const ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }
const DICE: readonly Die[] = ['d4', 'd6', 'd8', 'd10', 'd12']

function Badge({ value }: { value: number }) {
  return <span className={value > 0 ? 'mod-badge mod-badge--bonus' : 'mod-badge mod-badge--penalty'}>{value > 0 ? `+${value}` : `−${-value}`}</span>
}

/** A minion's roll, under its row: action, its mods, the roll, the result. Done records it. */
function MinionUse({ minion, random, onDone, onCancel }: { minion: PlayMinion; random?: () => number; onDone: (roll: MinionRoll) => void; onCancel: () => void }) {
  const id = useId()
  const [action, setAction] = useState<BasicAction>(minion.action === 'any' ? 'attack' : minion.action)
  const [checked, setChecked] = useState(() => defaultModChoice(minion.mods))
  const [value, setValue] = useState<number | null>(null)
  const roll: MinionRoll | null = value === null ? null : { action, value, mods: chosenMods(minion.mods, checked) }
  return (
    <div className="minion-use" role="group" aria-label={`${minion.name}'s roll`}>
      {minion.action === 'any' ? (
        <label className="field" htmlFor={`${id}-action`}>
          <span>Action</span>
          <select id={`${id}-action`} value={action} disabled={value !== null} onChange={(e) => setAction(e.target.value as BasicAction)}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_NAME[a]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="play-card__note">Can only {ACTION_NAME[minion.action]}, the action it was made with.</p>
      )}
      {minion.mods.length > 0 && (
        <fieldset className="roll-section roll-mods" disabled={value !== null}>
          <legend>Its mods</legend>
          {[...minion.mods.filter((m) => m.value < 0), ...minion.mods.filter((m) => m.value > 0)].map((m) => (
            <label key={m.id} className="checkbox roll-mod-check">
              <input type="checkbox" checked={checked.includes(m.id)} onChange={(e) => setChecked((c) => toggleMod(minion.mods, c, m.id, e.target.checked))} />
              <Badge value={m.value} />
              <span>{modName(m)}</span>
              {m.exclusive && <span className="tag">Exclusive</span>}
            </label>
          ))}
        </fieldset>
      )}
      {roll ? (
        <>
          <p className="minion-use__result">
            <DieIcon die={minion.die} size="compact" /> <strong>{minionMath(roll)}</strong>
          </p>
          <p>
            <ActionIcon action={roll.action} decorative /> {minionEffect(roll)}
          </p>
          <div className="button-row">
            <button type="button" className="button button--primary button--small" onClick={() => onDone(roll)}>
              Done
            </button>
            <button type="button" className="button button--small" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="button-row">
          <button type="button" className="button button--primary button--small" onClick={() => setValue(rollDie(minion.die, random))}>
            Roll {minion.die}
          </button>
          <button type="button" className="button button--small" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/** Adding a minion by hand: name, size, action, and an optional minion form. */
function AddMinion({ forms, onAdd }: { forms: readonly MinionForm[]; onAdd: (m: Omit<PlayMinion, 'id' | 'mods'>) => void }) {
  const id = useId()
  const [name, setName] = useState('')
  const [die, setDie] = useState<Die>('d6')
  const [action, setAction] = useState<BasicAction>('attack')
  const [form, setForm] = useState('')
  // A form like Autonomous lets the minion take any basic action.
  const autonomous = takesAnyAction(form)
  return (
    <form
      className="play-add"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd({ name: name.trim() || 'Minion', die, action: minionAction(form, action), ...(form ? { form } : {}) })
        setName('')
      }}
    >
      <label className="field" htmlFor={`${id}-name`}>
        <span>Name</span>
        <input id={`${id}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Minion" />
      </label>
      <label className="field" htmlFor={`${id}-die`}>
        <span>Size</span>
        <select id={`${id}-die`} value={die} onChange={(e) => setDie(e.target.value as Die)}>
          {DICE.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor={`${id}-action`}>
        <span>Action</span>
        <select id={`${id}-action`} value={autonomous ? 'any' : action} disabled={autonomous} onChange={(e) => setAction(e.target.value as BasicAction)}>
          {autonomous && <option value="any">Any basic action</option>}
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_NAME[a]}
            </option>
          ))}
        </select>
      </label>
      {forms.length > 0 && (
        <label className="field" htmlFor={`${id}-form`}>
          <span>Form</span>
          <select id={`${id}-form`} value={form} onChange={(e) => setForm(e.target.value)}>
            <option value="">None</option>
            {forms.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} (+{f.minBonus})
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" className="button">
        Add
      </button>
    </form>
  )
}

interface MinionListProps {
  minions: readonly PlayMinion[]
  /** The minion forms the hero has, for adding one by hand. */
  forms: readonly MinionForm[]
  onAdd: (minion: Omit<PlayMinion, 'id' | 'mods'>) => void
  onRemove: (id: string) => void
  onShrink: (id: string) => void
  onAddMod: (id: string, mod: Omit<PlayMod, 'id'>) => void
  onRemoveMod: (id: string, modId: string) => void
  onUse: (id: string, roll: MinionRoll) => void
  random?: () => number
}

export function MinionList({ minions, forms, onAdd, onRemove, onShrink, onAddMod, onRemoveMod, onUse, random }: MinionListProps) {
  const [usingId, setUsing] = useState<string | null>(null)
  const [moddingId, setModdingFor] = useState<string | null>(null)
  // A minion removed (or shrunk away) while its roll or mod form was open leaves nothing open.
  const using = minions.some((m) => m.id === usingId) ? usingId : null
  const moddingFor = minions.some((m) => m.id === moddingId) ? moddingId : null
  const [adding, setAdding] = useState(false)
  return (
    <>
      {minions.length === 0 ? (
        <p className="sheet-empty">None. Make Minion adds one, or add one by hand.</p>
      ) : (
        <ul className="minion-rows">
          {minions.map((m) => (
            <li key={m.id} className="minion-row">
              <div className="minion-row__top">
                <DieIcon die={m.die} />
                <strong>{m.name}</strong>
                {m.form && <span className="tag">{m.form}</span>}
                <span className="minion-row__action">
                  {m.action !== 'any' && <ActionIcon action={m.action} decorative />}
                  {minionActionText(m.action)}
                </span>
              </div>
              <ul className="roll-chips" aria-label={`${m.name}'s mods`}>
                {m.mods.map((x) => (
                  <li key={x.id} className="roll-chip">
                    <Badge value={x.value} />
                    <span>{modName(x)}</span>
                    <button type="button" className="minion-row__x" aria-label={`Remove ${describeMod(x)} from ${m.name}`} onClick={() => onRemoveMod(m.id, x.id)}>
                      ×
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="button button--small" aria-expanded={moddingFor === m.id} onClick={() => setModdingFor(moddingFor === m.id ? null : m.id)}>
                    + Mod
                  </button>
                </li>
              </ul>
              {moddingFor === m.id && (
                <ModForm
                  onSubmit={(mod) => {
                    onAddMod(m.id, mod)
                    setModdingFor(null)
                  }}
                />
              )}
              <div className="button-row">
                <button type="button" className="button button--small" aria-label={`Use ${m.name}`} disabled={using !== null && using !== m.id} onClick={() => setUsing(m.id)}>
                  Use
                </button>
                {/* Not while its roll is open: the roll was made on the die it has now. */}
                <button type="button" className="button button--small" aria-label={`Shrink ${m.name}`} disabled={using === m.id} onClick={() => onShrink(m.id)}>
                  Shrink
                </button>
                <button type="button" className="button button--small" aria-label={`Remove ${m.name}`} onClick={() => onRemove(m.id)}>
                  Remove
                </button>
              </div>
              {using === m.id && (
                <MinionUse
                  minion={m}
                  random={random}
                  onCancel={() => setUsing(null)}
                  onDone={(roll) => {
                    onUse(m.id, roll)
                    setUsing(null)
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button button--small" aria-expanded={adding} onClick={() => setAdding(!adding)}>
        {adding ? 'Close' : '+ Add'}
      </button>
      {adding && (
        <AddMinion
          forms={forms}
          onAdd={(m) => {
            onAdd(m)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}
