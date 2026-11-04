/**
 * The villain wizard (docs/design/villain-wizard/spec.md): making or editing a villain on the
 * hero wizard's shell (../editor/HeroEditor.tsx). It's a header with the villain type chip, a rail
 * of the seven steps, the current step, and a live preview of the villain sheet. Every change
 * saves straight away; each step shows its own rule issues, and nothing blocks moving on.
 *
 * A new villain is a draft (../app/new-villains.ts): nothing is saved until its first change,
 * and it stays a draft, remembering the furthest step reached, until the GM finishes it. A
 * finished villain's editor opens at the edit summary, with a snapshot taken on entry for
 * Revert changes.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { listPath, navigate, villainEditPath, villainPath } from '../app/route'
import { useNewVillains } from '../app/new-villains'
import { DiceText } from '../components/icons'
import { Modal } from '../components/Modal'
import { RenameHeading } from '../components/RenameHeading'
import { useMediaQuery } from '../components/useMediaQuery'
import { changedSince, restoreSnapshot } from '../editor/edit-snapshot'
import { IssueScope } from '../editor/inline-issues'
import { focusIssue } from '../editor/issue-targets'
import { readPreviewShown, writePreviewShown } from '../editor/preview-preference'
import { StepIssues } from '../editor/StepSection'
import { StepMarkIcon, StepRail } from '../editor/StepRail'
import { useTick } from '../play/useTick'
import { findBook } from '../rules/books'
import { createVillain, isVillainDraft, villainDisplayName, type Villain } from './model'
import { buildVillainSheet, isMajorVillain, type VillainStepId, type VillainWarning } from './sheet'
import { useVillainEditor } from './useVillainEditor'
import { continueVillainStep, VILLAIN_STEP_COUNT, VILLAIN_STEPS, villainStepNumber, villainStepStates } from './wizard-steps'
import { ApproachStep } from './wizard/ApproachStep'
import { ArchetypeStep } from './wizard/ArchetypeStep'
import type { Confirm, StepProps } from './wizard/choices'
import { ConceptStep, DetailsStep, HealthStep, MasteryStep } from './wizard/FinalSteps'
import { UpgradesStep } from './wizard/UpgradesStep'
import { VillainEditSummary } from './wizard/VillainEditSummary'
import { VillainPreview } from './wizard/VillainPreview'

interface StepView {
  purpose: string
  /** Where the step is in the Core Rules (villain creation is all in that book). */
  ref: { page: number; pageEnd?: number }
  render: (props: StepProps) => ReactNode
}

const book = (page: number, pageEnd?: number) => ({ page, ...(pageEnd ? { pageEnd } : {}) })

/** "Core Rules p. 208–219" */
const pageText = (ref: StepView['ref']) => `${findBook('core-rules')?.shortTitle ?? 'Core Rules'} p. ${ref.pageEnd ? `${ref.page}–${ref.pageEnd}` : ref.page}`

const STEP_VIEWS: Record<VillainStepId, StepView> = {
  concept: { purpose: 'Who the villain is and what they want. All optional.', ref: book(208), render: (p) => <ConceptStep {...p} /> },
  approach: { purpose: 'How the villain pursues its goals. It sets the dice, base Health and the abilities to choose from.', ref: book(208, 219), render: (p) => <ApproachStep {...p} /> },
  archetype: { purpose: 'How the villain fights. It sets how the status die works, adds to Health, and offers abilities. Villains can always use all their abilities.', ref: book(220, 234), render: (p) => <ArchetypeStep {...p} /> },
  upgrades: { purpose: 'Optional. Each upgrade adds Health and makes the villain a match for about one more hero. With none, the villain is a minor villain; with any, a major villain who also gets a mastery.', ref: book(235, 238), render: (p) => <UpgradesStep {...p} /> },
  mastery: { purpose: 'A major villain takes one villainous mastery.', ref: book(238), render: (p) => <MasteryStep {...p} /> },
  health: { purpose: 'Nothing to choose here. Health comes from the earlier steps and the number of heroes it faces.', ref: book(239), render: (p) => <HealthStep {...p} /> },
  details: { purpose: 'Appearance, costume, mannerisms, motivation and ties to the heroes.', ref: book(208), render: (p) => <DetailsStep {...p} /> },
}

