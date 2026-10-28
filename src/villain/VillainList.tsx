/** The home page's villains (Phase 5): start one, open one, or delete one. */
import { useEffect, useRef, useState } from 'react'
import { navigate, villainEditPath, villainPath } from '../app/route'
import { useVillainStore } from '../app/villain-store-context'
import { DeleteControl } from '../components/HeroList'
import { createVillain, villainDisplayName } from './model'
import { buildVillainSheet } from './sheet'
import type { VillainList as List } from './store'

type State = { status: 'loading' } | { status: 'ready'; list: List } | { status: 'error'; message: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** `refresh` reloads the list (after an import elsewhere on the page); `onChanged` says a villain was added or deleted. */
export function VillainList({ refresh = 0, onChanged }: { refresh?: number; onChanged?: () => void } = {}) {
  const store = useVillainStore()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    let live = true
    store.list().then(
      (list) => live && setState({ status: 'ready', list }),
      (e: unknown) => live && setState({ status: 'error', message: errorText(e) }),
    )
    return () => {
      live = false
    }
  }, [store, version, refresh])

  useEffect(() => {
    if (confirming) keepRef.current?.focus()
  }, [confirming])

  const add = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const villain = createVillain()
      await store.save(villain)
      navigate(villainEditPath(villain.id, 'approach'))
    } catch (e) {
      setActionError(`Couldn't start a villain: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await store.remove(id)
      setConfirming(null)
      setVersion((v) => v + 1)
      onChanged?.()
    } catch (e) {
      setActionError(`Couldn't delete it: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const deleteControl = (id: string, label: string) => (
    <DeleteControl
      id={id}
      label={label}
      confirming={confirming === id}
      busy={busy}
      onAsk={() => setConfirming(id)}
      onKeep={() => {
        setConfirming(null)
        deleteButtons.current.get(id)?.focus()
      }}
      onDelete={() => void remove(id)}
      deleteRef={(key, el) => {
        if (el) deleteButtons.current.set(key, el)
        else deleteButtons.current.delete(key)
      }}
      keepRef={keepRef}
    />
  )

  return (
    <section className="hero-list" aria-labelledby="villain-list-title">
      <div className="hero-list__header">
        <h2 id="villain-list-title">Your villains</h2>
        <div className="button-row">
          <button type="button" className="button button--primary" disabled={busy || state.status === 'loading'} onClick={() => void add()}>
            New villain
          </button>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}
      {state.status === 'loading' && <p>Loading your villains…</p>}
      {state.status === 'error' && (
        <p role="alert" className="error">
          Couldn't load your saved villains: {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          {state.list.villains.length === 0 && state.list.unreadable.length === 0 && <p className="sheet-empty">No villains yet.</p>}
          <ul className="hero-cards">
            {state.list.villains.map((villain) => {
              const sheet = buildVillainSheet(villain)
              const kind = [sheet.approach, sheet.archetype].filter(Boolean).join(' ')
              return (
                <li key={villain.id} className="hero-card">
                  <a className="hero-card__link" href={villainPath(villain.id)}>
                    <span className="hero-card__name">{villainDisplayName(villain)}</span>
                    <span className="hero-card__meta">{kind ? `${kind}${sheet.major ? ' (major)' : ''}` : 'Not built yet'}</span>
                  </a>
                  {deleteControl(villain.id, villainDisplayName(villain))}
                </li>
              )
            })}
          </ul>
          {state.list.unreadable.length > 0 && (
            <section className="unreadable" aria-labelledby="unreadable-villains-title">
              <h3 id="unreadable-villains-title">
                {state.list.unreadable.length === 1 ? 'One saved villain' : `${state.list.unreadable.length} saved villains`} couldn't be read
              </h3>
              <ul className="hero-cards">
                {state.list.unreadable.map((u) => (
                  <li key={u.id} className="hero-card">
                    <span>
                      {u.id}: {u.error}
                    </span>
                    {deleteControl(u.id, `unreadable villain ${u.id}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  )
}
