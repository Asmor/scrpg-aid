/**
 * Making or editing a villain (Phase 5), one step at a time, like the hero editor: every
 * change saves straight away, each step shows its own rule problems, and nothing blocks.
 */
import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { listPath, navigate, villainEditPath, villainPath } from '../app/route'
import { StepWarnings } from '../editor/StepWarnings'
import { villainDisplayName, type Villain } from './model'
import { buildVillainSheet, type VillainStepId } from './sheet'
import { ApproachStep, ArchetypeStep, DetailsStep, HealthStep, UpgradesStep, type VillainUpdate } from './steps'
import { useVillainEditor } from './useVillainEditor'
import { RenameHeading } from '../components/RenameHeading'

interface EditorStep {
  id: string
  label: string
  /** The warning steps shown with this step. */
  warns: readonly VillainStepId[]
  render: (villain: Villain, update: VillainUpdate) => ReactNode
}

const STEPS: readonly EditorStep[] = [
  { id: 'approach', label: 'Approach', warns: ['approach'], render: (v, u) => <ApproachStep villain={v} update={u} /> },
  { id: 'archetype', label: 'Archetype', warns: ['archetype'], render: (v, u) => <ArchetypeStep villain={v} update={u} /> },
  { id: 'upgrades', label: 'Upgrades', warns: ['upgrades'], render: (v, u) => <UpgradesStep villain={v} update={u} /> },
  { id: 'health', label: 'Health', warns: ['health'], render: (v, u) => <HealthStep villain={v} update={u} /> },
  { id: 'details', label: 'Details', warns: ['details'], render: (v, u) => <DetailsStep villain={v} update={u} /> },
]

export function VillainEditor({ id, step: stepId }: { id: string; step?: string }) {
  const { state, update, saveError, flush } = useVillainEditor(id)
  const found = STEPS.findIndex((s) => s.id === stepId)
  const index = Math.max(0, found)
  const step = STEPS[index]!
  // An unknown step in the address shows the first step; put that step's address in its place.
  useEffect(() => {
    if (stepId !== undefined && found < 0) window.location.replace(villainEditPath(id, STEPS[0]!.id))
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
          <a href={listPath}>← Home</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved villain with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This villain couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this villain: {state.message}</p>}
      </div>
    )
  }

  const villain = state.doc
  const warnings = buildVillainSheet(villain).warnings
  const countFor = (s: EditorStep) => warnings.filter((w) => s.warns.includes(w.step)).length
  const prev = STEPS[index - 1]
  const next = STEPS[index + 1]

  return (
    <div className="hero-editor">
      <div className="hero-editor__top">
        <a href={listPath} onClick={leave(listPath)}>
          ← Home
        </a>
        <a href={villainPath(villain.id)} onClick={leave(villainPath(villain.id))}>
          View sheet
        </a>
      </div>
      <div className="hero-editor__name">
        <RenameHeading
          shown={villainDisplayName(villain)}
          name={villain.details.name}
          placeholder={!villain.details.name.trim() && !villain.details.alias.trim()}
          noun="villain"
          onRename={(name) =>
            update((v) => {
              v.details.name = name
            })
          }
        />
      </div>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}

      <nav aria-label="Creation steps" className="step-nav">
        <ol>
          {STEPS.map((s, i) => {
            const count = countFor(s)
            return (
              <li key={s.id}>
                <a href={villainEditPath(villain.id, s.id)} aria-current={i === index ? 'step' : undefined}>
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
        {step.render(villain, update)}
        <StepWarnings warnings={warnings.filter((w) => step.warns.includes(w.step))} />
      </section>

      <div className="step-pager">
        {prev ? (
          <a className="button" href={villainEditPath(villain.id, prev.id)}>
            ← {prev.label}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="button button--primary" href={villainEditPath(villain.id, next.id)}>
            {next.label} →
          </a>
        ) : (
          <a className="button button--primary" href={villainPath(villain.id)} onClick={leave(villainPath(villain.id))}>
            View sheet
          </a>
        )}
      </div>
    </div>
  )
}
