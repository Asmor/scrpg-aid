import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { JoinedStoreContext } from '../app/joined-store-context'
import { SavedSearchStoreContext } from '../app/saved-search-context'
import { StoreContext } from '../app/store-context'
import { TemplateStoresContext } from '../app/template-store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { MemoryJoinedStore } from '../game/joined-store'
import { createGame } from '../game/model'
import { project } from '../game/project'
import { createSoloGame } from '../game/solo'
import { MemoryGameStore } from '../game/store'
import { MemoryHeroStore } from '../hero/store'
import { createSavedSearch, MemorySavedSearchStore } from '../library/saved-searches'
import { createMinionTemplate } from '../template/model'
import { memoryTemplateStores } from '../template/store'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { downloadFile } from '../transfer/download'
import { MemoryVillainStore } from '../villain/store'
import type { BackupTimeStore } from '../library/backup-time'
import { backupText, byteLength, contentCounts, readEverything, readRestoreFile, restoreAdd, restoreReplace, sizeText, storageLine, type DataStores, replaceWarning, restoreRows } from './data'
import { DEFAULT_SETTINGS } from './model'
import { SettingsProvider } from './SettingsProvider'
import { SettingsPage } from './SettingsPage'
import { MemorySettingsStore } from './store'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

const clock = { now: new Date('2026-11-05T12:00:00Z'), newId: () => crypto.randomUUID() }

function stores() {
  return { heroes: new MemoryHeroStore(), villains: new MemoryVillainStore(), games: new MemoryGameStore(), templates: memoryTemplateStores(), searches: new MemorySavedSearchStore(), joined: new MemoryJoinedStore() }
}

async function filled(s = stores()) {
  const hero = { ...completeHero(), id: 'h1' }
  await s.heroes.save(hero)
  await s.villains.save({ ...adaptiveBruiser(), id: 'v1' })
  await s.games.save(createGame({ id: 'g1', name: 'Thursday game' }))
  await s.games.save(createSoloGame('hero', hero, clock))
  await s.templates.minions.save({ ...createMinionTemplate({ id: 'm1' }), name: 'Burglar' })
  await s.searches.save(createSavedSearch('Scene 3', { text: '', types: [], tags: ['x'] }, { id: 's1' }))
  const table = project(createGame({ id: 'j1', name: 'Friday game' }), 'player')
  await s.joined.save({ id: 'j1', room: 'ABCD-EFGH', gm: 'Sam', heroId: 'x', heroSourceId: 'h1', sheet: hero, name: 'Alex', since: 'x', updatedAt: 'x', version: 1, table })
  return s
}

async function plantUnreadable(s: MemoryGameStore, id: string, game: object) {
  // Saved by an older version: it can't be read, but its name still can.
  await (s as unknown as { putRecord: (r: unknown) => Promise<void> }).putRecord({ id, saved: { format: 'scrpg-game', version: 1, game } })
}

describe('restoring, before it happens', () => {
  it('counts each kind in the backup and already here, templates together', async () => {
    const contents = await readEverything((await filled()) as DataStores, DEFAULT_SETTINGS)
    expect(restoreRows(contents, [{ label: 'heroes' }, { label: 'minion templates' }])).toEqual([
      { label: 'Heroes', inBackup: 1, here: 1 },
      { label: 'Villains', inBackup: 1, here: 0 },
      { label: 'Minion, lieutenant, challenge and environment templates', inBackup: 1, here: 1 },
      { label: 'Games', inBackup: 2, here: 0 },
      { label: 'Joined games', inBackup: 1, here: 0 },
      { label: 'Saved searches', inBackup: 1, here: 0 },
    ])
  })

  it('names what Replace deletes, and what of it the backup lacks', async () => {
    const device = await readEverything((await filled()) as DataStores, DEFAULT_SETTINGS)
    expect(replaceWarning(device, device)).toBe("This deletes 3 library items, 2 games, 1 joined game and 1 saved search on this device. It can't be undone.")
    const backup = { ...device, heroes: [], games: device.games.filter((g) => g.id === 'g1') }
    expect(replaceWarning(backup, device)).toMatch(/^This deletes 3 library items, 2 games, 1 joined game and 1 saved search on this device, including 1 hero and 1 game that aren't in the backup: .+, Solo play · .+\. It can't be undone\.$/)
    const empty = await readEverything(stores() as DataStores, DEFAULT_SETTINGS)
    expect(replaceWarning(device, empty)).toBe("There's nothing on this device to delete. The backup is restored as it is.")
  })
})

