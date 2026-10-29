import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { createHero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { adaptiveBruiser } from '../test/villains'
import { downloadFile } from '../transfer/download'
import { backupJson, readImport, villainJson } from '../transfer/files'
import { villainMarkdown } from '../transfer/markdown'
import { MemoryVillainStore } from '../villain/store'
import { VillainPage } from '../villain/VillainPage'
import { Home } from './Home'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

afterEach(() => {
  window.location.hash = ''
  vi.mocked(downloadFile).mockClear()
})

function renderHome(heroes = new MemoryHeroStore(), villains = new MemoryVillainStore()) {
  render(
    <StoreContext.Provider value={heroes}>
      <VillainStoreContext.Provider value={villains}>
        <Home />
      </VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )
  return { heroes, villains }
}

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
const upload = async (text: string, name = 'file.json') => {
  await screen.findByRole('button', { name: 'Import from a file…' })
  await userEvent.upload(fileInput(), new File([text], name, { type: 'application/json' }))
}

describe('importing and backing up villains', () => {
  it('imports a villain file into the villain list', async () => {
    const { villains } = renderHome()
    await upload(villainJson(adaptiveBruiser()))
    expect(await screen.findByRole('status')).toHaveTextContent('Imported one villain.')
    expect(await within(screen.getByRole('region', { name: 'Your villains' })).findByRole('link', { name: /Ironclad/ })).toBeInTheDocument()
    expect((await villains.list()).villains.map((v) => v.id)).toEqual(['v1'])
  })

  it('imports a villain’s Markdown, and asks about one already saved', async () => {
    const villains = new MemoryVillainStore()
    await villains.save(adaptiveBruiser())
    renderHome(new MemoryHeroStore(), villains)
    await upload(villainMarkdown({ ...adaptiveBruiser(), details: { ...adaptiveBruiser().details, name: 'Ironclad II' } }), 'ironclad.md')
    const prompt = await screen.findByRole('group', { name: 'You already have this villain' })
    await userEvent.click(within(prompt).getByRole('radio', { name: 'Replace mine' }))
    await userEvent.click(within(prompt).getByRole('button', { name: 'Import one villain' }))
    await waitFor(async () => expect((await villains.list()).villains.map((v) => v.details.name)).toEqual(['Ironclad II']))
  })

  it('imports a backup of heroes and villains', async () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'Ann'
    const { heroes, villains } = renderHome()
    await upload(backupJson([hero], [adaptiveBruiser()]))
    expect(await screen.findByRole('status')).toHaveTextContent('Imported one hero and one villain.')
    expect((await heroes.list()).heroes).toHaveLength(1)
    expect((await villains.list()).villains).toHaveLength(1)
  })

  it('backs up villains with the heroes, even with no heroes', async () => {
    const villains = new MemoryVillainStore()
    await villains.save(adaptiveBruiser())
    renderHome(new MemoryHeroStore(), villains)
    await userEvent.click(await screen.findByRole('button', { name: 'Back up all heroes and villains' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    const [, text] = vi.mocked(downloadFile).mock.calls[0]!
    expect(readImport(text as string)).toMatchObject({ ok: true, heroes: [], villains: [{ id: 'v1' }] })
  })
})

describe('exporting a villain', () => {
  it('downloads the villain as JSON and Markdown from its page', async () => {
    const villains = new MemoryVillainStore()
    await villains.save(adaptiveBruiser())
    render(
      <VillainStoreContext.Provider value={villains}>
        <VillainPage id="v1" />
      </VillainStoreContext.Provider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await userEvent.click(screen.getByRole('button', { name: 'Markdown' }))
    const calls = vi.mocked(downloadFile).mock.calls
    expect(calls.map((c) => [c[0], c[2]])).toEqual([
      ['ironclad.json', 'application/json'],
      ['ironclad.md', 'text/markdown'],
    ])
    expect(readImport(calls[0]![1] as string)).toMatchObject({ ok: true, villains: [{ id: 'v1' }] })
  })
})
