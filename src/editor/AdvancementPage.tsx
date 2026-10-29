/**
 * A finished hero's advancement (p. 142–143): back issues, collections, and the changes made
 * between them. It has its own page, linked from the hero's page, outside the creation wizard.
 */
import type { MouseEvent } from 'react'
import { editPath, heroPath, listPath, navigate } from '../app/route'
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, isDraft } from '../hero/model'
import { continueStep } from '../hero/wizard-steps'
import { AdvancementStep } from './AdvancementStep'
import { StepWarnings } from './StepWarnings'
import { useHeroEditor } from './useHeroEditor'

export function AdvancementPage({ id }: { id: string }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  /** Leaves once the changes made so far are saved, so the next page shows them. */
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
  if (isDraft(hero)) {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        <p role="alert">
          {heroDisplayName(hero)} is still a draft; advancement starts once it's finished. <a href={editPath(hero.id, continueStep(hero.furthestStep))}>Continue making this hero</a>.
        </p>
      </div>
    )
  }
  return (
    <div className="hero-page">
      <p>
        <a href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
          ← {heroDisplayName(hero)}
        </a>
      </p>
      <h2>Advancement</h2>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}
      <section className="panel" aria-label="Advancement">
        <AdvancementStep hero={hero} update={update} />
        <StepWarnings warnings={buildSheet(hero).warnings.filter((w) => w.step === 'advancement')} />
      </section>
    </div>
  )
}
