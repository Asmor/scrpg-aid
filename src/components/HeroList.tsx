/** The saved heroes: open, create, or delete one, or add the example hero. */
import { useEffect, useRef, useState, type Ref } from 'react'
import { heroPath, navigate } from '../app/route'
import { useStore } from '../app/store-context'
import { archetypeName } from '../creation/layers'
import { exampleHero } from '../hero/example'
import { createHero, heroDisplayName, type Hero } from '../hero/model'
import type { HeroList as Heroes } from '../hero/store'

type State = { status: 'loading' } | { status: 'ready'; list: Heroes } | { status: 'error'; message: string }

/** Where keyboard focus goes after the delete confirmation opens or closes. */
type Focus = { to: 'keep' } | { to: 'delete'; id: string } | { to: 'heading' }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface DeleteControlProps {
  id: string
  /** Names what's deleted, for screen readers: "Maya Reyes", or "unreadable record abc". */
  label: string
  confirming: boolean
  busy: boolean
  onAsk: () => void
  onKeep: () => void
  onDelete: () => void
  deleteRef: (id: string, el: HTMLButtonElement | null) => void
  keepRef: Ref<HTMLButtonElement>
}

/** A Delete button that turns into an inline "Delete? Yes, delete / Keep" confirmation. */
function DeleteControl({ id, label, confirming, busy, onAsk, onKeep, onDelete, deleteRef, keepRef }: DeleteControlProps) {
  if (!confirming) {
    return (
      <button type="button" className="button" ref={(el) => deleteRef(id, el)} onClick={onAsk} aria-label={`Delete ${label}`}>
        Delete
      </button>
    )
  }
  return (
    <span className="button-row" role="group" aria-label={`Delete ${label}?`}>
      <span aria-hidden="true">Delete?</span>
      <button type="button" className="button button--danger" disabled={busy} onClick={onDelete}>
        Yes, delete
      </button>
      <button type="button" className="button" ref={keepRef} onClick={onKeep}>
        Keep
      </button>
    </span>
  )
}

export function HeroList() {
  const store = useStore()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped to reload the list after a change.
  const [version, setVersion] = useState(0)
  // Applied (and cleared) after the next render that has its target.
  const pendingFocus = useRef<Focus | null>(null)
  const setFocus = (focus: Focus) => {
    pendingFocus.current = focus
  }

  const headingRef = useRef<HTMLHeadingElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>())
  const deleteRef = (id: string, el: HTMLButtonElement | null) => {
    if (el) deleteButtons.current.set(id, el)
    else deleteButtons.current.delete(id)
  }

  useEffect(() => {
    let current = true
    store.list().then(
      (list) => current && setState({ status: 'ready', list }),
      (e: unknown) => current && setState({ status: 'error', message: errorText(e) }),
    )
    return () => {
      current = false
    }
  }, [store, version])

  // Keeps keyboard focus in place as the confirmation opens and closes (and after the list reloads).
  useEffect(() => {
    const focus = pendingFocus.current
    if (!focus) return
    const target = focus.to === 'keep' ? keepRef.current : focus.to === 'delete' ? deleteButtons.current.get(focus.id) : headingRef.current
    if (target) {
      target.focus()
      pendingFocus.current = null
    }
  })

  const add = async (hero: Hero) => {
    setBusy(true)
    setActionError(null)
    try {
      await store.save(hero)
      navigate(heroPath(hero.id))
    } catch (e) {
      setActionError(`Couldn't save the hero: ${errorText(e)}`)
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
      setFocus({ to: 'heading' })
      setVersion((v) => v + 1)
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
      onAsk={() => {
        setConfirming(id)
        setFocus({ to: 'keep' })
      }}
      onKeep={() => {
        setConfirming(null)
        setFocus({ to: 'delete', id })
      }}
      onDelete={() => void remove(id)}
      deleteRef={deleteRef}
      keepRef={keepRef}
    />
  )

  const loading = state.status === 'loading'
  return (
    <section className="hero-list" aria-labelledby="hero-list-title">
      <div className="hero-list__header">
        <h2 id="hero-list-title" ref={headingRef} tabIndex={-1}>
          Your heroes
        </h2>
        <div className="button-row">
          <button type="button" className="button button--primary" disabled={busy || loading} onClick={() => void add(createHero('guided'))}>
            New hero
          </button>
          <button type="button" className="button" disabled={busy || loading} onClick={() => void add(exampleHero())}>
            Add example hero
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}
      {loading && <p>Loading your heroes…</p>}
      {state.status === 'error' && (
        <p role="alert" className="error">
          Couldn't load your saved heroes: {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          {state.list.heroes.length === 0 && state.list.unreadable.length === 0 && (
            <p className="sheet-empty">No heroes yet. Start a new one, or add the example hero to see a finished sheet.</p>
          )}
          <ul className="hero-cards">
            {state.list.heroes.map((hero) => (
              <li key={hero.id} className="hero-card">
                <a className="hero-card__link" href={heroPath(hero.id)}>
                  <span className="hero-card__name">{heroDisplayName(hero)}</span>
                  <span className="hero-card__meta">{archetypeName(hero) ?? 'No archetype yet'}</span>
                </a>
                {deleteControl(hero.id, heroDisplayName(hero))}
              </li>
            ))}
          </ul>
          {state.list.unreadable.length > 0 && (
            <section className="unreadable" aria-labelledby="unreadable-title">
              <h3 id="unreadable-title">
                {state.list.unreadable.length === 1 ? 'One saved hero' : `${state.list.unreadable.length} saved heroes`} couldn't be read
              </h3>
              <p>They may have been saved by a newer version of the app. Deleting one can't be undone.</p>
              <ul className="hero-cards">
                {state.list.unreadable.map((u) => (
                  <li key={u.id} className="hero-card">
                    <span>
                      {u.id}: {u.error}
                    </span>
                    {deleteControl(u.id, `unreadable record ${u.id}`)}
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
