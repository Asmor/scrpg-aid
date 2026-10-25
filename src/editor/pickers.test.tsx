import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { expandRefs, type TraitRef } from '../rules/catalog'
import type { AbilityPick, PrincipleChoice, TraitAssignment } from '../hero/model'
import type { Ability, Bonus } from '../rules/types'
import { archetypesById, powerSourcesById } from '../rules/data'
import { deriveTraits, type HeroTrait } from '../creation/traits'
import { A, P, Q, validHero } from '../test/heroes'
import { describeOptions } from '../components/format'
import { DiceAssigner } from './DiceAssigner'
import { PrinciplePicker } from './PrinciplePicker'
import { AbilityPicker } from './AbilityPicker'
import { BonusPicker } from './BonusPicker'
import { TablePicker } from './TablePicker'

function Assigner({ initial, earlierHero = false, earlier, canSwap }: { initial: TraitAssignment[]; earlierHero?: boolean; earlier?: HeroTrait[]; canSwap?: (t: TraitRef) => boolean }) {
  const [assignments, setAssignments] = useState(initial)
  const hero = validHero()
  return (
    <>
      <DiceAssigner
        hero={hero}
        legend="Archetype powers"
        dice={['d12', 'd6']}
        assignments={assignments}
        options={expandRefs([{ power: 'speed' }, { powerCategory: 'mobility' }])}
        earlier={earlier ?? (earlierHero ? deriveTraits(hero).traits.filter((t) => t.step !== 'archetype') : [])}
        canSwap={canSwap}
        onChange={setAssignments}
      />
      <output>{JSON.stringify(assignments)}</output>
    </>
  )
}

describe('DiceAssigner', () => {
  it('assigns one trait per die, grouped by category', async () => {
    render(<Assigner initial={[]} />)
    expect(screen.getByRole('group', { name: 'Archetype powers' })).toBeInTheDocument()
    const d12 = screen.getByRole('combobox', { name: 'd12' })
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('label')).filter(Boolean)).toContain('Mobility powers')
    await userEvent.selectOptions(d12, 'Speed')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd6' }), 'Flight')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual([A(P('speed'), 'd12'), A(P('flight'), 'd6')])
    await userEvent.selectOptions(d12, '')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual([A(P('flight'), 'd6')])
  })

  it('keeps an off-list choice visible, and offers upgrading a trait from an earlier step', async () => {
    render(<Assigner initial={[A(Q('fitness'), 'd12'), A(P('agility'), 'd6')]} earlierHero />)
    expect(screen.getByRole('option', { name: 'Fitness (not on this list)' })).toBeInTheDocument()
    // Agility d10 came from the power source; this d6 could upgrade it (and the checks will say a d6 isn't bigger).
    const upgrade = screen.getByRole('checkbox', { name: 'Upgrade my Agility (d10)' })
    await userEvent.click(upgrade)
    expect(JSON.parse(screen.getByRole('status').textContent!)).toContainEqual({ trait: P('agility'), die: 'd6', upgrades: true })
  })

  it('offers swapping instead of upgrading for a trait that allows it', async () => {
    render(<Assigner initial={[A(P('speed'), 'd6')]} earlier={[held(P('speed'), 'd8', 'Speed')]} canSwap={(t) => t.id === 'speed'} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Swap this die onto my Speed (d8)' }))
    expect(screen.getByRole('combobox', { name: "d8 (was Speed's)" })).toBeInTheDocument()
  })

  it('adds a row for the die an upgrade frees, and takes it away when the upgrade is undone', async () => {
    render(<Assigner initial={[]} earlier={[held(P('speed'), 'd8', 'Speed')]} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd12' }), 'Speed')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Upgrade my Speed (d8)' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: "d8 (was Speed's)" }), 'Flight')
    expect(output()).toEqual([{ trait: P('speed'), die: 'd12', upgrades: true }, A(P('flight'), 'd8')])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Upgrade my Speed (d8)' }))
    expect(screen.queryByRole('combobox', { name: "d8 (was Speed's)" })).not.toBeInTheDocument()
    expect(output()).toEqual([A(P('speed'), 'd12')])
  })
})

