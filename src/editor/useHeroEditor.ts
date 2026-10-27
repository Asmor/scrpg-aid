/** Loads a hero for editing and saves every change straight away (see ./useDocumentEditor.ts). */
import { useCallback } from 'react'
import { useStore } from '../app/store-context'
import type { Hero } from '../hero/model'
import type { GetResult } from '../hero/store'
import { useDocumentEditor, type Lookup } from './useDocumentEditor'

export type EditorState = { status: 'loading' } | Exclude<GetResult, { status: 'found' }> | { status: 'error'; message: string } | { status: 'ready'; hero: Hero }

export interface HeroEditor {
  state: EditorState
  /** Applies a change to a copy of the hero, shows it, and saves it. */
  update: (change: (draft: Hero) => void) => void
  /** The last save's error, if it failed. */
  saveError: string | null
  /** Resolves once every change made so far has been saved (or failed to). */
  flush: () => Promise<void>
}

export function useHeroEditor(id: string, now: () => Date = () => new Date()): HeroEditor {
  const store = useStore()
  const load = useCallback(async (heroId: string): Promise<Lookup<Hero>> => {
    const result = await store.get(heroId)
    return result.status === 'found' ? { status: 'found', doc: result.hero } : result
  }, [store])
  const save = useCallback((hero: Hero) => store.save(hero), [store])
  const { state, ...rest } = useDocumentEditor(id, load, save, now)
  return { state: state.status === 'ready' ? { status: 'ready', hero: state.doc } : state, ...rest }
}
