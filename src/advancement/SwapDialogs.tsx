/**
 * The swap dialogs (scrpg-aid-designs/advancement/spec.md, section 2): one shape for all of them, in
 * three numbered sections, then a footer with a one-line summary, Cancel and Swap.
 */
import { useId, useState, type ReactNode } from 'react'
import { AbilityIcons, DiceText, DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { byCategory, traitKey, parseTraitKey, type TraitRef } from '../rules/catalog'
import { AbilityPicker } from '../editor/AbilityPicker'
import { PrinciplePicker } from '../editor/PrinciplePicker'
import { advancedHero } from '../creation/advancement'
import { principleChoiceIssues, principleOf } from '../creation/principles'
import { fillPrinciple } from '../creation/sheet'
import { IssueScope } from '../editor/inline-issues'
import { deriveTraits } from '../creation/traits'
import { ZONE_LABEL } from '../hero/labels'
import type { AbilityPick, Hero, PrincipleChoice } from '../hero/model'
import type { Zone } from '../rules/types'
import { abilityCandidates, abilitySwapIssues, heldPrinciples, heldTraits, noCandidatesText, principleName, principleOptions, startingPick, swappableAbilities, traitCandidates, traitSwapPreview, traitSwapSummary, type AbilityChange, type SwappableAbility } from './swaps'

/** One numbered section. */
export function SwapSection({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section className="swap-section" aria-labelledby={id}>
      <h3 id={id}>
        <span className="swap-section__n">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** The dialog around the sections. */
export function SwapShell({ title, summary, canSwap, onSwap, onClose, children }: { title: string; summary: string; canSwap: boolean; onSwap: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="gt-sub swap-ref">Core Rules p. 143</p>
      <div className="swap-body">{children}</div>
      <div className="swap-foot">
        <span className="gt-sub gt-grow" role="status">
          {summary}
        </span>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!canSwap}
          onClick={() => {
            onSwap()
            onClose()
          }}
        >
          Swap
        </button>
      </div>
    </Modal>
  )
}

/** An ability a swap changes: its old text struck through (with the same words for screen readers), then the new. */
export function AbilityChangeCard({ change }: { change: AbilityChange }) {
  return (
    <div className={change.issue ? 'swap-ability swap-ability--bad' : 'swap-ability'}>
      <strong>
        <AbilityIcons actions={change.effects} />
        {change.name}
      </strong>
      <span className="swap-ability__before">
        <span className="visually-hidden">Was: </span>
        <s>
          <DiceText text={change.before} />
        </s>
      </span>
      <span>
        <DiceText text={change.after} />
      </span>
      {change.issue && <span className="swap-ability__issue">⚠ {change.issue}</span>}
    </div>
  )
}

/** Swap a power or Swap a quality. */
export function TraitSwapDialog({ hero, kind, onSwap, onClose }: { hero: Hero; kind: TraitRef['kind']; onSwap: (from: TraitRef, to: TraitRef) => void; onClose: () => void }) {
  const id = useId()
  const word = kind === 'power' ? 'power' : 'quality'
  const held = heldTraits(hero, kind)
  const [fromKey, setFromKey] = useState('')
  const [toKey, setToKey] = useState('')
  const from = held.find((t) => traitKey(t.trait) === fromKey)
  const to = toKey ? parseTraitKey(toKey) : undefined
  const changes = from && to ? traitSwapPreview(hero, from.trait, to) : []
  const summary = !from ? `Choose the ${word} to replace.` : !to ? `Choose a new ${word}.` : traitSwapSummary(hero, from, to, changes)
  return (
    <SwapShell title={`Swap a ${word}`} summary={summary} canSwap={Boolean(from && to)} onSwap={() => from && to && onSwap(from.trait, to)} onClose={onClose}>
      <SwapSection n={1} title={`Which ${word} goes?`}>
        <div className="swap-chips" role="radiogroup" aria-label={`${word === 'power' ? 'Power' : 'Quality'} to replace`}>
          {held.map((t) => {
            const key = traitKey(t.trait)
            return (
              <label key={key} className={key === fromKey ? 'swap-chip swap-chip--on' : 'swap-chip'}>
                <input
                  type="radio"
                  name={`${id}-from`}
                  className="visually-hidden"
                  checked={key === fromKey}
                  onChange={() => {
                    setFromKey(key)
                    setToKey('')
                  }}
                />
                <DieIcon die={t.die} />
                {t.name}
              </label>
            )
          })}
        </div>
      </SwapSection>
      <SwapSection n={2} title="What replaces it?">
        <div className="gt-row">
          <label className="visually-hidden" htmlFor={`${id}-to`}>
            New {word}
          </label>
          <select id={`${id}-to`} value={toKey} disabled={!from} onChange={(e) => setToKey(e.target.value)}>
            <option value="">Choose a {word}…</option>
            {byCategory(traitCandidates(hero, kind)).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.traits.map((t) => (
                  <option key={traitKey(t)} value={traitKey(t)}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {from && (
            <span className="gt-row gt-sub">
              <DieIcon die={from.die} /> Keeps its {from.die}
            </span>
          )}
        </div>
        <p className="gt-sub">Any {word} the hero doesn't already have. The die size stays the same.</p>
      </SwapSection>
      <SwapSection n={3} title={from ? `Abilities that use ${from.name}` : 'Abilities it changes'}>
        {!from ? (
          <p className="gt-sub">Choose the {word} first.</p>
        ) : !to ? (
          <p className="gt-sub">Choose the new {word} to see the change.</p>
        ) : changes.length === 0 ? (
          <p className="gt-sub">No abilities use {from.name}.</p>
        ) : (
          <div className="swap-abilities">
            {changes.map((c) => (
              <AbilityChangeCard key={c.key} change={c} />
            ))}
          </div>
        )}
      </SwapSection>
    </SwapShell>
  )
}

/** One principle's card, for comparing the old with the new. */
function PrincipleCard({ heading, choice }: { heading: string; choice: PrincipleChoice | undefined }) {
  const principle = choice && principleOf(choice)
  return (
    <div className="swap-card">
      <span className="gt-label">{heading}</span>
      {principle ? (
        <>
          <strong>{principleName(choice)}</strong>
          <p className="gt-sub">{fillPrinciple(principle.roleplaying, choice)}</p>
        </>
      ) : (
        <p className="gt-sub">Choose the new principle to compare.</p>
      )}
    </div>
  )
}

/** Swap a principle. */
export function PrincipleSwapDialog({ hero, onSwap, onClose }: { hero: Hero; onSwap: (replace: 'background' | 'archetype', choice: PrincipleChoice) => void; onClose: () => void }) {
  const id = useId()
  const held = heldPrinciples(hero)
  const [replace, setReplace] = useState<'background' | 'archetype' | ''>('')
  const [choice, setChoice] = useState<PrincipleChoice | undefined>()
  const old = held.find((h) => h.replace === replace)
  const ready = Boolean(old && choice && principleOf(choice))
  const issues = principleChoiceIssues(choice)
  const summary = !old ? 'Choose the principle to replace.' : !ready ? 'Choose a new principle.' : `${principleName(old.choice)} becomes ${principleName(choice)}.${issues.length ? ` ${issues.length === 1 ? '1 rule issue' : `${issues.length} rule issues`}; you can swap anyway.` : ''}`
  return (
    <SwapShell title="Swap a principle" summary={summary} canSwap={ready} onSwap={() => old && choice && onSwap(old.replace, choice)} onClose={onClose}>
      <SwapSection n={1} title="Which principle goes?">
        <div className="swap-chips" role="radiogroup" aria-label="Principle to replace">
          {held.map((h) => (
            <label key={h.replace} className={h.replace === replace ? 'swap-chip swap-chip--on' : 'swap-chip'}>
              <input type="radio" name={`${id}-from`} className="visually-hidden" checked={h.replace === replace} onChange={() => setReplace(h.replace)} />
              {principleName(h.choice)}
            </label>
          ))}
        </div>
      </SwapSection>
      <SwapSection n={2} title="What replaces it?">
        {old ? (
          <IssueScope issues={issues}>
            <PrinciplePicker category={undefined} label="New principle" choice={choice} onChange={setChoice} swap={principleOptions(hero)} />
          </IssueScope>
        ) : (
          <p className="gt-sub">Choose the principle first.</p>
        )}
      </SwapSection>
      <SwapSection n={3} title="Old and new">
        {old ? (
          <div className="swap-cards">
            <PrincipleCard heading="Old" choice={old.choice} />
            <PrincipleCard heading="New" choice={choice} />
          </div>
        ) : (
          <p className="gt-sub">Choose the principle first.</p>
        )}
      </SwapSection>
    </SwapShell>
  )
}

const ZONES: readonly Zone[] = ['green', 'yellow', 'red']

/** Swap an ability. */
export function AbilitySwapDialog({ hero, onSwap, onClose }: { hero: Hero; onSwap: (from: SwappableAbility, to: AbilityPick) => void; onClose: () => void }) {
  const id = useId()
  const now = advancedHero(hero)
  const held = swappableAbilities(hero)
  const [fromKey, setFromKey] = useState('')
  const [pick, setPick] = useState<AbilityPick | undefined>()
  const from = held.find((a) => a.key === fromKey)
  const candidates = from ? abilityCandidates(hero, from) : []
  const chosen = pick && candidates.find((a) => a.name === pick.name)
  const issues = from && pick ? abilitySwapIssues(hero, from.pick, pick) : 0
  const summary = !from ? 'Choose the ability to replace.' : !pick ? 'Choose a new ability.' : `${from.pick.customName?.trim() || from.pick.name} becomes ${pick.name}.${issues > 0 ? ` ${issues === 1 ? '1 rule issue' : `${issues} rule issues`}; you can swap anyway and fix it next.` : ''}`
  return (
    <SwapShell title="Swap an ability" summary={summary} canSwap={Boolean(from && pick)} onSwap={() => from && pick && onSwap(from, pick)} onClose={onClose}>
      <SwapSection n={1} title="Which ability goes?">
        <div role="radiogroup" aria-label="Ability to replace" className="swap-list">
          {ZONES.filter((z) => held.some((a) => a.zone === z)).map((z) => (
            <div key={z}>
              <div className="gt-label">{ZONE_LABEL[z]}</div>
              {held
                .filter((a) => a.zone === z)
                .map((a) => (
                  <label key={a.key} className={a.key === fromKey ? 'swap-row swap-row--on' : 'swap-row'}>
                    <input
                      type="radio"
                      name={`${id}-from`}
                      checked={a.key === fromKey}
                      onChange={() => {
                        setFromKey(a.key)
                        setPick(undefined)
                      }}
                    />
                    <strong>{a.pick.customName?.trim() || a.pick.name}</strong>
                    <span className="gt-sub">{a.tag}</span>
                  </label>
                ))}
            </div>
          ))}
        </div>
      </SwapSection>
      <SwapSection n={2} title="What replaces it?">
        {!from ? (
          <p className="gt-sub">Choose the ability first.</p>
        ) : candidates.length === 0 ? (
          <p className="gt-sub">{noCandidatesText(hero, from)}</p>
        ) : (
          <>
            <label className="visually-hidden" htmlFor={`${id}-to`}>
              New ability
            </label>
            <select
              id={`${id}-to`}
              value={pick?.name ?? ''}
              onChange={(e) => {
                const next = candidates.find((a) => a.name === e.target.value)
                setPick(next ? startingPick(from, next) : undefined)
              }}
            >
              <option value="">Choose an ability…</option>
              {candidates.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </>
        )}
      </SwapSection>
      <SwapSection n={3} title="The new ability">
        {from && pick && chosen ? (
          <AbilityPicker hero={now} traits={deriveTraits(now).traits} legend={`Fill in ${chosen.name}`} hideLegend options={[chosen]} source={from.pick.source} step="advancement" picks={[pick]} onChange={(p) => setPick(p[0] && { ...p[0], ...(from.pick.category ? { category: from.pick.category } : {}) })} fixed />
        ) : (
          <p className="gt-sub">Choose the new ability to see it.</p>
        )}
      </SwapSection>
    </SwapShell>
  )
}
