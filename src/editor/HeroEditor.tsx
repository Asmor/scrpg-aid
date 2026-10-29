/**
 * The hero wizard: making or editing a hero, one step at a time (docs/design/hero-wizard/spec.md).
 * It's a header, a step rail, the current step and a live sheet preview. Every change saves
 * straight away. Each step shows its own rule problems; nothing blocks moving on (the user's
 * "warn only" decision), and going back keeps later choices, flagging the ones that no
 * longer fit.
 *
 * A new hero is a draft (../app/new-heroes.ts): nothing is saved until its first change, and
 * it stays a draft, remembering the furthest step reached, until the player finishes it.
 *
 * Layout by width: from 1280px the rail and the preview are columns; from 760px the rail is
 * a column and the preview a drawer; below that the step list and the preview are bottom
 * sheets, opened from a step button and a sticky footer.
 */
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { advancementPath, editPath, heroPath, listPath, navigate } from '../app/route'
import { formatEntryRef } from '../rules/books'
import { backgroundStep, healthStep, personalityStep, powerSourceStep, redAbilityStep, retconStep, archetypeStep } from '../rules/data'
import type { PageRef } from '../rules/types'
import { buildSheet } from '../creation/sheet'
import type { RuleWarning } from '../creation/warnings'
import { heroDisplayName, isDraft, type Hero } from '../hero/model'
import { NUMBERED_STEPS, stepStates, WIZARD_STEPS, wizardStepIndex, type WizardStepId } from '../hero/wizard-steps'
import { useTick } from '../play/useTick'
import { DiceText } from '../components/icons'
import { Modal } from '../components/Modal'
import { SheetPreview } from '../components/SheetPreview'
import { useMediaQuery } from '../components/useMediaQuery'
import { ArchetypeStep } from './ArchetypeStep'
import { BackgroundStep } from './BackgroundStep'
import { DetailsStep } from './DetailsStep'
import { HealthStep } from './HealthStep'
import { PersonalityStep } from './PersonalityStep'
import { PowerSourceStep } from './PowerSourceStep'
import { readPreviewShown, writePreviewShown } from './preview-preference'
import { RedAbilitiesStep } from './RedAbilitiesStep'
import { RetconStep } from './RetconStep'
import { StartStep } from './StartStep'
import { StepMarkIcon, StepRail } from './StepRail'
import { StepWarnings } from './StepWarnings'
import { useHeroEditor } from './useHeroEditor'

type Update = (change: (draft: Hero) => void) => void

interface StepView {
  /** One line on what the step is for. */
  purpose: string
  /** Where the step is in the book, when it has a page of its own. */
  ref?: PageRef
  render: (hero: Hero, update: Update) => ReactNode
}

const STEP_VIEWS: Record<WizardStepId, StepView> = {
  start: { purpose: 'Two choices before Background. You can change them later; dice already rolled stay as they are.', render: (hero, update) => <StartStep hero={hero} update={update} /> },
  background: { purpose: 'Who your hero was before the powers. Gives qualities, a principle, and the dice for Power source.', ref: backgroundStep, render: (hero, update) => <BackgroundStep hero={hero} update={update} /> },
  'power-source': { purpose: 'Where the powers come from. Gives powers, abilities, and the dice for Archetype.', ref: powerSourceStep, render: (hero, update) => <PowerSourceStep hero={hero} update={update} /> },
  archetype: { purpose: 'How your hero uses those powers. Gives powers and qualities, abilities, a principle, and the dice for Personality.', ref: archetypeStep, render: (hero, update) => <ArchetypeStep hero={hero} update={update} /> },
  personality: { purpose: 'How your hero acts under pressure. Gives a roleplaying quality, status dice, and an Out ability.', ref: personalityStep, render: (hero, update) => <PersonalityStep hero={hero} update={update} /> },
  'red-abilities': { purpose: "Your hero's strongest moves, usable only once your hero is in the Red zone.", ref: redAbilityStep, render: (hero, update) => <RedAbilitiesStep hero={hero} update={update} /> },
  retcon: { purpose: 'One last change to tidy up the build.', ref: retconStep, render: (hero, update) => <RetconStep hero={hero} update={update} /> },
  health: { purpose: 'How much your hero can take before going down.', ref: healthStep, render: (hero, update) => <HealthStep hero={hero} update={update} /> },
  details: { purpose: 'Name, look, and the rest of who your hero is.', render: (hero, update) => <DetailsStep hero={hero} update={update} /> },
}