describe('a backup of everything', () => {
  it('holds every kind, solo games and settings too, and reads back', async () => {
    const s = await filled()
    const contents = await readEverything(s as DataStores, { ...DEFAULT_SETTINGS, textSize: 'large' })
    const read = readRestoreFile(backupText(contents))
    expect(read).toMatchObject({ ok: true, skipped: 0 })
    if (!read.ok) return
    expect(contentCounts(read.contents).map((c) => [c.label, c.count])).toEqual([['heroes', 1], ['villains', 1], ['minion templates', 1], ['games', 2], ['joined games', 1], ['saved searches', 1]])
    expect(read.contents.settings?.textSize).toBe('large')
  })

  it('says what the device holds, not counting solo games as games', async () => {
    const s = await filled()
    const contents = await readEverything(s as DataStores, DEFAULT_SETTINGS)
    expect(storageLine(contents, 1_300_000)).toBe('This device holds 3 library items, 1 game and 1 joined game (1.2 MB).')
    expect([sizeText(500), sizeText(2048), byteLength('é')]).toEqual(['500 B', '2 KB', 2])
  })

  it('only a backup restores', () => {
    expect(readRestoreFile('nope')).toMatchObject({ ok: false })
    expect(readRestoreFile(JSON.stringify({ format: 'scrpg-hero' }))).toMatchObject({ ok: false, error: "This file isn't a backup the app can read." })
  })
})

describe('restoring', () => {
  it('adding skips ids already here', async () => {
    const from = await filled()
    const contents = await readEverything(from as DataStores, DEFAULT_SETTINGS)
    const to = stores()
    await to.heroes.save({ ...completeHero(), id: 'h1', details: { ...completeHero().details, name: 'Kept' } })
    expect(await restoreAdd(contents, to as DataStores)).toBe(6)
    const heroes = await to.heroes.list()
    expect(heroes.heroes.map((h) => h.details.name)).toEqual(['Kept'])
    expect((await to.games.list()).games).toHaveLength(2)
    expect(await to.joined.list()).toHaveLength(1)
  })

  it('never overwrites a game it can\'t read when adding, and replacing removes it', async () => {
    const contents = await readEverything((await filled()) as DataStores, DEFAULT_SETTINGS)
    const to = stores()
    await plantUnreadable(to.games, 'g1', { name: 'Old' })
    await restoreAdd(contents, to as DataStores)
    expect((await to.games.list()).unreadable.map((u) => u.id)).toEqual(['g1'])
    await to.heroes.save({ ...completeHero(), id: 'other' })
    await restoreReplace(contents, to as DataStores)
    expect((await to.games.list()).unreadable).toEqual([])
    expect((await to.games.list()).games.map((g) => g.id).sort()).toContain('g1')
    expect((await to.heroes.list()).heroes.map((h) => h.id)).toEqual(['h1'])
  })
})

