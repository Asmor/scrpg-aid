/**
 * Edit mode's first screen (the hero wizard spec, "Edit mode"): every step as a row with its
 * mark, what was chosen in one line with icons, and a Change link to the step (or a complex
 * archetype's part). Above the list, "Changes save as you go" and Revert changes; below it,
 * a link to Advancement.
 */
import type { ReactNode } from 'react'
import { actionsOf, buildSheet, fillPrinciple, type HeroSheet, type SheetAbility } from '../creation/sheet'
import { archetypeName } from '../creation/layers'
import { principleOf } from '../creation/principles'
import type { StepId } from '../creation/warnings'
import { retconsById } from '../rules/data'
import type { ArchetypePart } from '../hero/archetype-parts'
import { traitLabel } from '../creation/traits'
import type { Hero, PrincipleChoice } from '../hero/model'
import type { StepState, WizardStepId } from '../hero/wizard-steps'
import { AbilityIcons, DieIcon } from '../components/icons'
import { HealthChips, StatusDiceRow } from '../components/SheetPreview'
import { StepMarkIcon } from './StepRail'

/** One chosen thing on a row: a name, maybe with its die or its ability icons. */
function Item({ children }: { children: ReactNode }) {
  return <li className="summary-item">{children}</li>
}

function Traits({ sheet, step }: { sheet: HeroSheet; step: StepId }) {
  return [...sheet.powers, ...sheet.qualities]
    .filter((t) => t.step === step)
    .map((t) => (
      <Item key={`${t.trait.kind}:${t.trait.id}`}>
        {t.name} <DieIcon die={t.die} size="inline" />
      </Item>
    ))
}

function Abilities({ abilities }: { abilities: readonly SheetAbility[] }) {
  return abilities.map((a, i) => (
    <Item key={`${a.source}:${a.baseName}:${i}`}>
      <AbilityIcons actions={a.effects} />
      {a.name}
    </Item>
  ))
}

/** A principle, with its Green ability's action icons before its name, as every listed ability has. */
function Principle({ choice }: { choice: PrincipleChoice | undefined }) {
  const principle = choice && principleOf(choice)
  if (!principle) return null
  return (
    <Item>
      <AbilityIcons actions={actionsOf(principle.greenAbility, undefined)} />
      {fillPrinciple(principle.name, choice)}
    </Item>
  )
}

const fromSource = (sheet: HeroSheet, prefix: string) => sheet.abilities.filter((a) => a.source === prefix || a.source.startsWith(`${prefix}.`))

