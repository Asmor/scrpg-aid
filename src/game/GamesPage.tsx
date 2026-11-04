/**
 * The Games page (docs/design/game-table/spec.md, section 3; `#/games`): games aren't library
 * rows, so they're listed here as cards, reached from the header's Library | Games tabs. Phase 1
 * has the games you run; players' cached joined games come with hosting (Phase 2). Solo games
 * belong to their characters' Play pages and aren't listed.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { gamePath, joinPath, navigate, tablePath } from '../app/route'
import { useGameStore } from '../app/game-store-context'
import { useStore } from '../app/store-context'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { useVillainStore } from '../app/villain-store-context'
import { useHostSnapshot, usePlayingSnapshot, useSession } from '../session/context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { receivedFrom, type JoinedGame } from './joined-store'
import { JoinedCard } from './JoinedCard'
import { InviteDialog, StartHostingDialog } from './hosting'
import { ConfirmDialog } from './dialogs'
import { heroDisplayName } from '../hero/model'
import { localBackupTime, type BackupTimeStore } from '../library/backup-time'
import type { LibraryStores } from '../library/registry'
import { useOptionalTemplateStores } from '../app/template-store-context'
import type { SavedSearchStore } from '../library/saved-searches'
import { useDataMenu } from '../library/useDataMenu'
import { itemKey, useLibraryData } from '../library/useLibraryData'
import { DeleteDialog } from '../library/LibraryPage'
import { SearchIcon } from '../library/DesktopLibrary'
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
import { duplicateGame } from './scenes'
import { createGame, currentScene, gameDisplayName, isListedGame, sceneName, sceneOnTable, type Game } from './model'
import { oppositionText, sceneLine } from './summary'
import { MenuButton, Tracker } from './TableCenter'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function GameCard({ game, now, actions, hosting }: { game: Game; now: Date; actions: CardActions; hosting?: { connected: number } }) {
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
        {hosting ? (
          <span className="gt-pill gt-pill--live">
            <span className="gt-live-dot" aria-hidden="true" />
            Hosting · {hosting.connected} connected
          </span>
        ) : (
          <span className="gt-pill">{game.round === 0 ? 'Not started' : 'Not hosting'}</span>
        )}
      </div>
      <div>
        <div className="gt-row">
          <strong>{sceneName(currentScene(game))}</strong>
          <span className="gt-sub">· {sceneLine(game)}</span>
        </div>
        <Tracker game={{ scene: sceneOnTable(game) }} />
      </div>
      <div>
        <div className="gt-label">Heroes</div>
        {game.heroes.length === 0 ? (
          <p className="gt-sub">No one has joined yet.</p>
        ) : (
          <ul className="games-card__who">
            {game.heroes.map((h) => (
              <li key={h.id} className="games-who">
                {heroDisplayName(h.sheet)} <span className="gt-sub">{h.player?.name ?? "GM's hero"}</span>
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
        {hosting ? (
          <button type="button" className="button button--small" onClick={() => actions.invite(game)}>
            Invite
          </button>
        ) : (
          <button type="button" className="button button--small" onClick={() => actions.host(game)}>
            Start hosting
          </button>
        )}
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
  host: (game: Game) => void
  invite: (game: Game) => void
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

type Dialog = { kind: 'rename' | 'tags' | 'delete' | 'host' | 'invite' | 'leaveJoined'; id: string }

/** Which games the page shows. */
type Which = 'all' | 'run' | 'joined'

export interface GamesPageProps {
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
  /** For the Data menu: a backup has the saved searches. */
  searchStore: SavedSearchStore
  backupTime?: BackupTimeStore
}

