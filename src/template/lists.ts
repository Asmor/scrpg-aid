/**
 * The template kinds as lists, for backups, exports, imports and Send (../transfer/files.ts):
 * each kind's list key in a backup file, its envelope and store, and its words.
 */
import type { DocEnvelope, DocStore } from '../store/doc-store'
import type { ChallengeTemplate, EnvironmentTemplate, LieutenantTemplate, MinionTemplate, TemplateBase } from './model'
import { challengeTemplateEnvelope, environmentTemplateEnvelope, lieutenantTemplateEnvelope, minionTemplateEnvelope, type TemplateKind } from './serialize'
import type { TemplateStores } from './store'

export interface TemplateLists {
  minionTemplates: MinionTemplate[]
  lieutenantTemplates: LieutenantTemplate[]
  challengeTemplates: ChallengeTemplate[]
  environmentTemplates: EnvironmentTemplate[]
}

export type TemplateListKey = keyof TemplateLists

export const TEMPLATE_LIST_KEYS: readonly TemplateListKey[] = ['minionTemplates', 'lieutenantTemplates', 'challengeTemplates', 'environmentTemplates']

export interface TemplateListInfo {
  kind: TemplateKind
  envelope: DocEnvelope<TemplateBase>
  store: (stores: TemplateStores) => DocStore<TemplateBase>
  /** "minion", "minions". */
  one: string
  many: string
}

export const TEMPLATE_LIST_INFO: Record<TemplateListKey, TemplateListInfo> = {
  minionTemplates: { kind: 'minion', envelope: minionTemplateEnvelope as unknown as DocEnvelope<TemplateBase>, store: (s) => s.minions as unknown as DocStore<TemplateBase>, one: 'minion', many: 'minions' },
  lieutenantTemplates: { kind: 'lieutenant', envelope: lieutenantTemplateEnvelope as unknown as DocEnvelope<TemplateBase>, store: (s) => s.lieutenants as unknown as DocStore<TemplateBase>, one: 'lieutenant', many: 'lieutenants' },
  challengeTemplates: { kind: 'challenge', envelope: challengeTemplateEnvelope as unknown as DocEnvelope<TemplateBase>, store: (s) => s.challenges as unknown as DocStore<TemplateBase>, one: 'challenge', many: 'challenges' },
  environmentTemplates: { kind: 'environment', envelope: environmentTemplateEnvelope as unknown as DocEnvelope<TemplateBase>, store: (s) => s.environments as unknown as DocStore<TemplateBase>, one: 'environment', many: 'environments' },
}

export const emptyTemplateLists = (): TemplateLists => ({ minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] })

/** How many templates in all. */
export const templateCount = (lists: TemplateLists) => TEMPLATE_LIST_KEYS.reduce((n, k) => n + lists[k].length, 0)

/** The list key for a kind. */
export const listKeyOf = (kind: TemplateKind): TemplateListKey => TEMPLATE_LIST_KEYS.find((k) => TEMPLATE_LIST_INFO[k].kind === kind)!
