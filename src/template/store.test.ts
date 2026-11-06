import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { IndexedDbHeroStore } from '../hero/store'
import { createHero } from '../hero/model'
import { IndexedDbDocStore } from '../store/doc-store'
import { createChallengeTemplate, createEnvironmentTemplate, createLieutenantTemplate, createMinionTemplate, createTwist, duplicateTemplate, templateName, type EnvironmentTemplate, type MinionTemplate } from './model'
import { challengeTemplateEnvelope, environmentTemplateEnvelope, lieutenantTemplateEnvelope, minionTemplateEnvelope, templateJson } from './serialize'
import { createDefaultTemplateStores, memoryTemplateStores } from './store'

const now = new Date('2026-11-03T12:00:00Z')
const minion = (id: string, updatedAt: string): MinionTemplate => ({ ...createMinionTemplate({ id, now }), updatedAt })

describe('new templates', () => {
  it('start with the defaults for their kind', () => {
    expect(createMinionTemplate({ id: 'm', now })).toEqual({ id: 'm', createdAt: now.toISOString(), updatedAt: now.toISOString(), tags: [], name: '', die: 'd6', groupSize: 4, actions: 'any', notes: '' })
    expect(createLieutenantTemplate({ id: 'l', now })).toMatchObject({ die: 'd8', groupSize: 2, abilities: [] })
    expect(createChallengeTemplate({ id: 'c', now }).steps).toEqual([{ label: '' }, { label: '' }, { label: '' }])
    expect(createEnvironmentTemplate({ id: 'e', now })).toMatchObject({ description: '', aspects: [{ name: '', die: 'd8' }, { name: '', die: 'd8' }, { name: '', die: 'd8' }], twists: [], attached: [] })
    expect(createTwist('red')).toMatchObject({ zone: 'red', kind: 'minor', text: '' })
    expect(templateName({ name: '' }, 'environment')).toBe('Unnamed environment')
  })

  it('duplicate with a new id and "(copy)", keeping tags', () => {
    const copy = duplicateTemplate({ ...createMinionTemplate({ id: 'm', now }), name: 'Burglar', tags: ['heist'] }, { id: 'm2', now })
    expect(copy).toMatchObject({ id: 'm2', name: 'Burglar (copy)', tags: ['heist'] })
    expect(templateName({ name: ' ' }, 'lieutenant')).toBe('Unnamed lieutenant')
  })
})

