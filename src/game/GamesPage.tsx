/**
 * The Games page (docs/design/game-table/spec.md, section 3; `#/games`): games aren't library
 * rows, so they're listed here as cards, reached from the header's Library | Games tabs. Phase 1
 * has the games you run; players' cached joined games come with hosting (Phase 2). Solo games
 * belong to their characters' Play pages and aren't listed.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { gamePath, joinPath, navigate } from '../app/route'
import { useGameStore } from '../app/game-store-context'
import { useStore } from '../app/store-context'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { heroDisplayName } from '../hero/model'
import { DeleteDialog } from '../library/LibraryPage'
import { LibraryHeader } from '../library/LibraryHeader'
import { PopoverGroup } from '../library/Popover'
import { ItemTags } from '../library/TagControls'
import { allTags, withoutTag, withTag } from '../library/tags'
import { formatAgo } from '../library/when'
import { formatFull } from '../play/time'
import { useTick } from '../play/useTick'
import type { ThemePreference } from '../theme/theme'
import { downloadFile } from '../transfer/download'
import { gameFileName, gameJson } from '../transfer/files'
import { createGame, duplicateGame, gameDisplayName, isListedGame, sceneDisplayName, type Game } from './model'
import { oppositionText, sceneLine } from './summary'
import { MenuButton, Tracker } from './TableCenter'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function GameCard({ game, now, actions }: { game: Game; now: Date; actions: CardActions }) {
  const id = useId()
  const name = gameDisplayName(game)
  const opposition = oppositionText(game)
  const when = `${game.round > 0 ? 'Played' : 'Edited'} ${formatAgo(game.updatedAt, now).replace(/^./, (c) => c.toLowerCase())}`
  return (
    <article className="card games-card" aria-labelledby={`${id}-name`}>
      <div className="gt-row">
        <h3 id={`${id}-name`} className="gt-grow games-card__name">
          {name}
        </h3>
        <span className="gt-pill">{game.round === 0 ? 'Not started' : 'Not hosting'}</span>
      </div>
      <div>
        <div className="gt-row">
          <strong>{sceneDisplayName(game)}</strong>
          <span className="gt-sub">· {sceneLine(game)}</span>
        </div>
        <Tracker game={game} />
      </div>
      <div>
        <div className="gt-label">Heroes</div>
        {game.heroes.length === 0 ? (
          <p className="gt-sub">No one has joined yet.</p>
        ) : (
          <ul className="games-card__who">
            {game.heroes.map((h) => (
              <li key={h.id} className="games-who">
                {heroDisplayName(h.sheet)} <span className="gt-sub">{h.player?.name ?? 'GM'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {opposition && (
        <div>
          <div className="gt-label">Opposition</div>
          <p className="games-card__opp">
            {opposition.names}
            {opposition.hidden && <span className="gt-sub"> · {opposition.hidden}</span>}
          </p>
        </div>
      )}
      {game.tags.length > 0 && (
        <ul className="games-card__tags" aria-label={`Tags on ${name}`}>
          {game.tags.map((t) => (
            <li key={t} className="tag">
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="games-card__foot">
        <time className="gt-sub gt-grow" dateTime={game.updatedAt} title={formatFull(game.updatedAt)}>
          {when}
        </time>
        <a className="button button--primary button--small" href={gamePath(game.id)} aria-label={`Run ${name}`}>
          Run
        </a>
        <MenuButton
          label={`More actions for ${name}`}
          sheets={false}
          items={[
            { label: 'Rename', onSelect: () => actions.rename(game) },
            { label: 'Tags', onSelect: () => actions.tags(game) },
            { label: 'Duplicate', onSelect: () => actions.duplicate(game) },
            { label: 'Export', onSelect: () => actions.exportGame(game) },
            { label: 'Delete…', danger: true, onSelect: () => actions.remove(game) },
          ]}
        />
      </div>
    </article>
  )
}

interface CardActions {
  rename: (game: Game) => void
  tags: (game: Game) => void
  duplicate: (game: Game) => void
  exportGame: (game: Game) => void
  remove: (game: Game) => void
}

function RenameDialog({ game, onSave, onClose }: { game: Game; onSave: (name: string) => void; onClose: () => void }) {
  const id = useId()
  const [name, setName] = useState(game.name)
  return (
    <Modal title={`Rename ${gameDisplayName(game)}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(name.trim())
          onClose()
        }}
      >
        <label className="field" htmlFor={`${id}-name`}>
          <span>Game name</span>
          <input id={`${id}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="button-row">
          <button type="submit" className="button button--primary">
            Save
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

type Dialog = { kind: 'rename' | 'tags' | 'delete'; id: string }

export function GamesPage({ theme, setTheme }: { theme: ThemePreference; setTheme: (t: ThemePreference) => void }) {
  const store = useGameStore()
  const heroStore = useStore()
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const now = useTick()
  const [games, setGames] = useState<Game[] | null>(null)
  const [heroNames, setHeroNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    store.list().then(
      (list) => live && setGames(list.games.filter(isListedGame)),
      (e: unknown) => live && setError(`Couldn't read your games: ${errorText(e)}`),
    )
    // For Play together's "You're in … as Maya Reyes".
    heroStore.list().then(
      (list) => live && setHeroNames(new Map(list.heroes.map((h) => [h.id, heroDisplayName(h)]))),
      () => {},
    )
    return () => {
      live = false
    }
  }, [store, heroStore])

  const sorted = useMemo(() => [...(games ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [games])
  const needle = text.trim().toLocaleLowerCase()
  const shown = needle ? sorted.filter((g) => gameDisplayName(g).toLocaleLowerCase().includes(needle)) : sorted
  const tags = useMemo(() => allTags(games ?? []), [games])
  const find = (id: string) => games?.find((g) => g.id === id)

  const run = async (what: string, action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(`Couldn't ${what}: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }
  /** Saves a changed game and shows it. */
  const save = (game: Game) => run('save the game', async () => {
    await store.save(game)
    setGames((list) => [...(list ?? []).filter((g) => g.id !== game.id), game])
  })
  const change = (id: string, fn: (g: Game) => Game) => {
    const game = find(id)
    if (!game) return
    const next = fn(game)
    if (next !== game) void save({ ...next, updatedAt: new Date().toISOString() })
  }
  const newGame = () =>
    void run('start a new game', async () => {
      const game = createGame()
      await store.save(game)
      navigate(gamePath(game.id))
    })
  const actions: CardActions = {
    rename: (g) => setDialog({ kind: 'rename', id: g.id }),
    tags: (g) => setDialog({ kind: 'tags', id: g.id }),
    duplicate: (g) => void save(duplicateGame(g)),
    exportGame: (g) => {
      try {
        downloadFile(gameFileName(g, 'json'), gameJson(g), 'application/json')
      } catch (e) {
        setError(`Couldn't export: ${errorText(e)}`)
      }
    },
    remove: (g) => setDialog({ kind: 'delete', id: g.id }),
  }
  const open = dialog ? find(dialog.id) : undefined

  return (
    <PopoverGroup>
      <div className="library">
        <LibraryHeader phone={phone} theme={theme} setTheme={setTheme} heroName={(id) => heroNames.get(id)} now={now} section="games" {...(games ? { gameCount: games.length } : {})} />
        <main className="games-page">
          <div className="games-page__title">
            <h1>Games</h1>
            <span className="gt-grow" />
            {games !== null && games.length > 0 && <input type="search" className="gt-search games-page__search" aria-label="Search games" placeholder="Search games" value={text} onChange={(e) => setText(e.target.value)} />}
            <button type="button" className="button button--primary" disabled={busy} onClick={newGame}>
              New game
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {games === null && !error && <p>Loading your games…</p>}
          {games !== null && games.length === 0 && (
            <div className="card library-empty">
              <h2>No games yet</h2>
              <p>A game holds one table: the scene, the turn order, and copies of the heroes and villains in it. Start one to set up a scene, or join someone else's.</p>
              <div className="button-row">
                <button type="button" className="button button--primary" disabled={busy} onClick={newGame}>
                  New game
                </button>
                <a className="button" href={joinPath()}>
                  Join as a player
                </a>
              </div>
            </div>
          )}
          {games !== null && games.length > 0 && (
            <section aria-labelledby="games-run">
              <h2 id="games-run" className="games-page__section">
                You run
              </h2>
              {shown.length === 0 && <p className="sheet-empty">No games match your search.</p>}
              <div className="games-grid">
                {shown.map((g) => (
                  <GameCard key={g.id} game={g} now={now} actions={actions} />
                ))}
                <button type="button" className="games-new" disabled={busy} onClick={newGame}>
                  <strong>New game</strong>
                  <span className="gt-sub">Set up a scene and bring in villains.</span>
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
      {dialog?.kind === 'rename' && open && <RenameDialog game={open} onSave={(name) => change(open.id, (g) => (g.name === name ? g : { ...g, name }))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'tags' && open && (
        <Modal title={`Tags on ${gameDisplayName(open)}`} onClose={() => setDialog(null)}>
          <p className="hint">Tags organize your games, by campaign for example.</p>
          <ItemTags tags={open.tags} itemName={gameDisplayName(open)} allTags={tags} onAdd={(t) => change(open.id, (g) => ({ ...g, tags: withTag(g.tags, t) }))} onRemove={(t) => change(open.id, (g) => ({ ...g, tags: withoutTag(g.tags, t) }))} />
          <div className="button-row">
            <button type="button" className="button" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'delete' && open && (
        <DeleteDialog
          names={[gameDisplayName(open)]}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            void run('delete the game', async () => {
              await store.remove(open.id)
              setGames((list) => (list ?? []).filter((g) => g.id !== open.id))
              setDialog(null)
            })
          }
        />
      )}
    </PopoverGroup>
  )
}
