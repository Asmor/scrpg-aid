/**
 * Loads a hero for editing and saves every change straight away. Changes are applied to a
 * copy (the store and other views never see a half-made change), and saves run one after
 * another so an older save can't land after a newer one.
 */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../app/store-context'
import type { Hero } from '../hero/model'
import type { GetResult } from '../hero/store'

export type EditorState = { status: 'loading' } | Exclude<GetResult, { status: 'found' }> | { status: 'error'; message: string } | { status: 'ready'; hero: Hero }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface HeroEditor {
  state: EditorState
  /** Applies a change to a copy of the hero, shows it, and saves it. */
  update: (change: (draft: Hero) => void) => void
  /** The last save's error, if it failed. */
  saveError: string | null
}

export function useHeroEditor(id: string, now: () => Date = () => new Date()): HeroEditor {
  const store = useStore()
  const [state, setState] = useState<EditorState>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const latest = useRef<Hero | null>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let current = true
    store.get(id).then(
      (result) => {
        if (!current) return
        if (result.status === 'found') {
          latest.current = result.hero
          setState({ status: 'ready', hero: result.hero })
        } else {
          setState(result)
        }
      },
      (e: unknown) => current && setState({ status: 'error', message: errorText(e) }),
    )
    return () => {
      current = false
    }
  }, [store, id])

  const update = (change: (draft: Hero) => void) => {
    const base = latest.current
    if (!base) return
    const next = structuredClone(base)
    change(next)
    next.updatedAt = now().toISOString()
    latest.current = next
    setState({ status: 'ready', hero: next })
    saving.current = saving.current.then(
      () =>
        store.save(next).then(
          () => setSaveError(null),
          (e: unknown) => setSaveError(errorText(e)),
        ),
    )
  }

  return { state, update, saveError }
}
