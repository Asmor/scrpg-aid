/**
 * Advancement (p. 142–143), after creation: count back issues, name collections, and record
 * the changes made between them. The changes apply on top of the creation choices, which stay
 * as they were made, so each new change works from the hero as they are now.
 */
import { useId, useState, type ReactNode } from 'react'
import { parseTraitKey, traitKey, type TraitRef } from '../rules/catalog'
import type { AbilityPick, Advancement, AdvancementChange, Hero, PrincipleChoice } from '../hero/model'
import { abilitySwapOptions, advancedHero, BACK_ISSUES_PER_COLLECTION, describeChange, swappablePicks, traitSwapOptions } from '../creation/advancement'
import { deriveTraits, ROLEPLAYING_QUALITY, traitLabel } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { PrinciplePicker } from './PrinciplePicker'
import { DieIcon } from '../components/icons'

type Update = (change: (draft: Hero) => void) => void

const emptyAdvancement = (): Advancement => ({ backIssues: 0, collections: [], changes: [] })

const CHANGE_KINDS: readonly { kind: AdvancementChange['kind']; label: string }[] = [
  { kind: 'swapPower', label: 'Swap a power for another at the same die size' },
  { kind: 'swapQuality', label: 'Swap a quality for another at the same die size' },
  { kind: 'swapPrinciple', label: 'Swap a principle for another' },
  { kind: 'swapAbility', label: 'Swap an ability for another of the same color from the same list' },
]

