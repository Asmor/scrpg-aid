/**
 * The character page for a hero (docs/design/hero-sheet/spec.md): one page with two modes,
 * Sheet (`#/hero/<id>`) and Play (`#/hero/<id>/play`). The router keeps the same page across
 * the two, so switching doesn't reload the hero or lose what's open. Play changes save as
 * they're made, so the page loads the hero for editing.
 */
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { advancementPath, editPath, heroPath, listPath, navigate, playPath } from '../app/route'
import { buildSheet, heroIdentity } from '../creation/sheet'
import { useHeroEditor } from '../editor/useHeroEditor'
import { heroDisplayName, isDraft, newId, type Hero } from '../hero/model'
import { continueStep, stepStates } from '../hero/wizard-steps'
import { PlayView } from '../play/PlayPage'
import { emptyPlay, newIssue, type Clock } from '../play/state'
import { ExportMenu } from './ExportMenu'
import { HeroSheetView } from './HeroSheetView'
import { DiceText } from './icons'
import { Modal } from './Modal'

export type CharacterMode = 'sheet' | 'play'

/** A finished hero with rule issues stays finished; the banner names how many and the first, and links to the edit summary. */
function IssueBanner({ hero }: { hero: Hero }) {
  const issues = stepStates(hero, buildSheet(hero).warnings).flatMap((s) => s.issues)
  if (!issues.length) return null
  return (
    <div className="issue-banner" role="note">
      <strong>{issues.length === 1 ? '1 rule issue' : `${issues.length} rule issues`}</strong>
      <span className="issue-banner__first">
        <DiceText text={issues[0]!.message} />
      </span>
      <a href={editPath(hero.id)}>Open in edit</a>
    </div>
  )
}

/** The Sheet/Play switch: two buttons, the current one pressed. */
function ModeSwitch({ mode, onChange }: { mode: CharacterMode; onChange: (mode: CharacterMode) => void }) {
  return (
    <div className="segmented segmented--big" role="group" aria-label="Mode">
      {(
        [
          ['sheet', 'Sheet'],
          ['play', 'Play'],
        ] as const
      ).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={mode === value} onClick={() => mode !== value && onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  )
}

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })

export function HeroPage({ id, mode = 'sheet', clock = defaultClock, random }: { id: string; mode?: CharacterMode; clock?: () => Clock; random?: () => number }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  const [confirmIssue, setConfirmIssue] = useState(false)
  // Where the Mechanics heading was on screen before switching modes, to put it back there after.
  const anchor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const top = anchor.current
    anchor.current = null
    const heading = document.getElementById('sheet-mechanics-title')
    if (top !== null && heading) window.scrollBy(0, heading.getBoundingClientRect().top - top)
  }, [mode])

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
  const continueHref = editPath(id, continueStep(hero.furthestStep))
  // Drafts can't be played until they're finished (the hero wizard spec, "Drafts").
  if (draft && mode === 'play') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        <p role="alert">
          {heroDisplayName(hero)} is still a draft. <a href={continueHref}>Continue making this hero</a> and finish it to play.
        </p>
      </div>
    )
  }

  /** Leaves once the changes made so far are saved, so the next page shows them. */
  const leave = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void flush().then(() => navigate(path))
  }
  const switchMode = (next: CharacterMode) => {
    anchor.current = document.getElementById('sheet-mechanics-title')?.getBoundingClientRect().top ?? null
    navigate(next === 'play' ? playPath(id) : heroPath(id))
  }
  const sheet = buildSheet(hero)
  const named = hero.details.name.trim() && hero.details.alias.trim()

  return (
    <div className="hero-page character-page">
      <header className="character-head">
        <p className="crumb">
          <a href={listPath} onClick={leave(listPath)}>
            Your heroes
          </a>{' '}
          / {heroDisplayName(hero)}
        </p>
        <div className="character-head__row">
          <div className="character-head__name">
            <div className="character-head__title">
              <h2>{heroDisplayName(hero)}</h2>
              {named && <span className="character-head__alias">{hero.details.alias}</span>}
            </div>
            <p className="character-head__identity">{heroIdentity(sheet)}</p>
          </div>
          <div className="character-head__actions">
            {!draft && <ModeSwitch mode={mode} onChange={switchMode} />}
            {draft ? (
              <a className="button button--primary" href={continueHref}>
                Continue making this hero
              </a>
            ) : (
              <a className="button" href={editPath(id)} onClick={leave(editPath(id))}>
                Edit
              </a>
            )}
            {mode === 'sheet' ? (
              <>
                {!draft && (
                  <a className="button" href={advancementPath(id)} onClick={leave(advancementPath(id))}>
                    Advancement
                  </a>
                )}
                <ExportMenu hero={hero} />
              </>
            ) : (
              <button type="button" className="button" onClick={() => setConfirmIssue(true)}>
                New issue…
              </button>
            )}
          </div>
        </div>
      </header>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}
      {draft ? <p className="hint">This hero is a draft. Finish it to play it.</p> : <IssueBanner hero={hero} />}

      {mode === 'sheet' ? <HeroSheetView hero={hero} advancement={draft ? undefined : { href: advancementPath(id), onClick: leave(advancementPath(id)) }} /> : <PlayView hero={hero} update={update} clock={clock} random={random} />}

      {confirmIssue && (
        <Modal title="Start a new issue?" onClose={() => setConfirmIssue(false)}>
          <p>Health is restored, and mods, twists, and hero points are cleared.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                update((h) => void (h.play = newIssue(h.play ?? emptyPlay(), clock())))
                setConfirmIssue(false)
              }}
            >
              Yes, new issue
            </button>
            <button type="button" className="button" onClick={() => setConfirmIssue(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Play mode on its own (`#/hero/<id>/play`). */
export function PlayPage(props: { id: string; clock?: () => Clock; random?: () => number }) {
  return <HeroPage {...props} mode="play" />
}