/** "saved just now", "saved 3 minutes ago". */
function savedText(savedAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - savedAt.getTime()) / 60_000)
  if (minutes < 1) return 'saved just now'
  return `saved ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
}

/** "3 · Archetype"; Start has no number. */
const stepTitle = (index: number, label: string) => (index > 0 ? `${index} · ${label}` : label)

/** Before finishing a hero with rule issues: each issue, with a way to it, and Finish anyway. */
function FinishDialog({ issues, href, onFinish, onClose }: { issues: readonly { step: WizardStepId; label: string; warning: RuleWarning }[]; href: (id: WizardStepId) => string; onFinish: () => void; onClose: () => void }) {
  return (
    <Modal title="Finish with rule issues?" onClose={onClose}>
      <p>
        {issues.length === 1 ? 'One thing' : `${issues.length} things`} still {issues.length === 1 ? "doesn't" : "don't"} follow the rules. Some tables play with house rules, so you can finish anyway.
      </p>
      <ul className="finish-issues">
        {issues.map(({ step, label, warning }, i) => (
          <li key={`${step}:${warning.code}:${i}`}>
            <span>
              <span className="finish-issues__step">{label}:</span> <DiceText text={warning.message} />
            </span>
            <a className="button button--small" href={href(step)} onClick={onClose}>
              Go to issue
            </a>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button type="button" className="button button--primary" onClick={onFinish}>
          Finish anyway
        </button>
        <button type="button" className="button" onClick={onClose}>
          Keep editing
        </button>
      </div>
    </Modal>
  )
}

export function HeroEditor({ id, step: stepId }: { id: string; step?: string }) {
  const { state, update: save, saveError, flush, savedAt, stored } = useHeroEditor(id)
  const now = useTick()
  const wide = useMediaQuery('(min-width: 1280px)')
  const phone = !useMediaQuery('(min-width: 760px)')
  const [previewShown, setPreviewShown] = useState(readPreviewShown)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  // Advancement left the wizard for a page of its own.
  const movedAdvancement = stepId === 'advancement'
  const found = wizardStepIndex(stepId)
  const index = Math.max(0, found)
  const step = WIZARD_STEPS[index]!
  const loaded = state.status === 'ready' ? state.hero : undefined
  /** Saves a change; a draft also remembers the furthest step it reached. */
  const update = (change: (draft: Hero) => void) =>
    save((h) => {
      change(h)
      if (isDraft(h) && index > (h.furthestStep ?? 0)) h.furthestStep = index
    })
  // An unknown step in the address shows the first step; put that step's address in its place.
  useEffect(() => {
    if (movedAdvancement) window.location.replace(advancementPath(id))
    else if (stepId !== undefined && found < 0) window.location.replace(editPath(id, WIZARD_STEPS[0].id))
  }, [id, stepId, found, movedAdvancement])
  // Reaching a later step counts as progress on a saved draft (an unsaved one waits for a choice).
  const behind = loaded !== undefined && stored && isDraft(loaded) && index > (loaded.furthestStep ?? 0)
  useEffect(() => {
    if (behind) update(() => {})
    // `update` is a new function each render; `behind` says when it's needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind])
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
  const draft = isDraft(hero)
  const warnings = buildSheet(hero).warnings
  const states = stepStates(hero, warnings)
  const current = states[index]!
  const view = STEP_VIEWS[step.id]
  const prev = WIZARD_STEPS[index - 1]
  const next = WIZARD_STEPS[index + 1]
  const href = (s: string) => editPath(hero.id, s)
  const named = hero.details.name.trim() || hero.details.alias.trim()
  const lastSaved = savedAt ?? (stored ? new Date(hero.updatedAt) : null)

  /** Makes the draft a complete hero and opens its page, once that's saved. */
  const complete = () => {
    setFinishing(false)
    update((h) => {
      h.status = 'complete'
      delete h.furthestStep
    })
    void flush().then((ok) => ok && navigate(heroPath(hero.id)))
  }
  /** Finish hero: straight away, or after showing the open rule issues. */
  const finish = () => (states.some((s) => s.issues.length > 0) ? setFinishing(true) : complete())
  const togglePreview = () => {
    if (wide) {
      writePreviewShown(!previewShown)
      setPreviewShown(!previewShown)
    } else {
      setPreviewOpen(true)
    }
  }
  const docked = wide && previewShown
  const nextButton = next ? (
    <a className="button button--primary" href={href(next.id)}>
      {next.label}
    </a>
  ) : draft ? (
    <button type="button" className="button button--primary" onClick={finish}>
      Finish hero
    </button>
  ) : (
    <a className="button button--primary" href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
      Done editing
    </a>
  )

  return (
    <div className="wizard">
      <header className="wizard__head">
        <div>
          <p className="crumb">
            <a href={listPath} onClick={leave(listPath)}>
              Your heroes
            </a>{' '}
            /{' '}
            {draft ? (
              'New hero'
            ) : (
              <>
                <a href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
                  {heroDisplayName(hero)}
                </a>{' '}
                / Edit
              </>
            )}
          </p>
          <div className="wizard__title">
            <h2 className={named ? undefined : 'placeholder'}>{heroDisplayName(hero)}</h2>
            {hero.details.name.trim() && hero.details.alias.trim() && <span className="wizard__alias">{hero.details.alias}</span>}
            {draft && (
              <span className="draft-chip" role="status">
                Draft{lastSaved ? ` · ${savedText(lastSaved, now)}` : ' · not saved yet'}
              </span>
            )}
          </div>
        </div>
        <div className="button-row">
          {!phone && (
            <button type="button" className="button" onClick={togglePreview} aria-expanded={wide ? previewShown : previewOpen}>
              {wide && previewShown ? 'Hide preview' : 'Show preview'}
            </button>
          )}
          {draft ? (
            <button type="button" className="button" onClick={finish}>
              Finish hero
            </button>
          ) : (
            <a className="button button--primary" href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
              Done editing
            </a>
          )}
        </div>
      </header>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}

      <div className={`wizard__layout${docked ? ' wizard__layout--preview' : ''}`}>
        {!phone && (
          <nav className="wizard__rail" aria-label="Creation steps">
            <StepRail steps={states} current={step.id} href={href} />
            <p className="rail-foot">{hero.method === 'constructed' ? 'Constructed method.' : `Guided method · ${hero.rollMode === 'manual' ? 'rolling your own dice' : 'rolling in the app'}.`}</p>
          </nav>
        )}

        {phone && (
          <button type="button" className="step-button" aria-haspopup="dialog" onClick={() => setStepsOpen(true)}>
            <span className="step-button__where">{index > 0 ? `Step ${index} of ${NUMBERED_STEPS} ·` : 'Before step 1 ·'}</span>
            <strong>{step.label}</strong>
            {current.mark === 'issues' && <StepMarkIcon mark="issues" count={current.issues.length} />}
            <span className="visually-hidden">: all steps</span>
          </button>
        )}
        <section className="wizard__step panel" aria-labelledby="editor-step-title">
          <div className="step-head">
            <div>
              <h3 id="editor-step-title">{stepTitle(index, step.label)}</h3>
              <p className="lede">{view.purpose}</p>
            </div>
            {view.ref && <span className="page-ref">{formatEntryRef(view.ref)}</span>}
          </div>
          {view.render(hero, update)}
          {step.id !== 'start' && <StepWarnings warnings={current.issues} />}
          <div className="stepnav">
            {prev ? (
              <a className="button" href={href(prev.id)}>
                {prev.label}
              </a>
            ) : (
              <span />
            )}
            {nextButton}
          </div>
        </section>

        {docked && (
          <aside className="wizard__preview" aria-labelledby="sheet-preview-title">
            <div className="wizard__preview-head">
              <h3 id="sheet-preview-title">Sheet preview</h3>
              <button type="button" className="button button--small" onClick={togglePreview}>
                Hide
              </button>
            </div>
            <SheetPreview hero={hero} />
          </aside>
        )}
      </div>

      {phone && (
        <div className="phonebar">
          <button type="button" className="button" aria-haspopup="dialog" onClick={() => setPreviewOpen(true)}>
            Preview
          </button>
          {nextButton}
        </div>
      )}

      {stepsOpen && (
        <Modal title="Steps" variant="sheet" onClose={() => setStepsOpen(false)}>
          <StepRail steps={states} current={step.id} href={href} onNavigate={() => setStepsOpen(false)} />
        </Modal>
      )}
      {previewOpen && !wide && (
        <Modal title="Sheet preview" variant={phone ? 'sheet' : 'drawer'} onClose={() => setPreviewOpen(false)}>
          <SheetPreview hero={hero} />
        </Modal>
      )}
      {finishing && (
        <FinishDialog
          issues={states.flatMap((s) => s.issues.map((warning) => ({ step: s.id, label: stepTitle(s.index, s.label), warning })))}
          href={href}
          onFinish={complete}
          onClose={() => setFinishing(false)}
        />
      )}
    </div>
  )
}
