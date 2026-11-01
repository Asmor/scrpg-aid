/**
 * The heroes or villains on a game's table: their own documents, loaded by id and saved as the
 * table changes them (the table works on the documents themselves). Like
 * ../editor/useDocumentEditor.ts, but for several documents of one store: changes apply to the
 * latest copy, and saves run one after another so an older save can't land after a newer one.
 */
import { useEffect, useRef, useState } from 'react'
import type { Lookup } from '../editor/useDocumentEditor'

export type DocEntry<T> = { status: 'loading' } | { status: 'ready'; doc: T } | { status: 'missing' } | { status: 'unreadable'; error: string } | { status: 'error'; message: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface DocMap<T> {
  /** Each id's document, or why it isn't there. Ids not asked for yet are absent. */
  entries: ReadonlyMap<string, DocEntry<T>>
  /** The latest copy of a loaded document. */
  get: (id: string) => T | undefined
  /** Applies a change to the latest copy and saves it; returns the document before and after (unchanged: undefined). */
  update: (id: string, change: (doc: T) => T) => { before: T; after: T } | undefined
  saveError: string | null
}

export function useDocMap<T extends { updatedAt: string }>(ids: readonly string[], load: (id: string) => Promise<Lookup<T>>, save: (doc: T) => Promise<void>, now: () => Date = () => new Date()): DocMap<T> {
  const [entries, setEntries] = useState<ReadonlyMap<string, DocEntry<T>>>(new Map())
  const [saveError, setSaveError] = useState<string | null>(null)
  const latest = useRef(new Map<string, T>())
  const asked = useRef(new Set<string>())
  const saving = useRef<Promise<void>>(Promise.resolve())
  const key = [...new Set(ids)].sort().join('\n')

  useEffect(() => {
    // Each id is loaded once; one removed from the table and brought back keeps its latest copy.
    for (const id of key ? key.split('\n') : []) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      setEntries((m) => new Map(m).set(id, { status: 'loading' }))
      load(id).then(
        (result) => {
          if (result.status === 'found') latest.current.set(id, result.doc)
          setEntries((m) => new Map(m).set(id, result.status === 'found' ? { status: 'ready', doc: result.doc } : result))
        },
        (e: unknown) => setEntries((m) => new Map(m).set(id, { status: 'error', message: errorText(e) })),
      )
    }
  }, [key, load])

  const update = (id: string, change: (doc: T) => T) => {
    const before = latest.current.get(id)
    if (!before) return undefined
    const changed = change(before)
    if (changed === before) return undefined
    const after = { ...changed, updatedAt: now().toISOString() }
    latest.current.set(id, after)
    setEntries((m) => new Map(m).set(id, { status: 'ready', doc: after }))
    saving.current = saving.current.then(() =>
      save(after).then(
        () => setSaveError(null),
        (e: unknown) => setSaveError(errorText(e)),
      ),
    )
    return { before, after }
  }

  return { entries, get: (id) => latest.current.get(id), update, saveError }
}
