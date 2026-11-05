/**
 * Bringing a villain in, and recalculating its Health (the villain wizard spec, section 7): the
 * heroes at this table with a stepper (defaulting to the game's hero count), the Health that
 * gives, and, when bringing it in, the templates it comes with, each checked, with how many.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { overcomeNeedsMajorTwist, overcomeOutcome, villainOvercomeFails } from '../play/roll'
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

/** A villain's + Twist: a minor twist, or for a major one, the only two ways it can go (p. 155). */
export function VillainTwistDialog({ name, onMinor, onCaptured, onEscapes, onClose }: { name: string; onMinor: (text: string) => void; onCaptured: () => void; onEscapes: () => void; onClose: () => void }) {
  const id = useId()
  const [text, setText] = useState('')
  return (
    <Modal title={`Twist for ${name}`} onClose={onClose}>
      <form
        className="gt-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          onMinor(text.trim())
          onClose()
        }}
      >
        <label className="field" htmlFor={id}>
          <span>Minor twist</span>
          <input id={id} type="text" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="button-row gt-dialog-actions">
          <button type="submit" className="button button--primary" disabled={!text.trim()}>
            Add minor twist
          </button>
        </div>
      </form>
      <section className="gt-major" aria-label="Major twist">
        <div className="gt-label">Major twist</div>
        <p className="gt-sub">Villains don't take major twists. Given the choice, a villain fails instead. The one exception: a major twist can end the scene.</p>
        <div className="gt-major__choices">
          <button type="button" className="gt-choice" onClick={onCaptured}>
            <strong>Captured</strong>
            <span className="gt-sub">{name} leaves the game's opposition.</span>
          </button>
          <button type="button" className="gt-choice" onClick={onEscapes}>
            <strong>Escapes</strong>
            <span className="gt-sub">{name} is set aside with its Health, for a later scene.</span>
          </button>
        </div>
      </section>
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

/**
 * After the tracker Overcome's roll: the outcome table's reading, then the GM says how it went. A
 * result that needs a major twist is a failure for a villain (p. 155), so that's the suggestion.
 */
export function DangerResultDialog({ name, total, onResult, onClose }: { name: string; total: number | undefined; onResult: (success: boolean) => void; onClose: () => void }) {
  const fails = total !== undefined && villainOvercomeFails(total)
  const suggested = useRef<HTMLButtonElement>(null)
  return (
    <Modal title="Make the scene more dangerous" onClose={onClose} initialFocus={suggested}>
      {total === undefined ? (
        <p>{name} rolled an Overcome.</p>
      ) : (
        <p>
          {name} rolled {total}: <strong>{overcomeOutcome(total)}.</strong>
          {overcomeNeedsMajorTwist(total) ? " Villains don't take major twists, so that's a failure." : ''}
        </p>
      )}
      <p>Did it succeed? Either way, the use is spent.</p>
      <div className="button-row gt-dialog-actions">
        <button ref={fails ? undefined : suggested} type="button" className={fails ? 'button' : 'button button--primary'} onClick={() => onResult(true)}>
          Success: advance the tracker
        </button>
        <button ref={fails ? suggested : undefined} type="button" className={fails ? 'button button--primary' : 'button'} onClick={() => onResult(false)}>
          Failure
        </button>
      </div>
    </Modal>
  )
}