function Principle({ category = 'esoteric', initial }: { category?: 'esoteric' | null; initial?: PrincipleChoice }) {
  const [choice, setChoice] = useState(initial)
  return (
    <>
      <PrinciplePicker category={category ?? undefined} choice={choice} onChange={setChoice} />
      <output>{JSON.stringify(choice ?? null)}</output>
    </>
  )
}

describe('PrinciplePicker', () => {
  it('writes a custom principle in the step’s category', async () => {
    render(<Principle />)
    await userEvent.selectOptions(screen.getByLabelText('Principle of Esoteric'), 'Write my own principle…')
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name'), 'Principle of Tides')
    await userEvent.type(screen.getByLabelText('Green ability'), 'Overcome at sea.')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({
      id: 'custom',
      custom: { category: 'esoteric', name: 'Principle of Tides', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: 'Overcome at sea.' } },
    })
  })

  it('shows the fields for a custom principle with nothing written yet, and flags one in another category', async () => {
    const { unmount } = render(<Principle initial={{ id: 'custom' }} />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    unmount()
    const written = { category: 'ideals' as const, name: 'P', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '' } }
    render(<Principle initial={{ id: 'custom', custom: written }} />)
    expect(screen.getByText("This principle is saved as Ideals, but this step's principle is Esoteric.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Make it Esoteric' }))
    expect(JSON.parse(screen.getByRole('status').textContent!).custom.category).toBe('esoteric')
  })

  it('picks the category of a custom principle when there’s none to follow (the retcon)', async () => {
    render(<Principle category={null} />)
    await userEvent.selectOptions(screen.getByLabelText('Principle'), 'Write my own principle…')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Ideals')
    expect(JSON.parse(screen.getByRole('status').textContent!).custom.category).toBe('ideals')
  })

  it('chooses a principle from the category and fills in its blank', async () => {
    render(<Principle />)
    const select = screen.getByRole('combobox', { name: 'Principle of Esoteric' })
    const custom = screen.getAllByRole('option').find((o) => o.textContent?.includes('['))!
    await userEvent.selectOptions(select, custom)
    await userEvent.type(screen.getByRole('textbox'), 'Fire')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({ customization: 'Fire' })
    expect(screen.getByText(/Core Rules, p\./)).toBeInTheDocument()
    await userEvent.selectOptions(select, '')
    expect(screen.getByRole('status')).toHaveTextContent('null')
  })

  it('shows a principle from another category as not fitting', () => {
    render(<Principle initial={{ id: 'business' }} />)
    expect(screen.getByRole('option', { name: 'Principle of Business (not Esoteric)' })).toBeInTheDocument()
  })
})

describe('describeOptions', () => {
  it('names traits and categories', () => {
    expect(describeOptions([{ quality: 'fitness' }])).toBe('Fitness')
    expect(describeOptions([{ quality: 'fitness' }, { quality: 'persuasion' }, { qualityCategory: 'mental' }])).toBe('Fitness, Persuasion, or any Mental quality')
  })
})

const HARMONY: Ability = { name: 'Harmony', type: 'I', text: 'As long as you have at least one bonus created from [quality], treat [power] as one size higher (max d12).' }
const EMBOLDEN = powerSourcesById.get('higher-power')!.yellowAbilities.options!.find((a) => a.name === 'Embolden')!

function Abilities({ initial = [], options, fixed = false }: { initial?: AbilityPick[]; options: Ability[]; fixed?: boolean }) {
  const [picks, setPicks] = useState(initial)
  const hero = validHero()
  return (
    <>
      <AbilityPicker
        hero={hero}
        traits={deriveTraits(hero).traits}
        legend="Yellow abilities: choose 2"
        hint="Each uses a different power."
        options={options}
        source="powerSource.yellow"
        step="powerSource"
        picks={picks}
        onChange={setPicks}
        fixed={fixed}
      />
      <output>{JSON.stringify(picks)}</output>
    </>
  )
}

const output = () => JSON.parse(screen.getByRole('status').textContent!) as unknown

describe('AbilityPicker', () => {
  const accident = powerSourcesById.get('accident')!.yellowAbilities.options!

  it('takes an ability and fills in its blanks, showing the filled-in text', async () => {
    render(<Abilities options={accident} />)
    expect(screen.getByText('Each uses a different power.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Area Alteration/ }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '[Boost or Hinder]' }), 'Hinder')
    const power = screen.getByRole('combobox', { name: '[power]' })
    // Only the hero's powers, with their dice.
    expect([...power.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Choose…', 'Agility (d10)', 'Fire (d8)', 'Awareness (d8)', 'Speed (d12)', 'Flight (d6)'])
    await userEvent.selectOptions(power, 'Fire (d8)')
    await userEvent.type(screen.getByLabelText('Your name for it (optional)'), 'Heat Wave')
    expect(screen.getByText('Hinder any number of nearby targets using Fire. Use your Max die.')).toBeInTheDocument()
    expect(output()).toEqual([
      { source: 'powerSource.yellow', name: 'Area Alteration', blanks: { 'Boost or Hinder': 'Hinder' }, uses: [P('fire')], customName: 'Heat Wave' },
    ])
    await userEvent.clear(screen.getByLabelText('Your name for it (optional)'))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '[power]' }), 'Choose…')
    expect(output()).toEqual([{ source: 'powerSource.yellow', name: 'Area Alteration', blanks: { 'Boost or Hinder': 'Hinder' } }])
    await userEvent.click(screen.getByRole('checkbox', { name: /Area Alteration/ }))
    expect(output()).toEqual([])
  })

  it('fills trait slots in order', async () => {
    render(<Abilities options={[HARMONY]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Harmony/ }))
    expect(screen.getByRole('combobox', { name: '[power]' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '[quality]' }), 'Fitness (d10)')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '[power]' }), 'Speed (d12)')
    expect(output()).toEqual([{ source: 'powerSource.yellow', name: 'Harmony', uses: [Q('fitness'), P('speed')] }])
  })

  it('takes several choices for a blank that asks for them, and free text for others', async () => {
    const immunity = powerSourcesById.get('accident')!.greenAbilities!.options!.find((a) => a.name === 'Immunity')!
    render(<Abilities options={[EMBOLDEN, immunity]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Embolden/ }))
    const group = screen.getByRole('group', { name: '[choose two basic actions]' })
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Attack' }))
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Overcome' }))
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Attack' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Immunity/ }))
    await userEvent.type(screen.getByRole('textbox', { name: '[energy/element]' }), 'Fire')
    expect(output()).toEqual([
      { source: 'powerSource.yellow', name: 'Embolden', blanks: { 'choose two basic actions': ['Overcome'] } },
      { source: 'powerSource.yellow', name: 'Immunity', blanks: { 'energy/element': 'Fire' } },
    ])
  })

  it('keeps picks that aren’t on the list, so they can be removed, and choices that no longer fit', async () => {
    render(<Abilities options={accident} initial={[{ source: 'powerSource.yellow', name: 'Gone' }, { source: 'powerSource.yellow', name: 'Inflict', uses: [P('cold')] }]} />)
    expect(screen.getByRole('combobox', { name: '[power]' })).toHaveDisplayValue("Cold (doesn't fit)")
    await userEvent.click(screen.getByRole('checkbox', { name: /Gone.*not on this list/ }))
    expect(output()).toEqual([{ source: 'powerSource.yellow', name: 'Inflict', uses: [P('cold')] }])
  })

  it('shows fixed abilities without a choice, filling in the blanks of those that have them', async () => {
    const sprint: Ability = { name: 'Sprint', type: 'A', text: 'Overcome using [power].' }
    render(<Abilities options={[sprint, { name: 'Steady', type: 'I', text: 'You can’t be knocked down.' }]} fixed />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('Steady')).toBeInTheDocument()
    // Each can be named; only the one with blanks has a preview of its filled-in text.
    const names = screen.getAllByLabelText('Your name for it (optional)')
    expect(names).toHaveLength(2)
    expect(screen.queryByText('You can’t be knocked down.', { selector: '.ability-pick__preview' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0]!, 'Speed (d12)')
    await userEvent.type(names[1]!, 'Rooted')
    expect(output()).toEqual([
      { source: 'powerSource.yellow', name: 'Sprint', uses: [P('speed')] },
      { source: 'powerSource.yellow', name: 'Steady', customName: 'Rooted' },
    ])
  })

  it('says when no trait fits a slot', async () => {
    render(<Abilities options={[{ name: 'Mind Trick', type: 'A', text: 'Attack using [psychic power].' }]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Mind Trick/ }))
    expect(screen.getByText("You don't have a power or quality that fits yet.")).toBeInTheDocument()
  })
})

