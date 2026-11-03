/**
 * Importing heroes, villains and games from a file: one of them, a backup of several, or a
 * Markdown or HTML export. When one is already saved (the same id), the player chooses each
 * time whether to replace theirs or keep both.
 */
import { useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { useStore } from '../app/store-context'
import { useOptionalVillainStore } from '../app/villain-store-context'
import { useOptionalSavedSearchStore } from '../app/saved-search-context'
import { useOptionalGameStore } from '../app/game-store-context'
import { useSession } from '../session/context'
import { gameDisplayName, type Game } from '../game/model'
import { searchesToRestore, type SavedSearch } from '../library/saved-searches'
import { heroDisplayName, type Hero } from '../hero/model'
import { conflicts, heroesToSave, readImport, type Resolution, type SkippedHero } from '../transfer/files'
import { villainDisplayName, type Villain } from '../villain/model'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** One already-saved hero, villain or game the import would replace, keyed `hero:<id>`, `villain:<id>` or `game:<id>`. */
interface Conflict {
  key: string
  name: string
  unreadable: boolean
}

/** What the player is asked before the import goes ahead. */
interface Pending {
  heroes: Hero[]
  villains: Villain[]
  games: Game[]
  savedSearches: SavedSearch[]
  skipped: SkippedHero[]
  savedIds: Set<string>
  villainIds: Set<string>
  gameIds: Set<string>
  conflicts: Conflict[]
}

const heroCount = (n: number) => (n === 1 ? 'one hero' : `${n} heroes`)
const villainCount = (n: number) => (n === 1 ? 'one villain' : `${n} villains`)
const gameCount = (n: number) => (n === 1 ? 'one game' : `${n} games`)
/** "2 heroes", "one villain", "2 heroes and one villain", "2 heroes, one villain and one game" */
function count(heroes: number, villains: number, games = 0): string {
  const parts = [heroes ? heroCount(heroes) : '', villains ? villainCount(villains) : '', games ? gameCount(games) : ''].filter(Boolean)
  if (parts.length === 0) return heroCount(0)
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

const KIND_TEXT: Record<SkippedHero['kind'], string> = { hero: 'Hero', villain: 'Villain', game: 'Game', savedSearch: 'Saved search' }

function skippedText(skipped: readonly SkippedHero[]): string {
  return skipped.map((s) => `${KIND_TEXT[s.kind]} ${s.index} in the file couldn't be read: ${s.error}.`).join(' ')
}

const searchCount = (n: number) => (n === 1 ? 'one saved search' : `${n} saved searches`)

const PLURAL = { hero: 'heroes', villain: 'villains', game: 'games' } as const

/** "You already have this hero", "… these villains", or "… these" for a mix. */
function conflictLegend(list: readonly Conflict[]): string {
  const kinds = new Set(list.map((c) => c.key.slice(0, c.key.indexOf(':')) as keyof typeof PLURAL))
  const kind = kinds.size === 1 ? [...kinds][0] : undefined
  if (list.length === 1) return `You already have this ${kind}`
  return kind ? `You already have these ${PLURAL[kind]}` : 'You already have these'
}

/** The choices for one kind, by id. */
const choicesFor = (choices: Readonly<Record<string, Resolution>>, kind: 'hero' | 'villain' | 'game') =>
  Object.fromEntries(Object.entries(choices).flatMap(([key, value]) => (key.startsWith(`${kind}:`) ? [[key.slice(kind.length + 1), value]] : [])))

interface ImportControlProps {
  /** Every saved id, including records that couldn't be read. */
  savedIds: ReadonlySet<string>
  /** Saved records that couldn't be read, so replacing one can say so. */
  unreadableIds: ReadonlySet<string>
  disabled: boolean
  /** Called as saving starts and stops, so the rest of the list can wait. */
  onBusyChange?: (busy: boolean) => void
  onImported: () => void
  /** Other buttons for the same row (the backup). */
  children?: ReactNode
  /** Leaves out the Import button, for a page that opens the file picker from its own control (`ref.open`). */
  hideButton?: boolean
  ref?: Ref<ImportHandle>
}

/** Opens the file picker from elsewhere on the page (the library's Data menu). */
export interface ImportHandle {
  open: () => void
}

export function ImportControl({ savedIds, unreadableIds, disabled, onBusyChange, onImported, children, hideButton = false, ref }: ImportControlProps) {
  const store = useStore()
  const villainStore = useOptionalVillainStore()
  const gameStore = useOptionalGameStore()
  const session = useSession()
  const searchStore = useOptionalSavedSearchStore()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const prompt = useRef<HTMLFieldSetElement>(null)
  // Put focus back on the Import button once it's usable again (it's disabled while busy).
  const returnFocus = useRef(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [choices, setChoices] = useState<Record<string, Resolution>>({})
  const [busy, setBusyState] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const setBusy = (b: boolean) => {
    setBusyState(b)
    onBusyChange?.(b)
  }

  useImperativeHandle(ref, () => ({ open: () => input.current?.click() }), [])
  useEffect(() => {
    if (pending) prompt.current?.focus()
  }, [pending])
  useEffect(() => {
    if (returnFocus.current && button.current && !button.current.disabled) {
      button.current.focus()
      returnFocus.current = false
    }
  })

  const close = () => {
    setPending(null)
    returnFocus.current = true
  }

  const finish = async (p: Pending, chosen: Readonly<Record<string, Resolution>>) => {
    setBusy(true)
    let heroes = 0
    let villains = 0
    let games = 0
    try {
      for (const hero of heroesToSave(p.heroes, p.savedIds, choicesFor(chosen, 'hero'))) {
        await store.save(hero)
        heroes++
      }
      for (const villain of heroesToSave(p.villains, p.villainIds, choicesFor(chosen, 'villain'))) {
        await villainStore!.save(villain)
        villains++
      }
      for (const game of heroesToSave(p.games, p.gameIds, choicesFor(chosen, 'game'))) {
        // The game being hosted is held by the hosting session: replace it there, or its next save would undo the import.
        if (session.hosting?.gameId === game.id) session.hosting.apply(() => game)
        else await gameStore!.save(game)
        games++
      }
      // A backup's saved searches come back too (docs/design/library/spec.md, "Saved searches").
      let searches = 0
      if (searchStore && p.savedSearches.length) {
        for (const search of searchesToRestore(p.savedSearches, (await searchStore.list()).searches)) {
          await searchStore.save(search)
          searches++
        }
      }
      const items = heroes + villains + games ? count(heroes, villains, games) : ''
      const imported = [items, searches ? searchCount(searches) : ''].filter(Boolean).join(' and ') || count(0, 0)
      setMessage({ error: false, text: [`Imported ${imported}.`, skippedText(p.skipped)].filter(Boolean).join(' ') })
    } catch (e) {
      setMessage({ error: true, text: `The import stopped after ${count(heroes, villains, games)} of ${count(p.heroes.length, p.villains.length, p.games.length)}: ${errorText(e)}` })
    } finally {
      close()
      setBusy(false)
      onImported()
    }
  }

  const read = async (file: File) => {
    setMessage(null)
    let text: string
    try {
      text = await file.text()
    } catch (e) {
      setMessage({ error: true, text: `Couldn't read ${file.name}: ${errorText(e)}` })
      return
    }
    const result = readImport(text)
    if (!result.ok) {
      setMessage({ error: true, text: result.error })
      return
    }
    if (result.heroes.length === 0 && result.villains.length === 0 && result.games.length === 0 && (result.savedSearches.length === 0 || !searchStore)) {
      setMessage({ error: true, text: ['There are no heroes, villains or games in this file to import.', skippedText(result.skipped)].filter(Boolean).join(' ') })
      return
    }
    if (result.villains.length && !villainStore) {
      setMessage({ error: true, text: "Villains can't be imported here." })
      return
    }
    if (result.games.length && !gameStore) {
      setMessage({ error: true, text: "Games can't be imported here." })
      return
    }
    const ids = new Set(savedIds)
    let villainIds = new Set<string>()
    let unreadableVillains = new Set<string>()
    if (result.villains.length) {
      try {
        const list = await villainStore!.list()
        villainIds = new Set([...list.villains.map((v) => v.id), ...list.unreadable.map((u) => u.id)])
        unreadableVillains = new Set(list.unreadable.map((u) => u.id))
      } catch (e) {
        setMessage({ error: true, text: `Couldn't check your saved villains: ${errorText(e)}` })
        return
      }
    }
    let gameIds = new Set<string>()
    let unreadableGames = new Set<string>()
    if (result.games.length) {
      try {
        const list = await gameStore!.list()
        gameIds = new Set([...list.games.map((g) => g.id), ...list.unreadable.map((u) => u.id)])
        unreadableGames = new Set(list.unreadable.map((u) => u.id))
      } catch (e) {
        setMessage({ error: true, text: `Couldn't check your saved games: ${errorText(e)}` })
        return
      }
    }
    const p: Pending = {
      heroes: result.heroes,
      villains: result.villains,
      games: result.games,
      savedSearches: result.savedSearches,
      skipped: result.skipped,
      savedIds: ids,
      villainIds,
      gameIds,
      conflicts: [
        ...conflicts(result.heroes, ids).map((h) => ({ key: `hero:${h.id}`, name: heroDisplayName(h), unreadable: unreadableIds.has(h.id) })),
        ...conflicts(result.villains, villainIds).map((v) => ({ key: `villain:${v.id}`, name: villainDisplayName(v), unreadable: unreadableVillains.has(v.id) })),
        ...conflicts(result.games, gameIds).map((g) => ({ key: `game:${g.id}`, name: gameDisplayName(g), unreadable: unreadableGames.has(g.id) })),
      ],
    }
    if (p.conflicts.length === 0) {
      await finish(p, {})
      return
    }
    // Keeping both is the choice that loses nothing, so it's selected to start with.
    setChoices(Object.fromEntries(p.conflicts.map((c) => [c.key, 'copy' as const])))
    setPending(p)
  }

  return (
    <div className="import-control">
      <input
        ref={input}
        type="file"
        accept=".json,.md,.markdown,.html,.htm,application/json,text/markdown,text/html"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Clear it so choosing the same file again still imports it.
          e.target.value = ''
          if (file) void read(file)
        }}
      />
      {!hideButton && (
        <div className="button-row">
          <button ref={button} type="button" className="button" disabled={disabled || busy || pending !== null} onClick={() => input.current?.click()}>
            Import from a file…
          </button>
          {children}
        </div>
      )}

      {/* Always present, so screen readers announce the text when it changes. */}
      <p role="status">{message && !message.error ? message.text : ''}</p>
      {message?.error && (
        <p role="alert" className="error">
          {message.text}
        </p>
      )}

      {pending && (
        <fieldset ref={prompt} tabIndex={-1} className="import-conflicts">
          <legend>{conflictLegend(pending.conflicts)}</legend>
          <p className="hint">Replace yours with the imported one, or keep both (the imported one is added as a copy).</p>
          {pending.conflicts.map((c) => (
            <div key={c.key} role="radiogroup" aria-label={c.name} className="import-conflict">
              <span className="import-conflict__name">
                {c.name}
                {c.unreadable && <span className="choice__note"> (your saved copy couldn't be read)</span>}
              </span>
              {(
                [
                  ['replace', 'Replace mine'],
                  ['copy', 'Keep both'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="checkbox">
                  <input type="radio" name={`${id}-${c.key}`} checked={choices[c.key] === value} onChange={() => setChoices((all) => ({ ...all, [c.key]: value }))} />
                  {label}
                </label>
              ))}
            </div>
          ))}
          <div className="button-row">
            <button type="button" className="button button--primary" disabled={busy} onClick={() => void finish(pending, choices)}>
              Import {count(pending.heroes.length, pending.villains.length, pending.games.length)}
            </button>
            <button type="button" className="button" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
    </div>
  )
}
