import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import { exampleHero } from '../hero/example'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { MemoryGameStore } from '../game/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { sendText } from '../library/send-text'
import { heroType, toItem, villainType } from '../library/registry'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { Receiver, Sender } from './send'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

const CODE = 'ABCD-EFGH'

afterEach(() => {
  window.location.hash = ''
})

function hero(id: string, name: string, tags: string[] = []): Hero {
  const h = exampleHero({ id })
  h.details.name = name
  h.tags = tags
  return h
}

function gravelord() {
  const v = { ...adaptiveBruiser(), id: 'g', tags: ['thursday-game'] }
  v.details.name = 'Gravelord'
  return v
}

async function setup(hash: string, saved: { heroes?: Hero[]; villains?: ReturnType<typeof gravelord>[] } = {}) {
  const net = fakeNetwork()
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  for (const h of saved.heroes ?? []) await heroes.save(h)
  for (const v of saved.villains ?? []) await villains.save(v)
  window.location.hash = hash
  render(<App store={heroes} villainStore={villains} gameStore={new MemoryGameStore()} searchStore={new MemorySavedSearchStore()} connect={net.connect} sessionStore={localSessionStore(memoryStorage())} />)
  return { net, heroes, villains, settle: () => act(() => net.settle()) }
}

const row = (name: string) => within(within(screen.getByRole('table', { name: 'Library' })).getByRole('link', { name }).closest('tr')!)

describe('Send', () => {
  it('shows a code from the row ⋯ menu, until the other device accepts', async () => {
    const { net, settle } = await setup('#/', { heroes: [hero('maya', 'Maya Reyes', ['thursday-game'])] })
    await screen.findByRole('table', { name: 'Library' })
    await userEvent.click(row('Maya Reyes').getByRole('button', { name: 'More actions for Maya Reyes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Send…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Send Maya Reyes' }))
    expect(dialog.getByText('Maya Reyes · with their tags')).toBeInTheDocument()
    expect(dialog.getByText('On their device: Play together, then Receive, then this code. Keep this open until they accept.')).toBeInTheDocument()
    const code = dialog.getByLabelText(/^Send code/).textContent!

    const receiver = new Receiver(net.connect, code)
    await settle()
    expect(dialog.getByRole('status')).toHaveTextContent('Their device has the code. Waiting for them to accept.')
    const offered = receiver.getSnapshot()
    expect(offered.status === 'offered' && offered.offer.heroes.map((h) => h.tags)).toEqual([['thursday-game']])
    act(() => receiver.accept())
    await settle()
    expect(dialog.getByRole('status')).toHaveTextContent('Sent. They accepted one item.')
    expect(dialog.queryByLabelText(/^Send code/)).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends a selection, and Cancel closes the code', async () => {
    const { net, settle } = await setup('#/', { heroes: [hero('maya', 'Maya Reyes')], villains: [gravelord()] })
    await screen.findByRole('table', { name: 'Library' })
    await userEvent.click(row('Maya Reyes').getByRole('checkbox', { name: 'Select Maya Reyes' }))
    await userEvent.click(row('Gravelord').getByRole('checkbox', { name: 'Select Gravelord' }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Selected items' })).getByRole('button', { name: 'Send…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Send 2 items' }))
    expect(dialog.getByText(/^(Maya Reyes, Gravelord|Gravelord, Maya Reyes) · with their tags$/)).toBeInTheDocument()
    const code = dialog.getByLabelText(/^Send code/).textContent!
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await settle()
    // Nobody is in the code's room any more.
    expect(net.peerIds()).toEqual([])
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })
})

describe('Receive', () => {
  it('is in Play together, and asks for the code', async () => {
    await setup('#/')
    await userEvent.click(await screen.findByRole('button', { name: 'Play together' }))
    const receive = within(screen.getByRole('dialog', { name: 'Play together' })).getByRole('link', { name: 'Receive' })
    expect(receive).toHaveAttribute('href', '#/receive')
    await userEvent.click(receive)
    await userEvent.type(await screen.findByLabelText('Code'), 'abcd efgh')
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(window.location.hash).toBe(`#/receive/${CODE}`))
  })

  it('shows what is coming, and Accept adds it to the library with its tags (a copy when it’s already there)', async () => {
    const maya = hero('maya', 'Maya Reyes', ['thursday-game'])
    const { net, heroes, villains, settle } = await setup(`#/receive/${CODE}`, { heroes: [maya] })
    const sender = new Sender(net.connect, sendText([toItem(heroType, maya), toItem(villainType, gravelord())]), CODE)
    await settle()
    expect(await screen.findByRole('heading', { name: 'Receive 2 items' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['Maya Reyes Herothursday-game', 'Gravelord Villainthursday-game'])
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added Maya Reyes, Gravelord to your library.')
    expect(screen.getByText('You already had Maya Reyes, so it came in as a copy.')).toBeInTheDocument()
    await settle()
    expect(sender.getSnapshot().status).toBe('accepted')

    const savedHeroes = (await heroes.list()).heroes
    expect(savedHeroes).toHaveLength(2)
    expect(savedHeroes.find((h) => h.id === 'maya')).toEqual(maya)
    expect(savedHeroes.find((h) => h.id !== 'maya')!.tags).toEqual(['thursday-game'])
    expect((await villains.list()).villains.map((v) => [v.id, v.tags])).toEqual([['g', ['thursday-game']]])
  })

  it('says when nothing is being sent with the code, or the sender stopped', async () => {
    const { net, settle } = await setup(`#/receive/${CODE}`)
    expect(await screen.findByRole('status')).toHaveTextContent(`Looking for ${CODE}…`)
    const sender = new Sender(net.connect, sendText([toItem(heroType, hero('maya', 'Maya Reyes'))]), CODE)
    await settle()
    expect(await screen.findByRole('heading', { name: 'Receive Maya Reyes' })).toBeInTheDocument()
    act(() => sender.cancel())
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('The sender closed the code before you accepted. Ask them to send again.')
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use another code' })).toHaveAttribute('href', '#/receive')
  })
})
