/**
 * Editing a finished villain opens this summary first, as heroes do (the hero wizard spec,
 * "Edit mode"; the villain wizard spec, section 1): each step as a row with its mark, what was
 * chosen in one line with icons, and Change. Above the list, "Changes save as you go" and
 * Revert changes.
 */
import type { ReactNode, Ref } from 'react'
import { AbilityIcons, DieIcon } from '../../components/icons'
import { HealthChips } from '../../components/SheetPreview'
import { StepMarkIcon } from '../../editor/StepRail'
import type { Villain } from '../model'
import { buildVillainSheet, type VillainSheet, type VillainSheetAbility, type VillainStepId } from '../sheet'
import { statusSummary } from '../status'
import type { VillainStepState } from '../wizard-steps'

function Item({ children }: { children: ReactNode }) {
  return <li className="summary-item">{children}</li>
}

const abilities = (list: readonly VillainSheetAbility[]) =>
  list.map((a, i) => (
    <Item key={`${a.source}:${a.baseName}:${i}`}>
      <AbilityIcons actions={a.effects} />
      {a.name}
    </Item>
  ))

/** What a step's row says was chosen, or null if nothing is yet. */
function stepContent(id: VillainStepId, villain: Villain, sheet: VillainSheet): ReactNode[] | null {
  const d = villain.details
  switch (id) {
    case 'concept': {
      const goal = d.concept.trim()
      return goal ? [<Item key="goal">{goal}</Item>] : null
    }
    case 'approach':
      return sheet.approach
        ? [
            <Item key="name">{sheet.approach}</Item>,
            ...[...sheet.powers, ...sheet.qualities].map((t) => (
              <Item key={`${t.trait.kind}:${t.trait.id}`}>
                {t.name} <DieIcon die={t.die} size="inline" />
              </Item>
            )),
            ...abilities(sheet.abilities.filter((a) => a.source === 'approach' && !a.upgrade)),
          ]
        : null
    case 'archetype':
      return sheet.archetype
        ? [<Item key="name">{sheet.archetype}</Item>, ...(sheet.status ? [<Item key="status">{statusSummary(sheet.status)}</Item>] : []), ...abilities(sheet.abilities.filter((a) => (a.source === 'archetype' || a.source === 'archetype.fixed') && !a.upgrade))]
        : null
    case 'upgrades':
      return sheet.upgrades.length ? sheet.upgrades.map((u) => <Item key={u.name}>{u.name}</Item>) : [<Item key="none">None: a minor villain</Item>]
    case 'mastery':
      return sheet.mastery ? abilities([sheet.mastery]) : null
    case 'health':
      return sheet.health
        ? [
            <Item key="health">
              <HealthChips max={sheet.health.max} ranges={sheet.health.ranges} />
            </Item>,
            <Item key="heroes">
              for {sheet.health.heroCount} {sheet.health.heroCount === 1 ? 'hero' : 'heroes'}
            </Item>,
          ]
        : null
    case 'details': {
      const filled = (['appearance', 'costume', 'mannerisms', 'motivation', 'ties'] as const).map((f) => d[f].trim()).filter(Boolean)
      return filled.length ? filled.map((v, i) => <Item key={i}>{v}</Item>) : null
    }
  }
}

interface Props {
  villain: Villain
  steps: readonly VillainStepState[]
  href: (step: VillainStepId) => string
  changed: boolean
  onRevert: () => void
  revertRef?: Ref<HTMLButtonElement>
}

export function VillainEditSummary({ villain, steps, href, changed, onRevert, revertRef }: Props) {
  const sheet = buildVillainSheet(villain)
  return (
    <div className="edit-summary">
      <div className="save-note">
        <p role="status">
          <strong>Changes save as you go.</strong> {changed ? 'You have changes since you opened edit.' : 'No changes since you opened edit.'}
        </p>
        {/* aria-disabled rather than disabled, so focus stays on it after a revert. */}
        <button type="button" className="button" ref={revertRef} aria-disabled={!changed} onClick={() => changed && onRevert()}>
          Revert changes
        </button>
      </div>
      <ol className="summary-rows">
        {steps.map((s) => {
          const content = stepContent(s.id, villain, sheet)
          return (
            <li key={s.id} className="summary-row">
              <h4 className="summary-row__step">
                <span className="summary-row__num">{s.index}</span>
                <span>{s.label}</span>
                <StepMarkIcon mark={s.mark} count={s.issues.length} />
              </h4>
              <div className="summary-row__what">
                {content ? (
                  <ul className="summary-items">{content}</ul>
                ) : (
                  <p className={s.mark === 'issues' ? 'summary-row__empty summary-row__empty--issue' : 'summary-row__empty'}>{s.skipped ? 'Not needed: a minor villain.' : 'Nothing chosen yet.'}</p>
                )}
              </div>
              <a className="button" href={href(s.id)} aria-label={`Change ${s.label}`}>
                Change
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
