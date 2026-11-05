/**
 * The library as the game table reads it: every hero, villain and template ready to play (drafts
 * aren't), and the saved searches, for Bring in and for planning a scene.
 */
import { useEffect, useState } from 'react'
import { useOptionalSavedSearchStore } from '../app/saved-search-context'
import { useStore } from '../app/store-context'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { useVillainStore } from '../app/villain-store-context'
import { isDraft } from '../hero/model'
import { heroType, toItem, villainType, type LibraryItem, type LibraryStores } from '../library/registry'
import type { SavedSearch } from '../library/saved-searches'
import { TEMPLATE_TYPES } from '../library/template-types'
import type { EnvironmentTemplate, LieutenantTemplate, MinionTemplate } from '../template/model'
import type { TemplateStores } from '../template/store'
import { isVillainDraft } from '../villain/model'
import type { FoundAttached } from './environment'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useLibraryItems(): { items: LibraryItem[] | null; searches: SavedSearch[]; error: string | null } {
  const heroes = useStore()
  const villains = useVillainStore()
  const searchStore = useOptionalSavedSearchStore()
  const templates = useOptionalTemplateStores()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    // The template types only read their own stores.
    const stores = { heroes, villains, ...(templates ? { templates } : {}) } as unknown as LibraryStores
    Promise.all([heroes.list(), villains.list(), searchStore ? searchStore.list() : Promise.resolve({ searches: [] as SavedSearch[] }), Promise.all(TEMPLATE_TYPES.map(async (t) => ({ t, list: await t.list(stores) })))]).then(
      ([h, v, s, lists]) => {
        if (!current) return
        // Drafts aren't ready to play.
        setItems([...h.heroes.filter((x) => !isDraft(x)).map((x) => toItem(heroType as never, x)), ...v.villains.filter((x) => !isVillainDraft(x)).map((x) => toItem(villainType as never, x)), ...lists.flatMap(({ t, list }) => list.docs.map((d) => toItem(t, d)))])
        setSearches(s.searches)
      },
      (e: unknown) => current && setError(errorText(e)),
    )
    return () => {
      current = false
    }
  }, [heroes, villains, searchStore, templates])
  return { items, searches, error }
}

/** An environment template's attached templates, as the library has them now (a deleted one is left out). */
export async function foundAttached(t: EnvironmentTemplate, templates: TemplateStores | null | undefined): Promise<FoundAttached[]> {
  const found: FoundAttached[] = []
  for (const a of t.attached) {
    if (a.kind === 'challenge') {
      const result = await templates?.challenges.get(a.templateId).catch(() => undefined)
      if (result?.status === 'found') found.push({ kind: 'challenge', doc: result.doc })
      continue
    }
    const store = a.kind === 'minion' ? templates?.minions : templates?.lieutenants
    const result = await store?.get(a.templateId).catch(() => undefined)
    if (result?.status === 'found') found.push(a.kind === 'minion' ? { kind: 'minion', doc: result.doc as MinionTemplate } : { kind: 'lieutenant', doc: result.doc as LieutenantTemplate })
  }
  return found
}
