import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
import { WIZARD_STEPS } from '../hero/wizard-steps'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { archetypesById, backgrounds } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import { completeHero, dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { HeroEditor } from './HeroEditor'
import { PREVIEW_KEY, readPreviewShown, writePreviewShown } from './preview-preference'

const editor = (store: HeroStore, step?: string) => (
  <StoreContext.Provider value={store}>
    <HeroEditor id="h1" step={step} />
  </StoreContext.Provider>
)

const renderEditor = (store: HeroStore, step?: string) => render(editor(store, step))

async function storeWith(hero: Hero) {
  const store = new MemoryHeroStore()
  await store.save({ ...hero, id: 'h1' })
  return store
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}

/** A viewport `width` px wide, as far as min-width media queries go. */
function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  window.location.hash = ''
})

describe('the wizard shell', () => {
  it('shows a docked sheet preview on wide screens, remembering when it’s hidden', async () => {
    viewport(1440)
    const view = renderEditor(await storeWith(completeHero()), 'archetype')
    const preview = await screen.findByRole('complementary', { name: 'Sheet preview' })
    // Listed abilities show their action icons, named, before the name.
    const green = within(preview).getByRole('region', { name: 'Green abilities' })
    expect(within(green).getAllByRole('img', { name: 'Attack' }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Hide preview' }))
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('hidden')
    view.unmount()
    renderEditor(await storeWith(completeHero()), 'archetype')
    expect(await screen.findByRole('button', { name: 'Show preview' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
  })

  it('opens the preview as a drawer at medium widths, returning focus when it closes', async () => {
    viewport(1024)
    renderEditor(await storeWith(completeHero()), 'archetype')
    const show = await screen.findByRole('button', { name: 'Show preview' })
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
    await userEvent.click(show)
    const drawer = screen.getByRole('dialog', { name: 'Sheet preview' })
    expect(drawer).toHaveClass('modal--drawer')
    expect(within(drawer).getByRole('heading', { name: 'Sheet preview' })).toHaveFocus()
    // Tab stays inside.
    await userEvent.tab()
    expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.tab()
    expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(show).toHaveFocus()
  })

  it('on a phone, opens the step list and the preview as bottom sheets', async () => {
    viewport(390)
    renderEditor(await storeWith(completeHero()), 'archetype')
    expect(await screen.findByRole('heading', { level: 3, name: '3 · Archetype' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Creation steps' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Step 3 of 8.*Archetype/ }))
    const steps = screen.getByRole('dialog', { name: 'Steps' })
    expect(steps).toHaveClass('modal--sheet')
    await userEvent.click(within(steps).getByRole('link', { name: /Personality/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('dialog', { name: 'Sheet preview' })).toHaveClass('modal--sheet')
  })

  it('finishes a draft with open issues only after showing them', async () => {
    const draft = { ...createHero('guided'), status: 'draft' as const, furthestStep: 8 }
    draft.background = { id: 'upper-class', qualities: [] }
    const store = await storeWith(draft)
    renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    const dialog = screen.getByRole('dialog', { name: 'Finish with rule issues?' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    expect(within(dialog).getAllByRole('link', { name: 'Go to issue' })[0]).toHaveAttribute('href', '#/hero/h1/edit/background')
    // Keep editing leaves it a draft.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect((await saved(store)).status).toBe('draft')
    await userEvent.click(screen.getAllByRole('button', { name: 'Finish hero' })[1]!)
    await userEvent.click(screen.getByRole('button', { name: 'Finish anyway' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1'))
    expect((await saved(store)).status).toBe('complete')
  })

  it('stays put when finishing can’t be saved', async () => {
    const store = await storeWith({ ...completeHero(), status: 'draft' })
    store.save = async () => {
      throw new Error('quota exceeded')
    }
    window.location.hash = '#/hero/h1/edit/details'
    renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent('quota exceeded')
    await act(async () => {})
    expect(window.location.hash).toBe('#/hero/h1/edit/details')
  })

  it('shows when a reopened draft was last saved, and the method in the rail', async () => {
    const store = await storeWith({ ...createHero('guided'), status: 'draft', rollMode: 'manual', updatedAt: new Date().toISOString() })
    renderEditor(store, 'start')
    expect(await screen.findByText('Draft · saved just now')).toBeInTheDocument()
    expect(screen.getByText('Guided method · rolling your own dice.')).toBeInTheDocument()
  })
})

describe('step anatomy', () => {
  it('lists only what a Guided roll of 7 and 3 allows, each tagged with how it was reached', async () => {
    const store = await storeWith({ ...createHero('guided'), pendingRolls: { background: { dice: ['d10', 'd10'], results: [7, 3], manual: false } } })
    renderEditor(store, 'background')
    const choose = await screen.findByRole('region', { name: 'Choose a background' })
    expect(within(choose).getByText('Showing the 3 backgrounds your roll allows.')).toBeInTheDocument()
    const radios = within(choose).getAllByRole('radio')
    expect(radios.map((r) => r.closest('label')!.querySelector('.option__name')!.textContent)).toEqual(['Struggling', 'Academic', 'Military'])
    expect(radios.map((r) => [...r.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent))).toEqual([['Rolled 3'], ['Rolled 7'], ['Sum, 7 + 3']])
    expect(screen.getByText(/You rolled/)).toHaveTextContent('Pick 7, 3, or their sum, 10.')
  })

  it('tags each different way a three-dice roll reaches an option', async () => {
    const bg = backgrounds.find((b) => b.powerSourceDice.length === 3 && b.powerSourceDice.every((d) => Number(d.slice(1)) >= 8))!
    const hero = { ...createHero('guided'), background: { id: bg.id, qualities: [] }, pendingRolls: { powerSource: { dice: bg.powerSourceDice, results: [4, 3, 4], manual: false } } }
    renderEditor(await storeWith(hero), 'power-source')
    const choose = await screen.findByRole('region', { name: 'Choose a power source' })
    const seven = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '7')!
    // 4 + 3 twice reads once.
    expect([...seven.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Sum, 4 + 3'])
    const eight = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '8')
    if (eight) expect([...eight.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Sum, 4 + 4'])
    const four = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '4')!
    expect([...four.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Rolled 4'])
  })

  it('asks for the player’s own roll first when they roll their own dice', async () => {
    renderEditor(await storeWith({ ...createHero('guided'), rollMode: 'manual' }), 'background')
    expect(await screen.findByRole('spinbutton', { name: 'd10 #1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll in the app instead' })).toBeInTheDocument()
  })

  it('shows the dice in and out, and counts assigned dice', async () => {
    const hero = { ...createHero('constructed'), background: { id: 'upper-class', qualities: [] } }
    renderEditor(await storeWith(hero), 'power-source')
    const diceIn = await screen.findByRole('region', { name: 'Dice in' })
    expect(within(diceIn).getByText('From Background')).toBeInTheDocument()
    expect(within(diceIn).getAllByRole('img').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('radio', { name: /Accident/ }))
    const out = screen.getByRole('region', { name: 'Dice out' })
    expect(out).toHaveTextContent('Archetype rolls')
    expect(screen.getByText(/0 of \d dice assigned/)).toBeInTheDocument()
  })

  it('takes the player to the field an issue is about', async () => {
    const hero = { ...createHero('constructed'), background: { id: 'upper-class', qualities: [] } }
    renderEditor(await storeWith(hero), 'background')
    const issues = await screen.findByRole('region', { name: '2 things to look at' })
    await userEvent.click(within(issues).getByRole('button', { name: /no dice are assigned yet/ }))
    expect(screen.getByRole('combobox', { name: 'd10' })).toHaveFocus()
    await userEvent.click(within(issues).getByRole('button', { name: /Choose a principle/ }))
    expect(screen.getByRole('combobox', { name: /Principle of Responsibility/ })).toHaveFocus()
  })

  it('goes to an issue from the Finish dialog, focusing its field', async () => {
    const draft = { ...createHero('constructed'), status: 'draft' as const, background: { id: 'upper-class', qualities: [] } }
    const store = await storeWith(draft)
    const view = renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    const go = within(screen.getByRole('dialog')).getAllByRole('link', { name: 'Go to issue' })[0]!
    expect(go).toHaveAttribute('href', '#/hero/h1/edit/background')
    await userEvent.click(go)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The app follows the link's address to the step; here the test passes the new step itself.
    view.rerender(
      <StoreContext.Provider value={store}>
        <HeroEditor id="h1" step="background" />
      </StoreContext.Provider>,
    )
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'd10' })).toHaveFocus())
  })

  it('shows each issue under its field, outlined and linked, as well as in the summary', async () => {
    const hero = completeHero()
    hero.powerSource!.powers[1]!.trait = hero.powerSource!.powers[0]!.trait
    const inflict = hero.powerSource!.abilities.find((p) => p.uses?.length)!
    delete inflict.uses
    renderEditor(await storeWith(hero), 'power-source')
    const summary = await screen.findByRole('region', { name: '2 things to look at' })
    // The assign row: its select outlined and described by the issue under it.
    const twice = screen.getAllByRole('combobox').filter((s) => s.getAttribute('aria-invalid') === 'true')
    expect(twice).toHaveLength(1)
    expect(twice[0]).toHaveAccessibleDescription(/gets more than one die in this step/)
    expect(twice[0]!.closest('.dice-assigner__row')!.querySelector('.inline-issues')).toBeInTheDocument()
    // The ability card: its box outlined, its checkbox described by the issue.
    const card = screen.getByRole('checkbox', { name: new RegExp(inflict.name) })
    expect(card).toHaveAttribute('aria-invalid', 'true')
    expect(card).toHaveAccessibleDescription(`Fill in [power] for ${inflict.name}.`)
    expect(card.closest('.ability-card')).toHaveClass('ability-card--invalid')
    // The summary's link takes the player to the field.
    await userEvent.click(within(summary).getByRole('button', { name: `Fill in [power] for ${inflict.name}.` }))
    expect(card).toHaveFocus()
  })

  it('shows status dice and Health ranges in their game colors, with their labels', async () => {
    const hero = completeHero()
    renderEditor(await storeWith(hero), 'personality')
    // The step's own row (the sheet preview shows the dice as tiles too).
    const status = (await screen.findAllByRole('list', { name: 'Status dice' })).find((l) => l.classList.contains('game-chips'))!
    expect(within(status).getAllByRole('listitem').map((li) => li.className)).toEqual(['game-chip game-chip--green', 'game-chip game-chip--yellow', 'game-chip game-chip--red'])
    expect(status).toHaveTextContent('GreenYellowRed')
  })
})

describe('special archetype parts', () => {
  const renderAt = (store: HeroStore, step: string, part?: string) =>
    render(
      <StoreContext.Provider value={store}>
        <HeroEditor id="h1" step={step} part={part} />
      </StoreContext.Provider>,
    )

  it.each([
    ['Divided', dividedHero, ['Second archetype', 'Transition', 'Divided ability']],
    ['Form-Changer', formChangerHero, ['Base build', 'Green form 1', 'Green form 2', 'Yellow form', 'Principle']],
    ['Minion-Maker', minionMakerHero, ['Base build', 'Minion forms', 'Principle']],
    ['Modular', modularHero, ['Base archetype', 'Switch abilities', 'Green mode', 'Yellow mode 1', 'Yellow mode 2', 'Red mode', 'Powerless mode (optional)', 'Principle']],
  ] as const)('shows %s’s parts in the step and the rail, with counts matching the issues', async (_name, make, labels) => {
    const hero = make()
    // Make some issues to count: no principle.
    delete hero.archetype!.principle
    renderAt(await storeWith(hero), 'archetype')
    const rail = within(await screen.findByRole('list', { name: 'Archetype parts' }))
    // The step is about the archetype's parts, on its own pages.
    expect(screen.getByText(/adds parts to this step/)).toBeInTheDocument()
    expect(screen.getAllByText(formatEntryRef(archetypesById.get(hero.archetype!.id)!)).length).toBeGreaterThan(0)
    const railNames = rail.getAllByRole('link').map((l) => l.querySelector('.rail__label')!.textContent)
    for (const label of labels) {
      expect(railNames).toContain(label)
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument()
    }
    // Each part's count matches its card, and they add up to the step's issues.
    const issues = screen.queryByRole('region', { name: /things? to look at/ })
    const stepCount = issues ? within(issues).getAllByRole('listitem').length : 0
    let sum = 0
    for (const link of rail.getAllByRole('link')) {
      const n = Number(link.querySelector('.mark--issues [aria-hidden]')?.textContent ?? 0)
      sum += n
      const card = screen.getByRole('region', { name: link.querySelector('.rail__label')!.textContent! })
      expect(Number(card.querySelector('.part__head .mark--issues [aria-hidden]')?.textContent ?? 0)).toBe(n)
    }
    expect(sum).toBe(stepCount)
    expect(stepCount).toBeGreaterThan(0)
  })

  it('opens the part in the address, and links each rail item to its part', async () => {
    renderAt(await storeWith(formChangerHero()), 'archetype', 'form:green:1')
    const card = await screen.findByRole('region', { name: 'Green form 2' })
    await waitFor(() => expect(card.querySelector('.part__head')).toHaveAttribute('aria-expanded', 'true'))
    expect(card.querySelector('.part__head')).toHaveFocus()
    const rail = within(screen.getByRole('list', { name: 'Archetype parts' }))
    expect(rail.getByRole('link', { name: /Green form 2/ })).toHaveAttribute('href', '#/hero/h1/edit/archetype/form%3Agreen%3A1')
    expect(rail.getByRole('link', { name: /Green form 2/ })).toHaveAttribute('aria-current', 'step')
  })

  it('collapses the list into the chosen card, and keeps open and closed parts as the player leaves them', async () => {
    renderAt(await storeWith(formChangerHero()), 'archetype')
    expect(await screen.findByRole('button', { name: 'Change archetype' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Choose an archetype' })).not.toBeInTheDocument()
    const head = screen.getByRole('region', { name: 'Base build' }).querySelector<HTMLButtonElement>('.part__head')!
    expect(head).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'true')
    expect(head).toHaveTextContent('Hide')
    await userEvent.click(screen.getByRole('button', { name: 'Change archetype' }))
    expect(screen.getByRole('region', { name: 'Choose an archetype' })).toBeInTheDocument()
  })

  it('takes an issue link to its part, opening it', async () => {
    const hero = formChangerHero()
    hero.archetype!.forms![1]!.ability = undefined
    renderAt(await storeWith(hero), 'archetype')
    const card = await screen.findByRole('region', { name: 'Green form 2' })
    const head = card.querySelector<HTMLButtonElement>('.part__head')!
    // It has an issue, so it starts open; close it to see the link open it again.
    await userEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'false')
    const issues = screen.getByRole('region', { name: /things? to look at/ })
    await userEvent.click(within(issues).getByRole('button', { name: /form ability/ }))
    expect(head).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true))
  })

  it('keeps focus on the field when the Finish dialog goes to a part issue on this step', async () => {
    const hero = { ...formChangerHero(), status: 'draft' as const }
    hero.archetype!.forms![1]!.ability = undefined
    const store = await storeWith(hero)
    const view = renderAt(store, 'archetype')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    const dialog = screen.getByRole('dialog')
    const item = within(dialog).getAllByRole('listitem').find((li) => /form ability/.test(li.textContent ?? ''))!
    const go = within(item).getByRole('link', { name: 'Go to issue' })
    expect(go).toHaveAttribute('href', '#/hero/h1/edit/archetype/form%3Agreen%3A1')
    await userEvent.click(go)
    const card = screen.getByRole('region', { name: 'Green form 2' })
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true))
    // The link's address arrives after; focus stays on the field, not the part's header.
    view.rerender(
      <StoreContext.Provider value={store}>
        <HeroEditor id="h1" step="archetype" part="form:green:1" />
      </StoreContext.Provider>,
    )
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(card.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toHaveClass('part__head')
  })

  it('opens a part from the rail even when it’s already in the address', async () => {
    renderAt(await storeWith(formChangerHero()), 'archetype', 'form:green:1')
    const card = await screen.findByRole('region', { name: 'Green form 2' })
    const head = card.querySelector<HTMLButtonElement>('.part__head')!
    await waitFor(() => expect(head).toHaveAttribute('aria-expanded', 'true'))
    await userEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(within(screen.getByRole('list', { name: 'Archetype parts' })).getByRole('link', { name: /Green form 2/ }))
    expect(head).toHaveAttribute('aria-expanded', 'true')
  })

  it('marks the step current when the address names a part this archetype doesn’t have', async () => {
    renderAt(await storeWith(formChangerHero()), 'archetype', 'transition')
    const nav = await screen.findByRole('navigation', { name: 'Creation steps' })
    expect(within(nav).getByRole('link', { current: 'step' })).toHaveTextContent(/Archetype/)
  })

  it('moves focus into the list on Change archetype, and back to the card on Keep', async () => {
    renderAt(await storeWith(formChangerHero()), 'archetype')
    await userEvent.click(await screen.findByRole('button', { name: 'Change archetype' }))
    expect(screen.getByRole('radio', { name: /Form-Changer/ })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Keep Form-Changer' }))
    expect(screen.getByRole('button', { name: 'Change archetype' })).toHaveFocus()
  })

  it('shows no minion form count until the quality that sets it is chosen', async () => {
    const hero = minionMakerHero()
    delete hero.archetype!.minionForms!.quality
    renderAt(await storeWith(hero), 'archetype')
    const card = await screen.findByRole('region', { name: 'Minion forms' })
    expect(card.querySelector('.part__sum')).toHaveTextContent('Choose the quality that sets how many')
    expect(card.querySelector('.part__sum')).not.toHaveTextContent(/of \d+ chosen/)
    expect(within(card).queryByText(/^Choose \d/)).not.toBeInTheDocument()
  })
})

describe('edit mode', () => {
  it('opens a finished hero at the summary: a row per step, each with a Change link', async () => {
    renderEditor(await storeWith(completeHero()))
    expect(await screen.findByRole('heading', { level: 3, name: 'Summary' })).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Creation steps' })
    expect(within(rail).getByRole('link', { name: 'Summary' })).toHaveAttribute('aria-current', 'page')
    for (const step of WIZARD_STEPS) {
      expect(screen.getByRole('link', { name: `Change ${step.label}` })).toHaveAttribute('href', `#/hero/h1/edit/${step.id}`)
    }
    // What each step chose, with dice as images.
    const background = screen.getByRole('heading', { level: 4, name: /Background/ }).closest('li')!
    expect(within(background).getByText('Principle of Business')).toBeInTheDocument()
    expect(within(background).getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Advancement' })).toHaveAttribute('href', '#/hero/h1/advancement')
    expect(screen.getByRole('link', { name: 'Done editing', hidden: false })).toBeInTheDocument()
  })

  it('links each part of a complex archetype from the summary', async () => {
    renderEditor(await storeWith(dividedHero()))
    const panel = await screen.findByRole('region', { name: 'Summary' })
    const parts = within(panel).getByRole('list', { name: 'Archetype parts' })
    expect(within(parts).getByRole('link', { name: 'Change Transition' })).toHaveAttribute('href', '#/hero/h1/edit/archetype/transition')
  })

  it('reverts, once confirmed, to exactly the hero as it was on entering edit mode', async () => {
    const store = await storeWith(completeHero())
    const before = await saved(store)
    const view = renderEditor(store)
    const revert = await screen.findByRole('button', { name: 'Revert changes' })
    expect(revert).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(revert)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // A change on a step, then back to the summary: the editor stays open across steps.
    view.rerender(editor(store, 'details'))
    const age = await screen.findByRole('textbox', { name: 'Age' })
    await userEvent.clear(age)
    await userEvent.type(age, '99')
    view.rerender(editor(store))
    const enabled = await screen.findByRole('button', { name: 'Revert changes' })
    expect(enabled).toHaveAttribute('aria-disabled', 'false')
    await userEvent.click(enabled)
    const dialog = screen.getByRole('dialog', { name: 'Revert changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep changes' }))
    expect((await saved(store)).details.age).toBe('99')
    await userEvent.click(enabled)
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(async () => expect({ ...(await saved(store)), updatedAt: '' }).toEqual({ ...before, updatedAt: '' }))
    expect(screen.getByRole('button', { name: 'Revert changes' })).toHaveAttribute('aria-disabled', 'true')
    // Focus stays on the button rather than being lost.
    expect(screen.getByRole('button', { name: 'Revert changes' })).toHaveFocus()
  })

  it('renames the hero from the header, updating Details, and Revert undoes it', async () => {
    const hero = completeHero()
    hero.details.name = 'Maya Reyes'
    const store = await storeWith(hero)
    const view = renderEditor(store, 'details')
    const before = 'Maya Reyes'
    await userEvent.click(await screen.findByRole('button', { name: `Rename hero: ${before}` }))
    await userEvent.keyboard('Velocity{Enter}')
    expect(screen.getByLabelText('Hero name')).toHaveValue('Velocity')
    await waitFor(async () => expect((await saved(store)).details.name).toBe('Velocity'))
    view.rerender(editor(store))
    await userEvent.click(await screen.findByRole('button', { name: 'Revert changes' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(async () => expect((await saved(store)).details.name).toBe(before))
    expect(screen.getByRole('button', { name: `Rename hero: ${before}` })).toBeInTheDocument()
  })

  it('focuses Revert changes after reverting, even where a click doesn’t focus the button', async () => {
    const store = await storeWith(completeHero())
    const view = renderEditor(store, 'details')
    const age = await screen.findByRole('textbox', { name: 'Age' })
    await userEvent.type(age, '1')
    view.rerender(editor(store))
    const revert = await screen.findByRole('button', { name: 'Revert changes' })
    // As in Safari: the click opens the dialog without focusing the button.
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.click(revert)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revert changes' })).toHaveFocus())
  })

  it('takes a new snapshot each time edit mode is opened', async () => {
    const store = await storeWith(completeHero())
    const first = renderEditor(store, 'details')
    const age = await screen.findByRole('textbox', { name: 'Age' })
    await userEvent.clear(age)
    await userEvent.type(age, '41')
    first.unmount()
    await waitFor(async () => expect((await saved(store)).details.age).toBe('41'))
    renderEditor(store)
    expect(await screen.findByRole('button', { name: 'Revert changes' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('names the summary on the phone’s step button', async () => {
    viewport(390)
    renderEditor(await storeWith(completeHero()))
    const button = await screen.findByRole('button', { name: /Summary/ })
    expect(button).toHaveClass('step-button')
    expect(screen.queryByText(/Before step 1/)).not.toBeInTheDocument()
  })

  it('goes back from Start to the summary', async () => {
    renderEditor(await storeWith(completeHero()), 'start')
    const nav = (await screen.findByRole('heading', { level: 3, name: 'Start' })).closest('section')!
    expect(within(nav).getByRole('link', { name: 'Summary' })).toHaveAttribute('href', '#/hero/h1/edit')
  })

  it('continues a draft with no step where it left off', async () => {
    window.location.hash = '#/hero/h1/edit'
    renderEditor(await storeWith({ ...completeHero(), status: 'draft', furthestStep: 4 }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/edit/personality'))
    expect(screen.queryByRole('heading', { level: 3, name: 'Summary' })).not.toBeInTheDocument()
  })
})

describe('the preview preference', () => {
  it('is shown unless hidden, and survives storage that throws', () => {
    const data: Record<string, string> = {}
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) }
    expect(readPreviewShown(storage)).toBe(true)
    writePreviewShown(false, storage)
    expect(readPreviewShown(storage)).toBe(false)
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readPreviewShown(throwing)).toBe(true)
    expect(() => writePreviewShown(true, throwing)).not.toThrow()
  })
})
