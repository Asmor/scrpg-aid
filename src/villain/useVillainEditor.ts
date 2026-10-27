/** Loads a villain for editing and saves every change straight away (see ../editor/useDocumentEditor.ts). */
import { useCallback } from 'react'
import { useVillainStore } from '../app/villain-store-context'
import { useDocumentEditor, type DocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import type { Villain } from './model'

export function useVillainEditor(id: string, now: () => Date = () => new Date()): DocumentEditor<Villain> {
  const store = useVillainStore()
  const load = useCallback(async (villainId: string): Promise<Lookup<Villain>> => {
    const result = await store.get(villainId)
    return result.status === 'found' ? { status: 'found', doc: result.villain } : result
  }, [store])
  const save = useCallback((villain: Villain) => store.save(villain), [store])
  return useDocumentEditor(id, load, save, now)
}
