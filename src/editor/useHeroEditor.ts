/**
 * Loads a hero for editing and saves every change straight away (see ./useDocumentEditor.ts).
 * A new hero not saved yet comes from ../app/new-heroes.ts; its first change saves it.
 */
import { useCallback } from 'react'
import { useNewHeroes } from '../app/new-heroes'
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
  /** Resolves once every change made so far has been saved (or failed to): true if the last save worked. */
  flush: () => Promise<boolean>
  /** When the last save landed in this visit, if one has. */
  savedAt: Date | null
  /** False for a new hero until its first change saves it. */
  stored: boolean
}

export function useHeroEditor(id: string, now: () => Date = () => new Date()): HeroEditor {
  const store = useStore()
  const newHeroes = useNewHeroes()
  const load = useCallback(async (heroId: string): Promise<Lookup<Hero>> => {
    const result = await store.get(heroId)
    if (result.status === 'found') return { status: 'found', doc: result.hero }
    const fresh = result.status === 'missing' ? newHeroes.get(heroId) : undefined
    return fresh ? { status: 'found', doc: fresh, unsaved: true } : result
  }, [store, newHeroes])
  const save = useCallback(async (hero: Hero) => {
    await store.save(hero)
    newHeroes.remove(hero.id)
  }, [store, newHeroes])
  const { state, ...rest } = useDocumentEditor(id, load, save, now)
  return { state: state.status === 'ready' ? { status: 'ready', hero: state.doc } : state, ...rest }
}
