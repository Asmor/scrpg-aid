/**
 * Bringing a villain in, and recalculating its Health (the villain wizard spec, section 7): the
 * heroes at this table with a stepper (defaulting to the game's hero count), the Health that
 * gives, and, when bringing it in, the templates it comes with, each checked, with how many.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { MAX_GROUP_SIZE, templateName, type LieutenantTemplate, type MinionTemplate } from '../template/model'
import { villainDisplayName, type Villain, type VillainAttachment } from '../villain/model'
import { villainHealth } from '../villain/sheet'

/** A whole number of heroes, 1 or more, with − and + (no upper limit at a table). */
function HeroStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="vw-well__row">
      <span id={id}>Heroes at this table:</span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label="Fewer heroes" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label="More heroes" onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/** The Health formula's terms for this many heroes, and the total. */
function HealthTerms({ villain, heroes }: { villain: Villain; heroes: number }) {
  const { total, terms } = villainHealth(villain, heroes)
  return (
    <>
      <p>
        <strong>Max Health {total ?? '—'}</strong>
      </p>
      <table className="vw-sum">
        <tbody>
          {terms.map((t, i) => (
            <tr key={`${t.kind}:${i}`}>
              <td>{t.label}</td>
              <td>{t.value === null ? '—' : t.kind === 'base' ? t.value : signed(t.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** One template the villain comes with, as loaded for the dialog. */
interface ComesWith {
  attachment: VillainAttachment
  template?: MinionTemplate | LieutenantTemplate
}

/** What to bring in with the villain: each checked template and how many. */
export interface BringPick {
  attachment: VillainAttachment
  template: MinionTemplate | LieutenantTemplate
  count: number
}

export function BringInVillainDialog({ villain, heroes, onBring, onClose }: { villain: Villain; heroes: number; onBring: (heroCount: number, picks: BringPick[]) => void; onClose: () => void }) {
  const stores = useOptionalTemplateStores()
  const [count, setCount] = useState(Math.max(1, heroes))
  const [comes, setComes] = useState<ComesWith[] | null>(stores && villain.attached.length ? null : [])
  // Unchecked templates, and counts typed, by template id. Signature minions default to one per hero (Alert!).
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!stores || !villain.attached.length) return
    let current = true
    Promise.all(
      villain.attached.map(async (attachment): Promise<ComesWith> => {
        const r = attachment.kind === 'lieutenant' ? await stores.lieutenants.get(attachment.templateId) : await stores.minions.get(attachment.templateId)
        return r.status === 'found' ? { attachment, template: r.doc } : { attachment }
      }),
    ).then(
      (list) => current && setComes(list),
      () => current && setComes([]),
    )
    return () => {
      current = false
    }
  }, [stores, villain.attached])
  const name = villainDisplayName(villain)
  const countOf = (c: ComesWith) => counts[c.attachment.templateId] ?? (c.attachment.role === 'signature' ? Math.min(MAX_GROUP_SIZE, count) : (c.template?.groupSize ?? 1))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const picks = (comes ?? []).flatMap((c) => (c.template && !off.has(c.attachment.templateId) ? [{ attachment: c.attachment, template: c.template, count: countOf(c) }] : []))
    onBring(count, picks)
  }
  return (
    <Modal title={`Bring in ${name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <HeroStepper value={count} onChange={setCount} />
        <HealthTerms villain={villain} heroes={count} />
        {comes === null ? (
          <p>Loading what {name} comes with…</p>
        ) : (
          comes.length > 0 && (
            <fieldset className="vw-comes">
              <legend>Comes with {name}</legend>
              {comes.map((c) => {
                const id = c.attachment.templateId
                if (!c.template) {
                  return (
                    <p key={id} className="hint">
                      Missing template: this {c.attachment.kind} was deleted from the library.
                    </p>
                  )
                }
                const label = templateName(c.template, c.attachment.kind)
                return (
                  <div key={id} className="vw-well__row">
                    <label className="checkbox">
                      <input type="checkbox" checked={!off.has(id)} onChange={(e) => setOff((s) => (e.target.checked ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))} />
                      <DieIcon die={c.template.die} size="inline" /> {label}
                      <span className="hint"> ({c.attachment.role === 'vehicle' ? 'vehicle' : 'signature minions'})</span>
                    </label>
                    <div className="stepper" role="group" aria-label={`How many ${label}`}>
                      <button type="button" aria-label={`Fewer ${label}`} disabled={countOf(c) <= 1 || off.has(id)} onClick={() => setCounts((m) => ({ ...m, [id]: countOf(c) - 1 }))}>
                        −
                      </button>
                      <output aria-live="polite">{countOf(c)}</output>
                      <button type="button" aria-label={`More ${label}`} disabled={countOf(c) >= MAX_GROUP_SIZE || off.has(id)} onClick={() => setCounts((m) => ({ ...m, [id]: countOf(c) + 1 }))}>
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </fieldset>
          )
        )}
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={comes === null}>
            Bring in
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** The villain card's "Recalculate Health…": the same stepper and terms; its damage taken is kept. */
export function RecalculateHealthDialog({ villain, heroes, onApply, onClose }: { villain: Villain; heroes: number; onApply: (heroCount: number) => void; onClose: () => void }) {
  const [count, setCount] = useState(Math.max(1, heroes))
  return (
    <Modal title="Recalculate Health" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onApply(count)
        }}
      >
        <HeroStepper value={count} onChange={setCount} />
        <HealthTerms villain={villain} heroes={count} />
        <p className="hint">Current Health keeps the damage {villainDisplayName(villain)} has taken.</p>
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Recalculate
          </button>
        </div>
      </form>
    </Modal>
  )
}
