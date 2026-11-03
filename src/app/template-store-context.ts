/** Gives components the NPC templates' stores (docs/design/npcs/spec.md, section 2), so tests can pass in-memory ones. */
import { createContext, useContext } from 'react'
import type { TemplateStores } from '../template/store'

export const TemplateStoresContext = createContext<TemplateStores | null>(null)

export function useTemplateStores(): TemplateStores {
  const stores = useContext(TemplateStoresContext)
  if (!stores) throw new Error('useTemplateStores needs a TemplateStoresContext provider')
  return stores
}

/** The templates' stores if there are any (pages rendered on their own in tests have none). */
export function useOptionalTemplateStores(): TemplateStores | null {
  return useContext(TemplateStoresContext)
}