const held = (trait: HeroTrait['trait'], die: HeroTrait['die'], name: string): HeroTrait => ({ trait, die, step: 'powerSource', name })

type BonusProps = Parameters<typeof BonusPicker>[0]

function Bonuses({ bonus, before, initial = [], listed = [], archetypeQualities }: { bonus: Bonus; before: HeroTrait[]; initial?: TraitAssignment[]; listed?: BonusProps['listed']; archetypeQualities?: BonusProps['archetypeQualities'] }) {
  const [assignments, setAssignments] = useState(initial)
  return (
    <>
      <BonusPicker hero={validHero()} legend="The bonus" bonus={bonus} listed={listed} before={before} archetypeQualities={archetypeQualities} assignments={assignments} onChange={setAssignments} />
      <output>{JSON.stringify(assignments)}</output>
    </>
  )
}

describe('BonusPicker', () => {
  const bonusOf = (id: string) => powerSourcesById.get(id)!.bonuses![0]!

  it('gains a trait at the bonus die', async () => {
    render(<Bonuses bonus={bonusOf('mystical')} before={[]} />)
    expect(screen.getByText('Gain an Information quality at d10.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Quality' }), 'History at d10')
    expect(output()).toEqual([A(Q('history'), 'd10')])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Quality' }), 'Choose…')
    expect(output()).toEqual([])
  })

  it('upgrades a die, or falls back to gaining a listed power', async () => {
    const alien = powerSourcesById.get('alien')!
    const { unmount } = render(<Bonuses bonus={alien.bonuses![0]!} listed={alien.powers.options} before={[held(P('flight'), 'd6', 'Flight'), held(P('fire'), 'd10', 'Fire')]} />)
    const upgrade = screen.getByRole('combobox', { name: 'Upgrade' })
    expect([...upgrade.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Choose…', 'Flight: d6 → d8'])
    await userEvent.selectOptions(upgrade, 'Flight: d6 → d8')
    expect(output()).toEqual([A(P('flight'), 'd8')])
    unmount()

    // No d6 power: gain a listed power instead, or (ruling 9) still upgrade a d6 quality.
    render(<Bonuses bonus={alien.bonuses![0]!} listed={alien.powers.options} before={[held(P('fire'), 'd10', 'Fire'), held(Q('banter'), 'd6', 'Banter')]} />)
    expect(screen.getByText(/You have no power it can upgrade/)).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: 'Upgrade or gain' })
    const groups = [...select.querySelectorAll('optgroup')]
    expect(groups.map((g) => g.label)).toEqual(['Upgrade', 'Gain a power instead'])
    expect([...groups[0]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Banter: d6 → d8'])
    await userEvent.selectOptions(select, 'Banter: d6 → d8')
    expect(output()).toEqual([A(Q('banter'), 'd8')])
    await userEvent.selectOptions(select, 'Speed at d6')
    expect(output()).toEqual([A(P('speed'), 'd6')])
  })

  it('shifts one power down and a different one up', async () => {
    render(<Bonuses bonus={bonusOf('cosmos')} before={[held(P('flight'), 'd8', 'Flight'), held(P('fire'), 'd10', 'Fire')]} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lower' }), 'Fire: d10 → d8')
    const raise = screen.getByRole('combobox', { name: 'Raise' })
    // The lowered power can't also be raised.
    expect([...raise.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Choose…', 'Flight: d8 → d10'])
    await userEvent.selectOptions(raise, 'Flight: d8 → d10')
    expect(output()).toEqual([A(P('fire'), 'd8'), A(P('flight'), 'd10')])
    // Clearing the lowered one keeps the raised one where it is.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lower' }), 'Choose…')
    expect(output()).toEqual([A(P('flight'), 'd10')])
    expect(screen.getByRole('combobox', { name: 'Raise' })).toHaveDisplayValue('Flight: d8 → d10')
  })

  it('points to the archetype step for Training’s extra quality, and keeps choices that don’t fit', () => {
    const { unmount } = render(<Bonuses bonus={bonusOf('training')} before={[]} />)
    expect(screen.getByText('You take this in the archetype step.')).toBeInTheDocument()
    unmount()
    render(<Bonuses bonus={bonusOf('mystical')} before={[]} initial={[A(Q('banter'), 'd8')]} />)
    expect(screen.getByRole('combobox', { name: 'Quality' })).toHaveDisplayValue("Banter at d8 (doesn't fit)")
  })

  it('takes Training’s extra quality from the archetype’s list in the archetype step', async () => {
    render(<Bonuses bonus={bonusOf('training')} before={[]} archetypeQualities={archetypesById.get('speedster')!.qualities!.options} />)
    const quality = screen.getByRole('combobox', { name: 'Quality' })
    expect(within(quality).getByRole('option', { name: 'Acrobatics at d8' })).toBeInTheDocument()
    expect(within(quality).queryByRole('option', { name: 'Banter at d8' })).not.toBeInTheDocument()
    await userEvent.selectOptions(quality, 'Acrobatics at d8')
    expect(output()).toEqual([A(Q('acrobatics'), 'd8')])
  })
})

describe('TablePicker', () => {
  it('offers the options an inherited roll reaches, or says when it reaches none', () => {
    const table = [
      { id: 'low', roll: 2, name: 'Low' },
      { id: 'high', roll: 20, name: 'High' },
    ]
    const props = { what: 'thing', method: 'guided' as const, dice: ['d6' as const], table, roll: undefined, selectedId: undefined, onRoll: () => {}, onSelect: () => {} }
    const { unmount } = render(<TablePicker {...props} inherited={{ roll: { dice: ['d6'], results: [2], manual: false }, from: 'first' }} />)
    expect(screen.getByText(/Your first roll was/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Low/ })).toBeInTheDocument()
    unmount()
    render(<TablePicker {...props} inherited={{ roll: { dice: ['d6'], results: [5], manual: false }, from: 'first' }} />)
    expect(screen.getByText("That roll doesn't reach any thing. Roll d6 for a fresh one.")).toBeInTheDocument()
  })

  it('points to the method choice when a roll reaches nothing and the reroll is used', () => {
    const table = [{ id: 'high', roll: 20, name: 'High' }]
    render(
      <TablePicker what="thing" method="guided" dice={['d6']} table={table} roll={{ dice: ['d6'], results: [5], manual: false, rerolled: true }} selectedId={undefined} onRoll={() => {}} onSelect={() => {}} />,
    )
    expect(screen.getByText(/That roll doesn't reach any thing/)).toHaveTextContent('Switch this hero to Constructed (at the top of the Background step) to pick any.')
  })
})
