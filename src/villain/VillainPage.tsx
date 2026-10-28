/** One saved villain, loaded by id and shown as a sheet (Phase 5). Give it `key={id}`. */
import { useEffect, useState } from 'react'
import { listPath, villainEditPath } from '../app/route'
import { useVillainStore } from '../app/villain-store-context'
import type { VillainGetResult } from './store'
import { ExportMenu } from '../components/ExportMenu'
import { VillainSheetView } from './VillainSheetView'

type State = { status: 'loading' } | VillainGetResult | { status: 'error'; message: string }

export function VillainPage({ id }: { id: string }) {
  const store = useVillainStore()
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
        <a href={listPath}>← Home</a>
        {state.status === 'found' && (
          <span className="button-row">
            <a href={villainEditPath(id)}>Edit villain</a>
          </span>
        )}
      </p>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'missing' && <p role="alert">There's no saved villain with that link. It may have been deleted.</p>}
      {state.status === 'unreadable' && <p role="alert">This villain couldn't be read: {state.error}</p>}
      {state.status === 'error' && <p role="alert">Something went wrong loading this villain: {state.message}</p>}
      {state.status === 'found' && (
        <>
          <VillainSheetView villain={state.villain} />
          <ExportMenu villain={state.villain} />
        </>
      )}
    </div>
  )
}
