/** Where templates are saved: one object store per kind (../store/doc-store.ts). */
import { createDocStore, MemoryDocStore, type DocStore } from '../store/doc-store'
import type { ChallengeTemplate, EnvironmentTemplate, LieutenantTemplate, MinionTemplate } from './model'
import { challengeTemplateEnvelope, environmentTemplateEnvelope, lieutenantTemplateEnvelope, minionTemplateEnvelope } from './serialize'

export interface TemplateStores {
  minions: DocStore<MinionTemplate>
  lieutenants: DocStore<LieutenantTemplate>
  challenges: DocStore<ChallengeTemplate>
  environments: DocStore<EnvironmentTemplate>
}

/** The stores the app uses: IndexedDB when the browser has it, otherwise memory. */
export function createDefaultTemplateStores(factory: IDBFactory | undefined = globalThis.indexedDB): TemplateStores {
  return {
    minions: createDocStore('minionTemplates', minionTemplateEnvelope, factory),
    lieutenants: createDocStore('lieutenantTemplates', lieutenantTemplateEnvelope, factory),
    challenges: createDocStore('challengeTemplates', challengeTemplateEnvelope, factory),
    environments: createDocStore('environmentTemplates', environmentTemplateEnvelope, factory),
  }
}

/** In memory, for tests. */
export function memoryTemplateStores(): TemplateStores {
  return { minions: new MemoryDocStore(minionTemplateEnvelope), lieutenants: new MemoryDocStore(lieutenantTemplateEnvelope), challenges: new MemoryDocStore(challengeTemplateEnvelope), environments: new MemoryDocStore(environmentTemplateEnvelope) }
}