export function GamesPage({ theme, setTheme, searchStore, backupTime }: GamesPageProps) {
  const store = useGameStore()
  const heroStore = useStore()
  const villainStore = useVillainStore()
  const templates = useOptionalTemplateStores()
  const stores: LibraryStores = useMemo(() => ({ heroes: heroStore, villains: villainStore, games: store, ...(templates ? { templates } : {}) }), [heroStore, villainStore, store, templates])
  // The library's items: the Data menu backs them up, and Play together names heroes.
  const library = useLibraryData(stores, searchStore)
  const ready = library.state.status === 'ready' ? library.state : undefined
  const [fallbackTime] = useState(() => backupTime ?? localBackupTime())
  const [loads, setLoads] = useState(0)
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const now = useTick()
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [which, setWhich] = useState<Which>('all')
  // Games joined as a player, cached on this device (section 11).
  const joinedStore = useOptionalJoinedStore()
  const [joined, setJoined] = useState<JoinedGame[]>([])
  useEffect(() => {
    let live = true
    joinedStore?.list().then(
      (list) => live && setJoined(list),
      () => {},
    )
    return () => {
      live = false
    }
  }, [joinedStore, loads])

  // Hosting starting or stopping changes games (a code, the play): read them again then.
  const hostingId = useSession().hosting?.gameId
  useEffect(() => {
    let live = true
    store.list().then(
      (list) => live && setGames(list.games.filter(isListedGame)),
      (e: unknown) => live && setError(`Couldn't read your games: ${errorText(e)}`),
    )
    return () => {
      live = false
    }
  }, [store, loads, hostingId])

  // The hosted game is live in the hosting session: its card shows that, not the list as loaded.
  const session = useSession()
  const hostedSnap = useHostSnapshot(session.hosting)
  const hostedGame = hostedSnap?.game
  const playingSnap = usePlayingSnapshot(session.playing)
  const sorted = useMemo(() => (games ?? []).map((g) => (hostedGame?.id === g.id ? hostedGame : g)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [games, hostedGame])
  const needle = text.trim().toLocaleLowerCase()
  const shown = needle ? sorted.filter((g) => gameDisplayName(g).toLocaleLowerCase().includes(needle)) : sorted
  const joinedShown = joined.filter((j) => !needle || gameDisplayName(j.table).toLocaleLowerCase().includes(needle))
  const isLive = (j: JoinedGame) => session.playing?.info.room === j.room && playingSnap?.status === 'live'
  const openJoined = (j: JoinedGame) => {
    // Rejoin with the cached game, shown read-only until the GM answers.
    if (session.playing?.info.room !== j.room || session.playing.info.heroSourceId !== j.heroSourceId) {
      session.joinGame({ room: j.room, name: j.name, hero: j.sheet, cached: receivedFrom(j) })
    }
    navigate(tablePath(j.room))
  }
  const tags = useMemo(() => allTags(games ?? []), [games])
  const find = (id: string) => sorted.find((g) => g.id === id)

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
    // A game being hosted is held by the hosting session: change it there, so the next change at the table keeps this one.
    if (session.hosting?.gameId === id) return session.hosting.apply(fn)
    // The game as saved now, not as this page loaded it: hosting may have changed it since.
    void run('save the game', async () => {
      const r = await store.get(id)
      if (r.status !== 'found') return
      const next = fn(r.game)
      if (next !== r.game) await save({ ...next, updatedAt: new Date().toISOString() })
    })
  }
  const newGame = () =>
    void run('start a new game', async () => {
      const game = createGame()
      await store.save(game)
      navigate(gamePath(game.id))
    })
  const host = (id: string, name: string) => void session.hostGame(id, name).then((why) => why && setError(why))
  const actions: CardActions = {
    host: (g) => (session.name ? host(g.id, session.name) : setDialog({ kind: 'host', id: g.id })),
    invite: (g) => setDialog({ kind: 'invite', id: g.id }),
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
  const { dataActions, importControl } = useDataMenu({
    stores,
    ready,
    games: games ?? [],
    backupTime: fallbackTime,
    now,
    busy,
    run,
    setError,
    onImported: () => {
      void library.reload()
      setLoads((n) => n + 1)
    },
  })

  return (
    <PopoverGroup>
      <div className="library">
        <LibraryHeader phone={phone} theme={theme} setTheme={setTheme} data={dataActions} heroName={(id) => ready?.items.get(itemKey('hero', id))?.row.name} now={now} section="games" {...(games ? { gameCount: games.length + joined.length } : {})} />
        <main className="games-page">
          {importControl}
          <div className="games-page__title">
            <h1>Games</h1>
            <span className="gt-grow" />
            {games !== null && games.length + joined.length > 0 && (
              <label className="library-search">
                <SearchIcon />
                <input type="search" aria-label="Search games" placeholder="Search games" value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            )}
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
          {games !== null && (games.length > 0 || joined.length > 0) && (
            <div className="segmented" role="group" aria-label="Show">
              {(
                [
                  ['all', 'All'],
                  ['run', 'You run'],
                  ['joined', 'Joined'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={which === value} onClick={() => setWhich(value)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {games !== null && games.length === 0 && joined.length === 0 && (
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
          {games !== null && games.length > 0 && which !== 'joined' && (
            <section aria-labelledby="games-run">
              <h2 id="games-run" className="games-page__section">
                You run
              </h2>
              {shown.length === 0 && <p className="sheet-empty">No games match your search.</p>}
              <div className="games-grid">
                {shown.map((g) => (
                  <GameCard key={g.id} game={g} now={now} actions={actions} {...(session.hosting?.gameId === g.id ? { hosting: { connected: hostedSnap?.connected.size ?? 0 } } : {})} />
                ))}
                <button type="button" className="games-new" disabled={busy} onClick={newGame}>
                  <strong>New game</strong>
                  <span className="gt-sub">Set up a scene and bring in villains.</span>
                </button>
              </div>
            </section>
          )}
          {joined.length > 0 && which !== 'run' && (
            <section aria-labelledby="games-joined">
              <h2 id="games-joined" className="games-page__section">
                Joined
              </h2>
              {joinedShown.length === 0 && <p className="sheet-empty">No games match your search.</p>}
              <div className="games-grid">
                {joinedShown.map((j) => (
                  <JoinedCard key={j.id} joined={j} live={isLive(j)} onOpen={() => openJoined(j)} onRemove={() => setDialog({ kind: 'leaveJoined', id: j.id })} />
                ))}
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
      {dialog?.kind === 'host' && open && <StartHostingDialog name={session.name} onStart={(name) => host(open.id, name)} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'invite' && open && session.hosting?.gameId === open.id && (
        <InviteDialog
          room={session.hosting.room}
          gm={session.hosting.gm}
          onRenameGm={(name) => session.renameGm(name)}
          gameName={gameDisplayName(open)}
          players={open.heroes.filter((h) => h.player)}
          connected={hostedSnap?.connected ?? new Set()}
          onRemove={(hero) => session.hosting?.removePlayer(hero.id)}
          observers={hostedSnap?.observers ?? []}
          onRemoveObserver={(clientId) => session.hosting?.removeObserver(clientId)}
          needsNewCode={hostedSnap?.needsNewCode ?? new Set()}
          onNewCode={(keep) => session.newCode(open.id, keep)}
          onStop={() => session.stopHosting()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'leaveJoined' &&
        (() => {
          const j = joined.find((x) => x.id === dialog.id)
          if (!j) return null
          return (
            <ConfirmDialog
              title={`Leave ${gameDisplayName(j.table)} and remove it from this device?`}
              text="Your hero stays in the GM's game. This device forgets its copy; you can join again with the game's code."
              confirm="Leave and remove"
              onConfirm={() =>
                void run('remove the game', async () => {
                  if (session.playing?.info.room === j.room) session.leaveGame()
                  await joinedStore?.remove(j.id)
                  setJoined((list) => list.filter((x) => x.id !== j.id))
                })
              }
              onClose={() => setDialog(null)}
            />
          )
        })()}
      {dialog?.kind === 'delete' && open && (
        <DeleteDialog
          names={[gameDisplayName(open)]}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            void run('delete the game', async () => {
              // Deleting a hosted game stops hosting it first.
              if (session.hosting?.gameId === open.id) await session.stopHosting()
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
