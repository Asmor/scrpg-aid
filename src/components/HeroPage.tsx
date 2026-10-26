/** One saved hero, loaded by id and shown as a sheet. Give it `key={id}` so a new id starts fresh. */
import { useEffect, useState } from 'react'
import { editPath, listPath } from '../app/route'
import { useStore } from '../app/store-context'
import type { GetResult } from '../hero/store'
import { ExportMenu } from './ExportMenu'
import { HeroSheetView } from './HeroSheetView'

type State = { status: 'loading' } | GetResult | { status: 'error'; message: string }

export function HeroPage({ id }: { id: string }) {
  const store = useStore()
  const [state, setState] = useState<State>({ status: 'loading' })

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

  return (
    <div className="hero-page">
      <p className="hero-page__links">
        <a href={listPath}>← All heroes</a>
        {state.status === 'found' && <a href={editPath(id)}>Edit hero</a>}
      </p>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'missing' && <p role="alert">There's no saved hero with that link. It may have been deleted.</p>}
      {state.status === 'unreadable' && <p role="alert">This hero couldn't be read: {state.error}</p>}
      {state.status === 'error' && <p role="alert">Something went wrong loading this hero: {state.message}</p>}
      {state.status === 'found' && (
        <>
          <HeroSheetView hero={state.hero} />
          <ExportMenu hero={state.hero} />
        </>
      )}
    </div>
  )
}
