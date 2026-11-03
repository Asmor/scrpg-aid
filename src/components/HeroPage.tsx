/**
 * The character page for a hero (docs/design/hero-sheet/spec.md): one page with two modes,
 * Sheet (`#/hero/<id>`) and Play (`#/hero/<id>/play`). The router keeps the same page across
 * the two, so switching doesn't reload the hero or lose what's open. The hero document is the
 * sheet only; Play works on the hero's solo game (docs/design/game-table/spec.md, section 12),
 * which keeps its own copy of the sheet up to date and saves as changes are made.
 */
import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import { advancementPath, editPath, heroPath, listPath, navigate, playPath } from '../app/route'
import { buildSheet, heroIdentity } from '../creation/sheet'
import { useHeroEditor } from '../editor/useHeroEditor'
import { heroDisplayName, isDraft, newId } from '../hero/model'
import { continueStep, stepStates } from '../hero/wizard-steps'
import { PlayView } from '../play/PlayView'
import type { Clock } from '../play/state'
import { ExportMenu } from './ExportMenu'
import { HeroSheetView } from './HeroSheetView'
import { IssueBanner, ModeSwitch, type CharacterMode } from './CharacterHead'
import { SheetTags } from '../library/SheetTags'
import { AlsoIn, SoloPlayActions } from '../game/SoloPlay'
import { soloHero, startOverSolo } from '../game/solo'
import { changeHeroPlay } from '../game/table'
import { gamesHolding, useListedGames, useSoloGame } from '../game/useGameEditor'

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })

export function HeroPage({ id, mode = 'sheet', clock = defaultClock, random }: { id: string; mode?: CharacterMode; clock?: () => Clock; random?: () => number }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  const playable = state.status === 'ready' && !isDraft(state.hero) ? state.hero : undefined
  const solo = useSoloGame('hero', playable, clock)
  const listed = useListedGames()
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
    void Promise.all([flush(), solo.flush()]).then(() => navigate(path))
  }
  const switchMode = (next: CharacterMode) => {
    anchor.current = document.getElementById('sheet-mechanics-title')?.getBoundingClientRect().top ?? null
    navigate(next === 'play' ? playPath(id) : heroPath(id))
  }
  const sheet = buildSheet(hero)
  const named = hero.details.name.trim() && hero.details.alias.trim()
  const game = solo.state.status === 'ready' ? solo.state.doc : undefined
  const copy = game && soloHero(game)

  return (
    <div className="hero-page character-page">
      <header className="character-head">
        <p className="crumb">
          <a href={listPath} onClick={leave(listPath)}>
            Library
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
              <SoloPlayActions name={heroDisplayName(hero)} onStartOver={() => solo.apply(startOverSolo)} />
            )}
          </div>
        </div>
      </header>
      {(saveError ?? solo.saveError) && (
        <p role="alert" className="error screen-only">
          Your last change couldn't be saved: {saveError ?? solo.saveError}
        </p>
      )}
      {mode === 'play' && <AlsoIn name={heroDisplayName(hero)} games={gamesHolding(listed.games ?? [], 'hero', id)} />}
      {draft ? <p className="hint screen-only">This hero is a draft. Finish it to play it.</p> : <IssueBanner issues={stepStates(hero, sheet.warnings).flatMap((s) => s.issues)} href={editPath(id)} />}

      {mode === 'sheet' && (
        <SheetTags
          tags={hero.tags}
          itemName={heroDisplayName(hero)}
          onChange={(tags) => update((h) => void (h.tags = tags))}
          onOpenTag={(path) => void flush().then(() => navigate(path))}
        />
      )}

      {mode === 'sheet' ? (
        <HeroSheetView hero={hero} advancement={draft ? undefined : { href: advancementPath(id), onClick: leave(advancementPath(id)) }} />
      ) : copy ? (
        <PlayView hero={copy.sheet} play={copy.play} changePlay={(fn) => solo.apply((g) => changeHeroPlay(g, copy.id, (p) => fn(p), clock(), false))} clock={clock} random={random} />
      ) : solo.state.status === 'unreadable' ? (
        <p role="alert">This hero's play state couldn't be read: {solo.state.error}</p>
      ) : solo.state.status === 'error' ? (
        <p role="alert">Something went wrong loading this hero's play state: {solo.state.message}</p>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  )
}

/** Play mode on its own (`#/hero/<id>/play`). */
export function PlayPage(props: { id: string; clock?: () => Clock; random?: () => number }) {
  return <HeroPage {...props} mode="play" />
}
