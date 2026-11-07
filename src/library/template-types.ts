/**
 * The NPC templates as library types (scrpg-aid-designs/npcs/spec.md, section 2): minions,
 * lieutenants, challenges and environments. They hold no play state, so they have no primary action, and the
 * In games column lists games holding something made from them.
 */
import { appearanceOf } from '../colors/palette'
import { templatePath } from '../app/route'
import { actionsText } from '../game/npc'
import type { DocStore } from '../store/doc-store'
import { createChallengeTemplate, createEnvironmentTemplate, createLieutenantTemplate, createMinionTemplate, duplicateTemplate, templateName, type ChallengeTemplate, type EnvironmentTemplate, type LieutenantTemplate, type MinionTemplate, type TemplateBase } from '../template/model'
import { challengeTemplateEnvelope, environmentTemplateEnvelope, lieutenantTemplateEnvelope, minionTemplateEnvelope, templateJson, type TemplateKind } from '../template/serialize'
import type { TemplateStores } from '../template/store'
import type { DocEnvelope } from '../store/doc-store'
import type { LibraryStores, LibraryType, RowInfo } from './registry'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "burglar.json": a template's single-item export name. */
const fileName = (doc: { name: string }, kind: TemplateKind) => `${(doc.name.trim() || `unnamed-${kind}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || kind}-${kind}.json`

interface TemplateTypeSpec<D> {
  kind: TemplateKind
  label: string
  plural: string
  backupKey: 'minionTemplates' | 'lieutenantTemplates' | 'challengeTemplates' | 'environmentTemplates'
  store: (stores: TemplateStores) => DocStore<D>
  envelope: DocEnvelope<D>
  create: () => D
  details: (doc: D) => Pick<RowInfo, 'details' | 'kind'>
}

function templateType<D extends TemplateBase>(spec: TemplateTypeSpec<D>): LibraryType<D> {
  return {
    key: spec.kind,
    label: spec.label,
    plural: spec.plural,
    backupKey: spec.backupKey,
    inGames: spec.kind,
    list: async (stores: LibraryStores) => (stores.templates ? spec.store(stores.templates).list() : { docs: [], unreadable: [] }),
    save: async (stores, doc) => {
      if (!stores.templates) throw new Error('templates can’t be saved here')
      await spec.store(stores.templates).save(doc)
    },
    remove: async (stores, id) => {
      if (stores.templates) await spec.store(stores.templates).remove(id)
    },
    row(doc) {
      const href = templatePath(spec.kind, doc.id)
      return { colors: appearanceOf(spec.kind === 'environment' ? { kind: 'environment', color: doc.color } : spec.kind === 'challenge' ? { kind: 'challenge', color: doc.color } : { kind: 'group', color: doc.color }), name: templateName(doc, spec.kind), named: Boolean(doc.name.trim()), draft: false, ...spec.details(doc), openHref: href, editHref: href }
    },
    duplicate: (doc) => duplicateTemplate(doc),
    exportFile: (doc) => ({ name: fileName(doc, spec.kind), text: templateJson(spec.envelope, doc) }),
    async create({ stores }) {
      if (!stores.templates) throw new Error('templates can’t be saved here')
      const doc = spec.create()
      await spec.store(stores.templates).save(doc)
      return templatePath(spec.kind, doc.id)
    },
  }
}

export const minionTemplateType = templateType<MinionTemplate>({
  kind: 'minion',
  label: 'Minion',
  plural: 'Minions',
  backupKey: 'minionTemplates',
  store: (s) => s.minions,
  envelope: minionTemplateEnvelope,
  create: () => createMinionTemplate(),
  // "Minion (d8)", then "Attack or Hinder · groups of 4"
  details: (m) => ({ kind: m.die, details: `${actionsText(m)} · groups of ${m.groupSize}` }),
})

export const lieutenantTemplateType = templateType<LieutenantTemplate>({
  kind: 'lieutenant',
  label: 'Lieutenant',
  plural: 'Lieutenants',
  backupKey: 'lieutenantTemplates',
  store: (s) => s.lieutenants,
  envelope: lieutenantTemplateEnvelope,
  create: () => createLieutenantTemplate(),
  // "Lieutenant (d10)", then "2 abilities"
  details: (l) => ({ kind: l.die, details: plural(l.abilities.length, 'ability', 'abilities') }),
})

export const challengeTemplateType = templateType<ChallengeTemplate>({
  kind: 'challenge',
  label: 'Challenge',
  plural: 'Challenges',
  backupKey: 'challengeTemplates',
  store: (s) => s.challenges,
  envelope: challengeTemplateEnvelope,
  create: () => createChallengeTemplate(),
  // "3 steps"
  details: (c) => ({ details: plural(c.steps.length, 'step') }),
})

export const environmentTemplateType = templateType<EnvironmentTemplate>({
  kind: 'environment',
  label: 'Environment',
  plural: 'Environments',
  backupKey: 'environmentTemplates',
  store: (s) => s.environments,
  envelope: environmentTemplateEnvelope,
  create: () => createEnvironmentTemplate(),
  // "3 aspects · 6 twists · 2 attached"
  details: (e) => ({ details: [plural(e.aspects.length, 'aspect'), plural(e.twists.length, 'twist'), `${e.attached.length} attached`].join(' · ') }),
})

export const TEMPLATE_TYPES: readonly LibraryType[] = [minionTemplateType, lieutenantTemplateType, challengeTemplateType, environmentTemplateType] as unknown as LibraryType[]
