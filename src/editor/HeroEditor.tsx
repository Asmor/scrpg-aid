/**
 * Making or editing a hero, one step at a time. Every change saves straight away. Each
 * step shows its own rule problems; nothing blocks moving on (the user's "warn only"
 * decision), and going back keeps later choices, flagging the ones that no longer fit.
 */
import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { editPath, heroPath, listPath, navigate } from '../app/route'
import { buildSheet } from '../creation/sheet'
import type { StepId } from '../creation/warnings'
import { heroDisplayName, type Hero } from '../hero/model'
import { AdvancementStep } from './AdvancementStep'
import { ArchetypeStep } from './ArchetypeStep'
import { BackgroundStep } from './BackgroundStep'
import { DetailsStep } from './DetailsStep'
import { HealthStep } from './HealthStep'
import { PersonalityStep } from './PersonalityStep'
import { PowerSourceStep } from './PowerSourceStep'
import { RedAbilitiesStep } from './RedAbilitiesStep'
import { RetconStep } from './RetconStep'
import { StepWarnings } from './StepWarnings'
import { useHeroEditor } from './useHeroEditor'

type Update = (change: (draft: Hero) => void) => void

interface EditorStep {
  id: string
  label: string
  /** The warning steps shown with this step. */
  warns: readonly StepId[]
  render: (hero: Hero, update: Update) => ReactNode
}

const EDITOR_STEPS: readonly EditorStep[] = [
  { id: 'background', label: 'Background', warns: ['background'], render: (hero, update) => <BackgroundStep hero={hero} update={update} /> },
  { id: 'power-source', label: 'Power source', warns: ['powerSource'], render: (hero, update) => <PowerSourceStep hero={hero} update={update} /> },
  { id: 'archetype', label: 'Archetype', warns: ['archetype'], render: (hero, update) => <ArchetypeStep hero={hero} update={update} /> },
  { id: 'personality', label: 'Personality', warns: ['personality'], render: (hero, update) => <PersonalityStep hero={hero} update={update} /> },
  { id: 'red-abilities', label: 'Red abilities', warns: ['redAbilities'], render: (hero, update) => <RedAbilitiesStep hero={hero} update={update} /> },
  { id: 'retcon', label: 'Retcon', warns: ['retcon'], render: (hero, update) => <RetconStep hero={hero} update={update} /> },
  { id: 'health', label: 'Health', warns: ['health', 'principles'], render: (hero, update) => <HealthStep hero={hero} update={update} /> },
  { id: 'details', label: 'Details', warns: [], render: (hero, update) => <DetailsStep hero={hero} update={update} /> },
  { id: 'advancement', label: 'Advancement', warns: ['advancement'], render: (hero, update) => <AdvancementStep hero={hero} update={update} /> },
]

export function HeroEditor({ id, step: stepId }: { id: string; step?: string }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  const found = EDITOR_STEPS.findIndex((s) => s.id === stepId)
  const index = Math.max(0, found)
  const step = EDITOR_STEPS[index]!
  // An unknown step in the address shows the first step; put that step's address in its place.
  useEffect(() => {
    if (stepId !== undefined && found < 0) window.location.replace(editPath(id, EDITOR_STEPS[0]!.id))
  }, [id, stepId, found])
  /** Leaves the editor once the changes made so far are saved, so the next page shows them. */
  const leave = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void flush().then(() => navigate(path))
  }

  if (state.status !== 'ready') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved hero with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This hero couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this hero: {state.message}</p>}
      </div>
    )
  }

  const hero = state.hero
  const warnings = buildSheet(hero).warnings
  const countFor = (s: EditorStep) => warnings.filter((w) => s.warns.includes(w.step)).length
  const prev = EDITOR_STEPS[index - 1]
  const next = EDITOR_STEPS[index + 1]

  return (
    <div className="hero-editor">
      <div className="hero-editor__top">
        <a href={listPath} onClick={leave(listPath)}>
          ← All heroes
        </a>
        <a href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
          View sheet
        </a>
      </div>
      <h2 className="hero-editor__name">{heroDisplayName(hero)}</h2>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}

      <nav aria-label="Creation steps" className="step-nav">
        <ol>
          {EDITOR_STEPS.map((s, i) => {
            const count = countFor(s)
            return (
              <li key={s.id}>
                <a href={editPath(hero.id, s.id)} aria-current={i === index ? 'step' : undefined}>
                  <span className="step-nav__number">{i + 1}</span> {s.label}
                  {count > 0 && (
                    <span className="step-nav__count">
                      <span aria-hidden="true">{count}</span>
                      <span className="visually-hidden">
                        , {count} {count === 1 ? 'issue' : 'issues'}
                      </span>
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <section className="editor-step" aria-labelledby="editor-step-title">
        <h3 id="editor-step-title">{step.label}</h3>
        {step.render(hero, update)}
        {step.warns.length > 0 && <StepWarnings warnings={warnings.filter((w) => step.warns.includes(w.step))} />}
      </section>

      <div className="step-pager">
        {prev ? (
          <a className="button" href={editPath(hero.id, prev.id)}>
            ← {prev.label}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="button button--primary" href={editPath(hero.id, next.id)}>
            {next.label} →
          </a>
        ) : (
          <a className="button button--primary" href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
            View sheet
          </a>
        )}
      </div>
    </div>
  )
}
