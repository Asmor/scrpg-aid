import { describe, expect, it } from 'vitest'
import { createLieutenantTemplate, createMinionTemplate } from '../template/model'
import { adaptiveBruiser } from '../test/villains'
import { attachedAs, lieutenantLine, minionLine, setAttached, vehicleName, vehicleTemplate } from './attached'

const now = new Date('2026-11-04T12:00:00Z')

describe('a villain’s attached templates', () => {
  it('keeps at most one per role', () => {
    const v = adaptiveBruiser()
    setAttached(v, 'signature', 'm1')
    setAttached(v, 'vehicle', 'l1')
    setAttached(v, 'signature', 'm2')
    expect(v.attached).toEqual([
      { templateId: 'l1', kind: 'lieutenant', role: 'vehicle' },
      { templateId: 'm2', kind: 'minion', role: 'signature' },
    ])
    expect(attachedAs(v, 'vehicle')?.templateId).toBe('l1')
    setAttached(v, 'vehicle', undefined)
    expect(attachedAs(v, 'vehicle')).toBeUndefined()
  })
})

describe('the vehicle as a lieutenant template', () => {
  it('is built from the wizard’s name, die and abilities, with the villain’s tags', () => {
    const v = adaptiveBruiser()
    v.tags = ['docks']
    expect(vehicleTemplate(v, undefined, now)).toBeUndefined()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { abilities: [] } }]
    expect(vehicleTemplate(v, undefined, now)).toBeUndefined()
    v.upgrades[0]!.vehicle = { die: 'd10', abilities: [{ source: 'vehicle', name: 'Sturdy' }, { source: 'vehicle', name: 'Reliable', blanks: { 'basic action': 'Attack' } }] }
    expect(vehicleName(v)).toBe("Ironclad's vehicle")
    const t = vehicleTemplate(v, undefined, now)!
    expect(t).toMatchObject({ name: "Ironclad's vehicle", die: 'd10', groupSize: 1, actions: 'any', tags: ['docks'] })
    expect(t.abilities).toEqual([
      { name: 'Sturdy', type: 'I', text: 'When rolling a damage save, add 2 to the result.' },
      { name: 'Reliable', type: 'I', text: expect.stringContaining('uses a Attack on its turn') },
    ])
    expect(lieutenantLine(t)).toBe('Lieutenant · d10 · 2 abilities')
  })

  it('updates an existing template, keeping what the GM changed in the library', () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { name: 'Siege Crawler', die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }] } }]
    const existing = { ...createLieutenantTemplate({ id: 'l1', now }), name: 'Old', notes: 'Rusty', tags: ['prep'], groupSize: 2 }
    expect(vehicleTemplate(v, existing, now)).toMatchObject({ id: 'l1', name: 'Siege Crawler', die: 'd12', notes: 'Rusty', tags: ['prep'], groupSize: 2 })
  })
})

describe('the signature-minion picker’s line', () => {
  it('names the template, its die and what it does', () => {
    const t = { ...createMinionTemplate({ now }), name: 'Grave Guard', die: 'd8' as const, actions: ['attack' as const, 'hinder' as const] }
    expect(minionLine(t)).toBe('Grave Guard · d8 · Attack or Hinder')
    expect(minionLine({ ...t, name: 'Burglar', actions: 'any', groupSize: 4 })).toBe('Burglar · d8 · groups of 4')
  })
})