function Select({ label, value, options, onChange }: { label: ReactNode; value: string; options: readonly { value: string; text: string }[]; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Choosing a new change. It's added once it's complete. */
function NewChange({ hero, onAdd }: { hero: Hero; onAdd: (change: AdvancementChange) => void }) {
  // The hero as they are now, with the changes so far.
  const now = advancedHero(hero)
  const traits = deriveTraits(now).traits
  const [kind, setKind] = useState<AdvancementChange['kind'] | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [replace, setReplace] = useState<'background' | 'archetype' | ''>('')
  const [principle, setPrinciple] = useState<PrincipleChoice | undefined>()
  const [pick, setPick] = useState<AbilityPick | undefined>()
  const reset = () => {
    setFrom('')
    setTo('')
    setReplace('')
    setPrinciple(undefined)
    setPick(undefined)
  }

  let body = null
  let change: AdvancementChange | undefined
  if (kind === 'swapPower' || kind === 'swapQuality') {
    const traitKind = kind === 'swapPower' ? 'power' : 'quality'
    // The roleplaying quality changes by renaming it, in the personality step.
    const held = traits.filter((t) => t.trait.kind === traitKind && traitKey(t.trait) !== traitKey(ROLEPLAYING_QUALITY))
    const old = held.find((t) => traitKey(t.trait) === from)
    body = (
      <>
        <Select label={`Swap this ${traitKind}`} value={from} options={held.map((t) => ({ value: traitKey(t.trait), text: `${t.name} (${t.die})` }))} onChange={setFrom} />
        {traitKind === 'quality' && <p className="hint">To change your roleplaying quality, rename it in the personality step.</p>}
        <Select
          label={
            old ? (
              <>
                For this one, at <DieIcon die={old.die} />
              </>
            ) : (
              'For this one'
            )
          }
          value={to}
          options={traitSwapOptions(now, traitKind).map((t) => ({ value: traitKey(t), text: traitLabel(now, t) }))}
          onChange={setTo}
        />
      </>
    )
    if (from && to) change = { kind, from: parseTraitKey(from), to: parseTraitKey(to) as TraitRef }
  } else if (kind === 'swapPrinciple') {
    body = (
      <>
        <Select
          label="Replace"
          value={replace}
          options={[
            { value: 'background', text: 'Your background principle' },
            { value: 'archetype', text: 'Your archetype principle' },
          ]}
          onChange={(v) => setReplace(v as 'background' | 'archetype' | '')}
        />
        {replace && <PrinciplePicker category={undefined} label="New principle" choice={principle} onChange={setPrinciple} />}
      </>
    )
    if (replace && principle) change = { kind, replace, with: principle }
  } else if (kind === 'swapAbility') {
    // Ability picks as the hero has them now, so the new ability starts from the power or quality used today.
    const picks = swappablePicks(now)
    const key = (p: { source: string; name: string }) => `${p.source}|${p.name}`
    const old = picks.find((p) => key(p.pick) === from)?.pick
    const options = old ? abilitySwapOptions(now, old) : []
    const chosen = options.find((a) => a.name === to)
    body = (
      <>
        <Select
          label="Swap this ability"
          value={from}
          options={picks.map(({ pick: p }) => ({ value: key(p), text: p.customName?.trim() || p.name }))}
          onChange={(v) => {
            setFrom(v)
            setTo('')
            setPick(undefined)
          }}
        />
        {old && (
          <Select
            label="For this one"
            value={to}
            options={options.map((a) => ({ value: a.name, text: a.name }))}
            onChange={(v) => {
              setTo(v)
              // Start from the same power or quality; the checks ask for it.
              setPick(v ? { source: old.source, name: v, ...(old.uses ? { uses: old.uses.slice(0, 1) } : {}), ...(old.category ? { category: old.category } : {}) } : undefined)
            }}
          />
        )}
        {old && chosen && pick && (
          <AbilityPicker hero={now} traits={traits} legend={`Fill in ${chosen.name}`} options={[chosen]} source={old.source} step="advancement" picks={[pick]} onChange={(p) => setPick(p[0] && { ...p[0], ...(old.category ? { category: old.category } : {}) })} fixed />
        )}
      </>
    )
    if (old && pick) change = { kind, from: { source: old.source, name: old.name }, to: pick }
  }

  return (
    <fieldset className="mode-card">
      <legend>Record a change</legend>
      <Select
        label="Change"
        value={kind}
        options={CHANGE_KINDS.map((k) => ({ value: k.kind, text: k.label }))}
        onChange={(v) => {
          setKind(v as AdvancementChange['kind'] | '')
          reset()
        }}
      />
      {body}
      {kind && (
        <button
          type="button"
          className="button button--primary"
          disabled={!change}
          onClick={() => {
            if (!change) return
            onAdd(change)
            setKind('')
            reset()
          }}
        >
          Add this change
        </button>
      )}
    </fieldset>
  )
}

export function AdvancementStep({ hero, update }: { hero: Hero; update: Update }) {
  const id = useId()
  const adv = hero.advancement ?? emptyAdvancement()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const edit = (change: (a: Advancement) => void) =>
    update((h) => {
      h.advancement ??= emptyAdvancement()
      change(h.advancement)
    })

  return (
    <div className="step-form">
      <p className="hint">
        After play, a hero advances. Every {BACK_ISSUES_PER_COLLECTION} back issues (sessions), name a collection and clear them. Between collections, your hero may change: the changes you record here apply on top of the choices you made at creation (p. 142–143).
      </p>

      <fieldset className="mode-card">
        <legend>Back issues</legend>
        <div className="button-row">
          <button type="button" className="button" aria-label="One fewer back issue" disabled={adv.backIssues <= 0} onClick={() => edit((a) => (a.backIssues = Math.max(0, a.backIssues - 1)))}>
            −
          </button>
          <span aria-live="polite">
            {adv.backIssues} of {BACK_ISSUES_PER_COLLECTION}
          </span>
          <button type="button" className="button" aria-label="One more back issue" onClick={() => edit((a) => (a.backIssues += 1))}>
            +
          </button>
        </div>
      </fieldset>

      <fieldset className="mode-card">
        <legend>Collections</legend>
        {adv.collections.length === 0 && <p className="hint">No collections yet. Your GM may let a new hero start with one.</p>}
        {adv.collections.map((c, i) => (
          <div key={i} className="mode-card">
            <label className="field" htmlFor={`${id}-c${i}-name`}>
              <span>Collection {i + 1}</span>
              <input id={`${id}-c${i}-name`} type="text" value={c.name} onChange={(e) => edit((a) => (a.collections[i]!.name = e.target.value))} />
            </label>
            <label className="field" htmlFor={`${id}-c${i}-notes`}>
              <span>Notes</span>
              <textarea
                id={`${id}-c${i}-notes`}
                rows={2}
                value={c.notes ?? ''}
                onChange={(e) =>
                  edit((a) => {
                    if (e.target.value) a.collections[i]!.notes = e.target.value
                    else delete a.collections[i]!.notes
                  })
                }
              />
            </label>
            <button type="button" className="button" aria-label={`Remove collection ${i + 1}`} onClick={() => edit((a) => a.collections.splice(i, 1))}>
              Remove
            </button>
          </div>
        ))}
        <label className="field" htmlFor={`${id}-new-name`}>
          <span>New collection name</span>
          <input id={`${id}-new-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field" htmlFor={`${id}-new-notes`}>
          <span>Notes (optional)</span>
          <textarea id={`${id}-new-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button
          type="button"
          className="button button--primary"
          disabled={!name.trim()}
          onClick={() => {
            // Naming a collection clears the back issues (p. 142).
            edit((a) => {
              a.collections.push(notes.trim() ? { name: name.trim(), notes } : { name: name.trim() })
              a.backIssues = 0
            })
            setName('')
            setNotes('')
          }}
        >
          Name this collection
        </button>
      </fieldset>

      <fieldset className="mode-card">
        <legend>Changes</legend>
        {adv.changes.length === 0 ? (
          <p className="hint">No changes yet.</p>
        ) : (
          <ol className="advancement-changes">
            {adv.changes.map((c, i) => (
              <li key={i}>
                {describeChange(advancedHero(hero, i), c)}{' '}
                <button type="button" className="button" aria-label={`Remove change ${i + 1}`} onClick={() => edit((a) => a.changes.splice(i, 1))}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </fieldset>
      <NewChange hero={hero} onAdd={(change) => edit((a) => a.changes.push(change))} />
    </div>
  )
}
