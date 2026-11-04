/**
 * Loads a villain for editing and saves every change straight away (see ../editor/useDocumentEditor.ts).
 * A new villain not saved yet comes from ../app/new-villains.ts; its first change saves it.
 */
import { useCallback } from 'react'
import { useNewVillains } from '../app/new-villains'
import { useVillainStore } from '../app/villain-store-context'
import { useDocumentEditor, type DocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import type { Villain } from './model'

export function useVillainEditor(id: string, now: () => Date = () => new Date()): DocumentEditor<Villain> {
  const store = useVillainStore()
  const newVillains = useNewVillains()
  const load = useCallback(async (villainId: string): Promise<Lookup<Villain>> => {
    const result = await store.get(villainId)
    if (result.status === 'found') return { status: 'found', doc: result.villain }
    const fresh = result.status === 'missing' ? newVillains.get(villainId) : undefined
    return fresh ? { status: 'found', doc: fresh, unsaved: true } : result
  }, [store, newVillains])
  const save = useCallback(async (villain: Villain) => {
    await store.save(villain)
    newVillains.remove(villain.id)
  }, [store, newVillains])
  return useDocumentEditor(id, load, save, now)
}
