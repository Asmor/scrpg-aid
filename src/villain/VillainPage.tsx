/**
 * A villain's character page in Sheet mode (scrpg-aid-designs/hero-sheet/spec.md, "Villain sheet"):
 * the hero page's header (breadcrumb, name and alias, identity line, the Sheet/Play switch,
 * Edit and Export) over the villain's sheet. Villain Play belongs with the GM screens, so Play
 * is still its own page for now. Give it `key={id}`.
 */
import { useEffect, useRef, useState } from 'react'
import { listPath, navigate, villainEditPath, villainPlayPath } from '../app/route'
import { useVillainStore } from '../app/villain-store-context'
import type { VillainGetResult } from './store'
import { appearanceOf, fillStyle } from '../colors/palette'
import { IssueBanner, ModeSwitch } from '../components/CharacterHead'
import { ExportMenu } from '../components/ExportMenu'
import { buildVillainSheet, villainIdentity } from './sheet'
import { VillainSheetView } from './VillainSheetView'
import { useAttached } from './useAttached'
import { SheetTags } from '../library/SheetTags'

type State = { status: 'loading' } | VillainGetResult | { status: 'error'; message: string }

export function VillainPage({ id }: { id: string }) {
  const store = useVillainStore()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const comesWith = useAttached(state.status === 'found' ? state.villain.attached : [])
  // Tag changes save in order, so a quick second change can't land before the first.
  const saving = useRef(Promise.resolve())

  useEffect(() => {
    let current = true
    store.get(id).then(
      (result) => current && setState(result),
      (e: unknown) => current && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      current = false
    }
  }, [store, id])

  if (state.status !== 'found') {
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

  const villain = state.villain
  const sheet = buildVillainSheet(villain)
  return (
    <div className="hero-page character-page">
      <header className="character-head">
        <p className="crumb">
          <a href={listPath}>Library</a> / {sheet.name}
        </p>
        <div className="character-head__row">
          <div className="character-head__name">
            <div className="character-head__title">
              <h2 className="char-band char-fill" style={fillStyle(appearanceOf({ kind: 'villain', appearance: villain.appearance }))}>
                {sheet.name}
              </h2>
              {sheet.alias && sheet.alias !== sheet.name && <span className="character-head__alias">{sheet.alias}</span>}
            </div>
            <p className="character-head__identity">{villainIdentity(sheet)}</p>
          </div>
          <div className="character-head__actions">
            <ModeSwitch mode="sheet" onChange={() => navigate(villainPlayPath(id))} />
            <a className="button" href={villainEditPath(id)}>
              Edit
            </a>
            <ExportMenu villain={villain} />
          </div>
        </div>
      </header>
      {saveError && (
        <p role="alert" className="error screen-only">
          Your last change couldn't be saved: {saveError}
        </p>
      )}
      <IssueBanner issues={sheet.warnings} href={villainEditPath(id)} />
      <SheetTags
        tags={villain.tags}
        itemName={sheet.name}
        onChange={(tags) => {
          // A tag change is a change to the villain: saved with a new updatedAt (scrpg-aid-designs/library/spec.md).
          const next = { ...villain, tags, updatedAt: new Date().toISOString() }
          setState({ status: 'found', villain: next })
          setSaveError(null)
          saving.current = saving.current.then(() => store.save(next)).catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
        }}
        onOpenTag={(path) => void saving.current.then(() => navigate(path))}
      />
      <VillainSheetView villain={villain} comesWith={comesWith} />
    </div>
  )
}
