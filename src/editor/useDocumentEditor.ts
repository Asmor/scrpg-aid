/**
 * Loads a saved document (a hero, a villain) for editing and saves every change straight
 * away. Changes are applied to a copy (the store and other views never see a half-made
 * change), and saves run one after another so an older save can't land after a newer one.
 * Leaving the editor waits for them (`flush`), and closing the page while one is running
 * asks first.
 */
import { useEffect, useRef, useState } from 'react'

/** How a store answers a lookup: found, missing, or there but unreadable. */
export type Lookup<T> = { status: 'found'; doc: T } | { status: 'missing' } | { status: 'unreadable'; error: string }

export type DocumentState<T> = { status: 'loading' } | Exclude<Lookup<T>, { status: 'found' }> | { status: 'error'; message: string } | { status: 'ready'; doc: T }

export interface DocumentEditor<T> {
  state: DocumentState<T>
  /** Applies a change to a copy of the document, shows it, and saves it. */
  update: (change: (draft: T) => void) => void
  /** The last save's error, if it failed. */
  saveError: string | null
  /** Resolves once every change made so far has been saved (or failed to). */
  flush: () => Promise<void>
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useDocumentEditor<T extends { updatedAt: string }>(
  id: string,
  load: (id: string) => Promise<Lookup<T>>,
  save: (doc: T) => Promise<void>,
  now: () => Date = () => new Date(),
): DocumentEditor<T> {
  const [state, setState] = useState<DocumentState<T>>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const latest = useRef<T | null>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)

  useEffect(() => {
    // The browser shows its own "leave site?" prompt; the message itself isn't shown.
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current > 0) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    let current = true
    load(id).then(
      (result) => {
        if (!current) return
        if (result.status === 'found') {
          latest.current = result.doc
          setState({ status: 'ready', doc: result.doc })
        } else {
          setState(result)
        }
      },
      (e: unknown) => current && setState({ status: 'error', message: errorText(e) }),
    )
    return () => {
      current = false
    }
    // Callers keep `load` stable (useCallback), so the document only reloads when the store or id changes.
  }, [id, load])

  const update = (change: (draft: T) => void) => {
    const base = latest.current
    if (!base) return
    const next = structuredClone(base)
    change(next)
    next.updatedAt = now().toISOString()
    latest.current = next
    setState({ status: 'ready', doc: next })
    pending.current++
    saving.current = saving.current
      .then(() =>
        save(next).then(
          () => setSaveError(null),
          (e: unknown) => setSaveError(errorText(e)),
        ),
      )
      .finally(() => {
        pending.current--
      })
  }

  return { state, update, saveError, flush: () => saving.current }
}