/** "saved just now", "saved 3 minutes ago". */
function savedText(savedAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - savedAt.getTime()) / 60_000)
  if (minutes < 1) return 'saved just now'
  return `saved ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
}

const stepTitle = (n: number, label: string) => `${n} · ${label}`

/**
 * "#/villain/new": puts a new draft in memory and opens the wizard on it, in place of this
 * address (so Back doesn't make another). Nothing is saved until the first choice.
 */
export function NewVillain() {
  const newVillains = useNewVillains()
  // Once, even when an effect runs twice (React's StrictMode in development).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const villain: Villain = { ...createVillain(), status: 'draft' }
    newVillains.add(villain)
    window.location.replace(villainEditPath(villain.id, VILLAIN_STEPS[0].id))
  }, [newVillains])
  return <p>Starting a new villain…</p>
}

interface Ask {
  title: string
  body: string
  confirm: string
  onConfirm: () => void
}

/** Before finishing a villain with rule issues: each issue, with a way to it, and Finish anyway. */
function FinishDialog({ issues, href, onGo, onFinish, onClose }: { issues: readonly { label: string; warning: VillainWarning }[]; href: (step: VillainStepId) => string; onGo: (w: VillainWarning) => void; onFinish: () => void; onClose: () => void }) {
  return (
    <Modal title="Finish with rule issues?" onClose={onClose}>
      <p>
        {issues.length === 1 ? 'One thing' : `${issues.length} things`} still {issues.length === 1 ? "doesn't" : "don't"} follow the rules. Some tables play with house rules, so you can finish anyway.
      </p>
      <ul className="finish-issues">
        {issues.map(({ label, warning }, i) => (
          <li key={`${warning.step}:${warning.code}:${i}`}>
            <span>
              <span className="finish-issues__step">{label}:</span> <DiceText text={warning.message} />
            </span>
            <a className="button button--small" href={href(warning.step)} onClick={() => onGo(warning)}>
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

export function VillainWizard({ id, step: stepId }: { id: string; step?: string }) {
  const { state, update: save, saveError, flush, savedAt, stored } = useVillainEditor(id)
  const now = useTick()
  const wide = useMediaQuery('(min-width: 1280px)')
  const phone = !useMediaQuery('(min-width: 760px)')
  const [previewShown, setPreviewShown] = useState(readPreviewShown)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [asking, setAsking] = useState<Ask | null>(null)
  const [goTo, setGoTo] = useState<VillainWarning | null>(null)
  const [snapshot, setSnapshot] = useState<Villain | null>(null)
  const [reverting, setReverting] = useState(false)
  const revertButton = useRef<HTMLButtonElement>(null)
  const refocusRevert = useRef(false)
  useEffect(() => {
    if (!refocusRevert.current) return
    refocusRevert.current = false
    revertButton.current?.focus()
  })
  const number = villainStepNumber(stepId)
  const index = Math.max(1, number)
  const step = VILLAIN_STEPS[index - 1]!
  const loaded = state.status === 'ready' ? state.doc : undefined
  const ready = loaded !== undefined
  // The snapshot is the finished villain as first loaded.
  useEffect(() => {
    if (loaded && !isVillainDraft(loaded)) setSnapshot(structuredClone(loaded))
    // Only when the villain first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
  // A draft's editor with no step continues where the draft left off.
  const draftNoStep = loaded !== undefined && isVillainDraft(loaded) && stepId === undefined
  useEffect(() => {
    if (draftNoStep) window.location.replace(villainEditPath(id, continueVillainStep(loaded?.furthestStep)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNoStep, id])
  // An unknown step in the address shows the first step; put that step's address in its place.
  useEffect(() => {
    if (stepId !== undefined && number === 0) window.location.replace(villainEditPath(id, VILLAIN_STEPS[0].id))
  }, [id, stepId, number])
  /** Saves a change; a draft also remembers the furthest step it reached. */
  const update = (change: (draft: Villain) => void) =>
    save((v) => {
      change(v)
      if (isVillainDraft(v) && index > (v.furthestStep ?? 1)) v.furthestStep = index
    })
  // Reaching a later step counts as progress on a saved draft (an unsaved one waits for a choice).
  const behind = loaded !== undefined && stored && isVillainDraft(loaded) && stepId !== undefined && index > (loaded.furthestStep ?? 1)
  useEffect(() => {
    if (behind) update(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind])
  useEffect(() => {
    if (!goTo || goTo.step !== step.id) return
    const panel = document.querySelector<HTMLElement>('.wizard__step')
    if (panel) focusIssue(panel, goTo)
    setGoTo(null)
  }, [goTo, step.id])
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
          <a href={listPath}>← Library</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved villain with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This villain couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this villain: {state.message}</p>}
      </div>
    )
  }

  const villain = state.doc
  const draft = isVillainDraft(villain)
  const summary = !draft && stepId === undefined
  const changed = snapshot !== null && changedSince(snapshot, villain)
  const warnings = buildVillainSheet(villain).warnings
  const states = villainStepStates(villain, warnings).map((s) => (s.skipped ? { ...s, note: 'Not needed' } : s))
  const current = states[index - 1]!
  const view = STEP_VIEWS[step.id]
  const major = isMajorVillain(villain)
  const href = (s: string) => villainEditPath(villain.id, s)
  const summaryHref = draft ? undefined : villainEditPath(villain.id)
  const named = villain.details.name.trim() || villain.details.alias.trim()
  const lastSaved = savedAt ?? (stored ? new Date(villain.updatedAt) : null)
  const confirm: Confirm = (ask) => setAsking(ask)
  // A minor villain skips Mastery: Upgrades' next is Health, and Health's back is Upgrades.
  const skip = (s: VillainStepId | undefined) => (s === 'mastery' && !major ? undefined : s)
  const prevId = skip(VILLAIN_STEPS[index - 2]?.id) ?? VILLAIN_STEPS[index - 3]?.id
  const nextId = skip(VILLAIN_STEPS[index]?.id) ?? VILLAIN_STEPS[index + 1]?.id
  const labelOf = (s: VillainStepId) => VILLAIN_STEPS.find((x) => x.id === s)!.label

  /** Makes the draft a finished villain and opens its page, once that's saved. */
  const complete = () => {
    setFinishing(false)
    update((v) => {
      v.status = 'complete'
      delete v.furthestStep
    })
    void flush().then((ok) => ok && navigate(villainPath(villain.id)))
  }
  const finish = () => (warnings.length > 0 ? setFinishing(true) : complete())
  const revert = () => {
    setReverting(false)
    refocusRevert.current = true
    if (snapshot) save((v) => restoreSnapshot(v, snapshot))
  }
  const togglePreview = () => {
    if (wide) {
      writePreviewShown(!previewShown)
      setPreviewShown(!previewShown)
    } else {
      setPreviewOpen(true)
    }
  }
  const docked = wide && previewShown
  const doneLink = (
    <a className="button button--primary" href={villainPath(villain.id)} onClick={leave(villainPath(villain.id))}>
      Done editing
    </a>
  )
  const nextButton = summary ? (
    doneLink
  ) : nextId ? (
    <a className="button button--primary" href={href(nextId)}>
      {labelOf(nextId)} →
    </a>
  ) : draft ? (
    <button type="button" className="button button--primary" onClick={finish}>
      Finish villain
    </button>
  ) : (
    doneLink
  )
  const rail = (onNavigate?: () => void) => <StepRail steps={states} current={summary ? 'summary' : step.id} href={href} {...(summaryHref ? { summaryHref } : {})} {...(onNavigate ? { onNavigate } : {})} />

  return (
    <div className="wizard">
      <header className="wizard__head">
        <div>
          <p className="crumb">
            <a href={listPath} onClick={leave(listPath)}>
              Library
            </a>{' '}
            /{' '}
            {draft ? (
              'New villain'
            ) : (
              <>
                <a href={villainPath(villain.id)} onClick={leave(villainPath(villain.id))}>
                  {villainDisplayName(villain)}
                </a>{' '}
                / Edit
              </>
            )}
          </p>
          <div className="wizard__title">
            <RenameHeading
              shown={villainDisplayName(villain)}
              name={villain.details.name}
              placeholder={!named}
              noun="villain"
              onRename={(name) =>
                save((v) => {
                  v.details.name = name
                })
              }
            />
            {villain.details.name.trim() && villain.details.alias.trim() && <span className="wizard__alias">{villain.details.alias}</span>}
            {draft && (
              <span className="draft-chip" role="status">
                Draft{lastSaved ? ` · ${savedText(lastSaved, now)}` : ' · not saved yet'}
              </span>
            )}
            <span className={major ? 'type-chip type-chip--major' : 'type-chip'} aria-live="polite">
              {major ? 'Major villain' : 'Minor villain'}
            </span>
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
              Finish villain
            </button>
          ) : (
            doneLink
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
            {rail()}
            <p className="rail-foot">
              Built for {villain.heroCount} {villain.heroCount === 1 ? 'hero' : 'heroes'}. Each game recalculates Health for its own table.
            </p>
          </nav>
        )}
        {phone && (
          <button type="button" className="step-button" aria-haspopup="dialog" onClick={() => setStepsOpen(true)}>
            {summary ? (
              <strong>Summary</strong>
            ) : (
              <>
                <span className="step-button__where">
                  Step {index} of {VILLAIN_STEP_COUNT} ·
                </span>
                <strong>{step.label}</strong>
                {current.mark === 'issues' && <StepMarkIcon mark="issues" count={current.issues.length} />}
              </>
            )}
            <span className="visually-hidden">: all steps</span>
          </button>
        )}
        <section className="wizard__step panel" aria-labelledby="editor-step-title">
          {summary ? (
            <>
              <div className="step-head">
                <div>
                  <h3 id="editor-step-title">Summary</h3>
                  <p className="lede">Everything this villain is made of. Change opens that step.</p>
                </div>
              </div>
              <VillainEditSummary villain={villain} steps={states} href={href} changed={changed} onRevert={() => setReverting(true)} revertRef={revertButton} />
            </>
          ) : (
            <>
              <div className="step-head">
                <div>
                  <h3 id="editor-step-title">{stepTitle(index, step.label)}</h3>
                  <p className="lede">{view.purpose}</p>
                </div>
                <span className="page-ref">{pageText(view.ref)}</span>
              </div>
              <IssueScope issues={current.issues}>{view.render({ villain, update, confirm })}</IssueScope>
              <StepIssues issues={current.issues} />
              <div className="stepnav">
                {prevId ? (
                  <a className="button" href={href(prevId)}>
                    ← {labelOf(prevId)}
                  </a>
                ) : summaryHref ? (
                  <a className="button" href={summaryHref}>
                    Summary
                  </a>
                ) : (
                  <span />
                )}
                {nextButton}
              </div>
            </>
          )}
        </section>

        {docked && (
          <aside className="wizard__preview" aria-labelledby="sheet-preview-title">
            <div className="wizard__preview-head">
              <h3 id="sheet-preview-title">Sheet preview</h3>
              <button type="button" className="button button--small" onClick={togglePreview}>
                Hide
              </button>
            </div>
            <VillainPreview villain={villain} />
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
          {rail(() => setStepsOpen(false))}
        </Modal>
      )}
      {previewOpen && !wide && (
        <Modal title="Sheet preview" variant={phone ? 'sheet' : 'drawer'} onClose={() => setPreviewOpen(false)}>
          <VillainPreview villain={villain} />
        </Modal>
      )}
      {asking && (
        <Modal title={asking.title} onClose={() => setAsking(null)}>
          <p>{asking.body}</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                asking.onConfirm()
                setAsking(null)
              }}
            >
              {asking.confirm}
            </button>
            <button type="button" className="button" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {reverting && (
        <Modal title="Revert changes?" onClose={() => setReverting(false)}>
          <p>This puts {villainDisplayName(villain)} back exactly as it was when you opened edit. Every change since then is lost.</p>
          <div className="button-row">
            <button type="button" className="button button--danger" onClick={revert}>
              Revert changes
            </button>
            <button type="button" className="button" onClick={() => setReverting(false)}>
              Keep changes
            </button>
          </div>
        </Modal>
      )}
      {finishing && (
        <FinishDialog
          issues={states.flatMap((s) => s.issues.map((warning) => ({ label: stepTitle(s.index, s.label), warning })))}
          href={href}
          onGo={(w) => {
            setFinishing(false)
            setGoTo(w)
          }}
          onFinish={complete}
          onClose={() => setFinishing(false)}
        />
      )}
    </div>
  )
}