describe('the Data section', () => {
  beforeEach(() => vi.mocked(downloadFile).mockClear())

  function page(s: ReturnType<typeof stores>, settings = new MemorySettingsStore(), backupTime?: BackupTimeStore) {
    render(
      <SettingsProvider store={settings}>
        <StoreContext.Provider value={s.heroes}>
          <VillainStoreContext.Provider value={s.villains}>
            <GameStoreContext.Provider value={s.games}>
              <JoinedStoreContext.Provider value={s.joined}>
                <SavedSearchStoreContext.Provider value={s.searches}>
                  <TemplateStoresContext.Provider value={s.templates}>
                    <SettingsPage {...(backupTime ? { backupTime } : {})} />
                  </TemplateStoresContext.Provider>
                </SavedSearchStoreContext.Provider>
              </JoinedStoreContext.Provider>
            </GameStoreContext.Provider>
          </VillainStoreContext.Provider>
        </StoreContext.Provider>
      </SettingsProvider>,
    )
    return settings
  }
  const pick = async (content: string, name = 'backup.json') => {
    const input = screen.getByLabelText('Backup file')
    await userEvent.upload(input, new File([content], name, { type: 'application/json' }))
  }

  it('shows what is here and backs it all up', async () => {
    page(await filled())
    expect(await screen.findByText(/^This device holds 3 library items, 1 game and 1 joined game \(/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    const [name, text] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toMatch(/^scrpg-aid-backup-/)
    expect(readRestoreFile(text as string)).toMatchObject({ ok: true, contents: { joined: [{ id: 'j1' }], settings: {} } })
  })

  it('says when the last backup was, and backing up records it', async () => {
    const s = await filled()
    const saved: string[] = []
    const backupTime = { load: () => new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(), save: (at: string) => void saved.push(at) }
    page(s, new MemorySettingsStore(), backupTime)
    expect(await screen.findByText(/^Saved in this browser only\. Last backup 19 days ago; 3 items changed since\.$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(await screen.findByText(/^Saved in this browser only\. Last backup (?!19 days)/)).toBeInTheDocument()
  })

  it('imports a file, and adds the example hero', async () => {
    const s = stores()
    page(s)
    await screen.findByText(/^This device holds 0 library items/)
    await userEvent.click(screen.getByRole('button', { name: 'Add an example hero' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/hero\/[^/]+$/))
    expect((await s.heroes.list()).heroes).toHaveLength(1)
  })

  it('lists games it can\'t read, and deletes one after asking', async () => {
    const s = stores()
    await plantUnreadable(s.games, 'old', { name: 'Thursday game (old)', updatedAt: '2026-10-31T12:00:00Z' })
    await plantUnreadable(s.games, 'solo-hero-x', { name: 'Maya Reyes' })
    page(s)
    expect(await screen.findByRole('heading', { name: "Games this version can't read" })).toBeInTheDocument()
    expect(screen.getByText('Solo play · Maya Reyes')).toBeInTheDocument()
    expect(screen.getByText('Thursday game (old)').closest('li')).toHaveTextContent('Last changed')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Thursday game (old)' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Thursday game (old)?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Thursday game (old)')).not.toBeInTheDocument())
    expect((await s.games.list()).unreadable.map((u) => u.id)).toEqual(['solo-hero-x'])
  })

  it('hides that list when there are none', async () => {
    page(stores())
    await screen.findByText(/^This device holds 0 library items/)
    expect(screen.queryByRole('heading', { name: "Games this version can't read" })).not.toBeInTheDocument()
  })

  it('refuses a file that is not a backup', async () => {
    page(stores())
    await pick('{"format":"scrpg-hero"}')
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a backup the app can read.")
  })

  it('shows each kind in the backup and already here, adds, and lists what it skipped; settings only if ticked', async () => {
    const contents = await readEverything((await filled()) as DataStores, { ...DEFAULT_SETTINGS, textSize: 'large' })
    const s = stores()
    await s.heroes.save({ ...completeHero(), id: 'h1', details: { ...completeHero().details, name: 'Kept' } })
    const settings = page(s)
    await pick(backupText(contents), 'scrpg-aid-backup-2026-11-05.json')
    const dialog = within(await screen.findByRole('dialog', { name: 'Restore from a backup' }))
    expect(dialog.getByText(/^scrpg-aid-backup-2026-11-05\.json · [\d.]+ (B|KB) · made [A-Z][a-z]{2} \d+$/)).toBeInTheDocument()
    const table = within(await dialog.findByRole('table', { name: "What's in the backup" }))
    const row = (name: string) => within(table.getByRole('rowheader', { name }).closest('tr')!).getAllByRole('cell').map((c) => c.textContent)
    expect(row('Heroes')).toEqual(['1', '1'])
    expect(row('Games')).toEqual(['2', '0'])
    expect(row('Minion, lieutenant, challenge and environment templates')).toEqual(['1', '0'])
    expect(dialog.getByRole('radio', { name: /^Add to what's here/ })).toBeChecked()
    expect(dialog.getByText("Adds 6 items. 1 is already here (same id) and is skipped; they're listed after.")).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Add 6 items' }))
    expect(await screen.findByText(/^Added 6 items from the backup\. Already here, so skipped: /)).toBeInTheDocument()
    expect((await s.heroes.list()).heroes.map((h) => h.details.name)).toEqual(['Kept'])
    expect((await settings.load()).textSize).toBe('normal')
  })

  it('takes the settings when ticked', async () => {
    const contents = await readEverything(stores() as DataStores, { ...DEFAULT_SETTINGS, textSize: 'large' })
    const settings = page(stores())
    await pick(backupText(contents))
    const dialog = within(await screen.findByRole('dialog', { name: 'Restore from a backup' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: "Also use the backup's settings" }))
    await userEvent.click(await dialog.findByRole('button', { name: 'Add 0 items' }))
    await waitFor(async () => expect((await settings.load()).textSize).toBe('large'))
  })

  it('replaces everything only after a second step naming what goes, with Back and Back up first', async () => {
    const contents = await readEverything((await filled()) as DataStores, DEFAULT_SETTINGS)
    const s = stores()
    await s.heroes.save({ ...completeHero(), id: 'other', details: { ...completeHero().details, name: 'Redline' } })
    page(s)
    await pick(backupText(contents))
    const dialog = within(await screen.findByRole('dialog', { name: 'Restore from a backup' }))
    await userEvent.click(dialog.getByRole('radio', { name: /^Replace everything/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Replace…' }))
    const sure = within(screen.getByRole('dialog', { name: 'Replace everything on this device?' }))
    expect(await sure.findByText("This deletes 1 library item on this device, including 1 hero that isn't in the backup: Redline. It can't be undone.")).toBeInTheDocument()
    await userEvent.click(sure.getByRole('button', { name: 'Back up first' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    await userEvent.click(sure.getByRole('button', { name: 'Back' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Restore from a backup' })).getByRole('button', { name: 'Replace…' }))
    expect((await s.heroes.list()).heroes.map((h) => h.id)).toEqual(['other'])
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Replace everything on this device?' })).getByRole('button', { name: 'Replace everything' }))
    expect(await screen.findByText('Replaced everything on this device with the backup.')).toBeInTheDocument()
    expect((await s.heroes.list()).heroes.map((h) => h.id)).toEqual(['h1'])
  })

  it('on a phone: a full-screen sheet, with the kinds as a list', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      const contents = await readEverything((await filled()) as DataStores, DEFAULT_SETTINGS)
      page(stores())
      await pick(backupText(contents))
      const dialog = await screen.findByRole('dialog', { name: 'Restore from a backup' })
      expect(dialog).toHaveClass('modal--wide')
      const list = within(await within(dialog).findByRole('list', { name: "What's in the backup" }))
      expect(list.getByText('Heroes').parentElement).toHaveTextContent('Heroes1 in the backup · 0 already here')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