describe('saved templates', () => {
  it('round-trip through their envelopes, each kind only as itself', () => {
    const l = { ...createLieutenantTemplate({ id: 'l', now }), name: 'Static Choir', abilities: [{ name: 'Harmonize', type: 'A' as const, text: 'Boost another lieutenant.' }] }
    const json = JSON.parse(templateJson(lieutenantTemplateEnvelope, l))
    expect(lieutenantTemplateEnvelope.parse(json)).toEqual({ ok: true, doc: l })
    expect(minionTemplateEnvelope.parse(json)).toEqual({ ok: false, error: 'not a saved minion' })
  })

  it('turn away malformed ones', () => {
    const bad = (doc: object) => minionTemplateEnvelope.parse(minionTemplateEnvelope.toSaved({ ...createMinionTemplate({ id: 'm', now }), ...doc } as MinionTemplate)).ok
    expect(bad({})).toBe(true)
    expect(bad({ groupSize: 0 })).toBe(false)
    expect(bad({ groupSize: 21 })).toBe(false)
    expect(bad({ actions: ['attack', 'dance'] })).toBe(false)
    expect(bad({ die: 'd20' })).toBe(false)
    const tooMany = { ...createChallengeTemplate({ id: 'c', now }), steps: Array.from({ length: 11 }, () => ({ label: '' })) }
    expect(challengeTemplateEnvelope.parse(challengeTemplateEnvelope.toSaved(tooMany)).ok).toBe(false)
    const badAbility = { ...createLieutenantTemplate({ id: 'l', now }), abilities: [{ name: 'x', type: 'Z', text: '' }] }
    expect(lieutenantTemplateEnvelope.parse({ format: 'scrpg-lieutenant-template', version: 1, lieutenant: badAbility }).ok).toBe(false)
    expect(minionTemplateEnvelope.parse({ format: 'scrpg-minion-template', version: 2, minion: createMinionTemplate() })).toEqual({ ok: false, error: 'saved by a newer version of the app (format 2)' })
  })

  it('keep an environment’s aspects, twists and attached templates, and turn away bad ones', () => {
    const e: EnvironmentTemplate = {
      ...createEnvironmentTemplate({ id: 'e', now }),
      name: 'Rooftop Heist',
      aspects: [{ name: 'Slick Tiles', die: 'd10' }, { name: 'Howling Wind', die: 'd6' }, { name: 'Night Security', die: 'd8' }],
      twists: [{ id: 't1', zone: 'green', kind: 'minor', name: 'Loose gear', text: 'Something slides toward the edge.' }, { id: 't2', zone: 'red', kind: 'major', text: 'The roof gives way.' }],
      attached: [{ kind: 'minion', templateId: 'm' }],
    }
    expect(environmentTemplateEnvelope.parse(JSON.parse(templateJson(environmentTemplateEnvelope, e)))).toEqual({ ok: true, doc: e })
    const ok = (doc: object) => environmentTemplateEnvelope.parse(environmentTemplateEnvelope.toSaved({ ...e, ...doc } as EnvironmentTemplate)).ok
    expect(ok({ aspects: e.aspects.slice(0, 2) })).toBe(false)
    expect(ok({ twists: [{ id: 't', zone: 'blue', kind: 'minor', text: '' }] })).toBe(false)
    expect(ok({ twists: Array.from({ length: 61 }, (_, i) => ({ id: `t${i}`, zone: 'green', kind: 'minor', text: '' })) })).toBe(false)
    expect(ok({ attached: [{ kind: 'villain', templateId: 'v' }] })).toBe(false)
    expect(ok({ attached: Array.from({ length: 21 }, () => ({ kind: 'minion', templateId: 'm' })) })).toBe(false)
  })
})

describe('a template store in IndexedDB', () => {
  it('saves, lists newest first, gets, and removes', async () => {
    const store = new IndexedDbDocStore<MinionTemplate>(new IDBFactory(), 'minionTemplates', minionTemplateEnvelope)
    await store.save(minion('a', '2026-01-01T00:00:00Z'))
    await store.save(minion('b', '2026-02-01T00:00:00Z'))
    expect((await store.list()).docs.map((m) => m.id)).toEqual(['b', 'a'])
    expect(await store.get('a')).toMatchObject({ status: 'found', doc: { id: 'a' } })
    await store.remove('a')
    expect(await store.get('a')).toEqual({ status: 'missing' })
  })
})

describe('the template stores', () => {
  it('keep each kind apart, next to heroes in the same database', async () => {
    const factory = new IDBFactory()
    const stores = createDefaultTemplateStores(factory)
    await stores.minions.save(minion('m', '2026-01-01T00:00:00Z'))
    await stores.challenges.save(createChallengeTemplate({ id: 'c', now }))
    await stores.environments.save(createEnvironmentTemplate({ id: 'e', now }))
    await new IndexedDbHeroStore(factory).save(createHero('guided', { id: 'h' }))
    expect((await stores.minions.list()).docs.map((d) => d.id)).toEqual(['m'])
    expect((await stores.lieutenants.list()).docs).toEqual([])
    expect((await stores.challenges.list()).docs.map((d) => d.id)).toEqual(['c'])
    expect((await stores.environments.list()).docs.map((d) => d.id)).toEqual(['e'])
    expect((await new IndexedDbHeroStore(factory).list()).heroes.map((h) => h.id)).toEqual(['h'])
  })

  it('report a record that can’t be read', async () => {
    const stores = memoryTemplateStores()
    await (stores.minions as unknown as { putRecord: (r: object) => Promise<void> }).putRecord({ id: 'x', saved: { format: 'nope' } })
    expect((await stores.minions.list()).unreadable).toEqual([{ id: 'x', error: 'not a saved minion' }])
    expect(await stores.minions.get('x')).toEqual({ status: 'unreadable', error: 'not a saved minion' })
  })
})
