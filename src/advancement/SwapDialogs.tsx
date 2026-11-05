/**
 * The swap dialogs (docs/design/advancement/spec.md, section 2): one shape for all of them, in
 * three numbered sections, then a footer with a one-line summary, Cancel and Swap.
 */
import { useId, useState, type ReactNode } from 'react'
import { AbilityIcons, DiceText, DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { byCategory, traitKey, parseTraitKey, type TraitRef } from '../rules/catalog'
import type { Hero } from '../hero/model'
import { heldTraits, traitCandidates, traitSwapPreview, traitSwapSummary, type AbilityChange } from './swaps'

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
