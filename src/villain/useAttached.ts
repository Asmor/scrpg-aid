/**
 * The templates a villain comes with, loaded from the library for the wizard's preview and the
 * villain's sheet (the villain wizard spec, sections 2 and 5): each attachment with its template's line, or
 * "Missing template" once it's deleted from the library.
 */
import { useEffect, useState } from 'react'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { templateName, type LieutenantTemplate, type MinionTemplate } from '../template/model'
import { comesWithLabel, lieutenantLine, minionLine } from './attached'
import type { VillainAttachment } from './model'

export interface AttachedInfo {
  attachment: VillainAttachment
  /** Its name, or "Missing template". */
  name: string
  /** "Lieutenant · d10 · 3 abilities", "Grave Guard · d8 · Attack or Hinder" */
  line: string
  /** "Burglar minions (signature)", "Siege Crawler, d10 lieutenant (vehicle)"; "Missing template" once deleted. */
  label: string
  missing: boolean
}

/** Loads the attachments' templates again whenever the attachments or `reload` change. Null while loading, or without template stores. */
export function useAttached(attached: readonly VillainAttachment[], reload = 0): AttachedInfo[] | null {
  const stores = useOptionalTemplateStores()
  const [list, setList] = useState<AttachedInfo[] | null>(null)
  const key = JSON.stringify(attached)
  useEffect(() => {
    if (!stores) return
    let current = true
    Promise.all(
      (JSON.parse(key) as VillainAttachment[]).map(async (attachment): Promise<AttachedInfo> => {
        const result = attachment.kind === 'lieutenant' ? await stores.lieutenants.get(attachment.templateId) : await stores.minions.get(attachment.templateId)
        if (result.status !== 'found') return { attachment, name: 'Missing template', line: `This ${attachment.kind} template was deleted from the library.`, label: 'Missing template', missing: true }
        const doc = result.doc
        const line = attachment.kind === 'lieutenant' ? lieutenantLine(doc as LieutenantTemplate) : minionLine(doc as MinionTemplate)
        const name = templateName(doc, attachment.kind)
        return { attachment, name, line, label: comesWithLabel(attachment.role, name, doc.die), missing: false }
      }),
    ).then(
      (infos) => current && setList(infos),
      () => current && setList([]),
    )
    return () => {
      current = false
    }
  }, [stores, key, reload])
  return stores ? list : null
}