/** What a step's row says was chosen, or nothing if the step has no choice yet. */
function stepContent(id: WizardStepId, hero: Hero, sheet: HeroSheet): ReactNode[] | null {
  const name = (n: string | undefined) => (n ? [<Item key="name">{n}</Item>] : [])
  switch (id) {
    case 'start':
      return [<Item key="method">{hero.method === 'constructed' ? 'Constructed' : hero.rollMode === 'manual' ? 'Guided, rolling your own dice' : 'Guided, rolled in the app'}</Item>]
    case 'background':
      return hero.background && [...name(sheet.characteristics.background), <Traits key="t" sheet={sheet} step="background" />, <Principle key="p" choice={hero.background.principle} />]
    case 'power-source':
      return hero.powerSource && [...name(sheet.characteristics.powerSource), <Traits key="t" sheet={sheet} step="powerSource" />, <Abilities key="a" abilities={fromSource(sheet, 'powerSource')} />]
    case 'archetype':
      return hero.archetype && [...name(archetypeName(hero)), <Traits key="t" sheet={sheet} step="archetype" />, <Abilities key="a" abilities={fromSource(sheet, 'archetype')} />, <Principle key="p" choice={hero.archetype.principle} />]
    case 'personality': {
      if (!hero.personality) return null
      // The powers or qualities the player chose for the Out ability, else the one it names.
      const outTraits = (hero.personality.outUses?.length ? hero.personality.outUses : (sheet.outUse?.traits ?? [])).map((t) => traitLabel(hero, t))
      return [
        ...name(sheet.characteristics.personality),
        <Traits key="t" sheet={sheet} step="personality" />,
        sheet.statusDice && (
          <Item key="status">
            <StatusDiceRow dice={sheet.statusDice} />
          </Item>
        ),
        sheet.outAbility && (
          <Item key="out">
            <AbilityIcons actions={sheet.outEffects} />
            Out{outTraits.length ? `: ${outTraits.join(', ')}` : ' ability'}
          </Item>
        ),
      ]
    }
    case 'red-abilities':
      return hero.redAbilities.length ? [<Abilities key="a" abilities={fromSource(sheet, 'red')} />] : null
    case 'retcon':
      return hero.retcon && [<Item key="r">{retconsById.get(hero.retcon.id)?.summary ?? 'A retcon'}</Item>, <Traits key="t" sheet={sheet} step="retcon" />, <Abilities key="a" abilities={fromSource(sheet, 'retcon')} />]
    case 'health':
      return sheet.maxHealth === undefined
        ? null
        : [
            <Item key="h">
              <HealthChips max={sheet.maxHealth} ranges={sheet.healthRanges} />
            </Item>,
          ]
    case 'details': {
      // The name and alias are in the header already.
      const d = hero.details
      const labelled: [string, string][] = [
        ['Played by ', d.player],
        ['', d.gender],
        ['Age ', d.age],
        ['', d.height],
        ['', d.build],
        ['Eyes ', d.eyes],
        ['Hair ', d.hair],
        ['Skin ', d.skin],
        ['', d.costume],
      ]
      const filled = labelled.filter(([, v]) => v.trim())
      return filled.length ? filled.map(([label, v], i) => <Item key={i}>{`${label}${v.trim()}`}</Item>) : null
    }
  }
}

function ChangeLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="button" href={href} aria-label={`Change ${label}`}>
      Change
    </a>
  )
}

interface EditSummaryProps {
  hero: Hero
  steps: readonly StepState[]
  parts: readonly ArchetypePart[]
  href: (step: WizardStepId) => string
  partHref: (part: string) => string
  advancementHref: string
  changed: boolean
  onRevert: () => void
}

export function EditSummary({ hero, steps, parts, href, partHref, advancementHref, changed, onRevert }: EditSummaryProps) {
  const sheet = buildSheet(hero)
  return (
    <div className="edit-summary">
      <div className="save-note">
        <p role="status">
          <strong>Changes save as you go.</strong> {changed ? 'You have changes since you opened edit.' : 'No changes since you opened edit.'}
        </p>
        {/* aria-disabled rather than disabled, so focus stays on it after a revert. */}
        <button type="button" className="button" aria-disabled={!changed} onClick={() => changed && onRevert()}>
          Revert changes
        </button>
      </div>
      <ol className="summary-rows">
        {steps.map((s) => {
          const content = stepContent(s.id, hero, sheet)
          return (
            <li key={s.id} className="summary-row">
              <h4 className="summary-row__step">
                <span className="summary-row__num">{s.index > 0 ? s.index : ''}</span>
                <span>{s.label}</span>
                <StepMarkIcon mark={s.mark} count={s.issues.length} />
              </h4>
              <div className="summary-row__what">
                {content ? <ul className="summary-items">{content}</ul> : <p className={s.mark === 'issues' ? 'summary-row__empty summary-row__empty--issue' : 'summary-row__empty'}>Nothing chosen yet.</p>}
                {s.id === 'archetype' && parts.length > 0 && (
                  <ul className="summary-parts" aria-label="Archetype parts">
                    {parts.map((p) => (
                      <li key={p.id}>
                        <span>{p.label}</span>
                        <StepMarkIcon mark={p.mark} count={p.issues.length} />
                        <a className="button button--small" href={partHref(p.id)} aria-label={`Change ${p.label}`}>
                          Change
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ChangeLink href={href(s.id)} label={s.label} />
            </li>
          )
        })}
      </ol>
      <p className="hint">
        Back issues, collections and swaps moved out of the wizard: <a href={advancementHref}>Advancement</a> is on the hero's page.
      </p>
    </div>
  )
}
