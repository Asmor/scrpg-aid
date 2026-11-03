/**
 * A player at the table (docs/design/game-table/spec.md, sections 7, 8, 10, 11 and 14): the shared
 * center, drawn from the projection the GM's device sent (the same component the GM sees, with no
 * GM controls), and the player's own panel on the game's copy of their hero.
 *
 * - "Your turn" bar with Hand off to… while the player's hero is acting.
 * - Banners while the GM is unreachable: reconnecting (actions paused), then the offline view
 *   (read-only, as of the last state, with Try to reconnect).
 * - On joining, a once-per-game note about the game's copy; when the library sheet has changed,
 *   the prompt to ask the GM to update it.
 * - Toasts for rejected actions, actions that didn't reach the GM, and the GM's answer to a
 *   sheet update request.
 */
import { useEffect, useRef, useState } from 'react'
import { gamesPath, heroPath, joinPath, navigate } from '../app/route'
import { useStore } from '../app/store-context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { HeroSheetView } from '../components/HeroSheetView'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, isDraft, type Hero } from '../hero/model'
import { PopoverGroup, type MenuItem } from '../library/Popover'
import { useTick } from '../play/useTick'
import type { ClientSnapshot, Notice } from '../session/client'
import { usePlayingSnapshot, useSession } from '../session/context'
import type { HeroAction } from './actions'
import { gameDisplayName } from './model'
import { heroOnTableName, viewName, type HeroOnTable, type TableView } from './project'
import { PlayerPanel } from './PlayerPanel'
import { healthLine, reconcile } from './reconcile'
import { sheetDiff, type DiffSection } from './sheet-diff'
import { roundOver, sameActor, waiting } from './table'
import { MenuButton, TableCenter, type HeroView } from './TableCenter'
import { heroView, villainView } from './views'

const REFUSED: Record<NonNullable<ClientSnapshot['refused']>, string> = {
  removed: 'The GM removed you from this game.',
  full: 'This game is full.',
  taken: "Your hero is being played in this game on another device. Leave the game there, or ask the GM, then try again.",
  version: "This game's GM is on a newer version of the app. Reload this page to update.",
  oldHost: "This game's GM is on an older version of the app. Ask them to reload their page to update.",
}

/** "Your sheet for Maya Reyes has changed" (section 8): the changes, the line on play state, and Ask or Keep. */
function SheetChanged({ name, changes, inGame, onAsk, onKeep }: { name: string; changes: readonly DiffSection[]; inGame: readonly string[]; onAsk: () => void; onKeep: () => void }) {
  return (
    <Modal title={`Your sheet for ${name} has changed`} onClose={onKeep}>
      <p className="gt-sub">Since {name} joined this game:</p>
      <dl className="gt-diff">
        {changes.map((c) => (
          <div key={c.section}>
            <dt>{c.section}</dt>
            {c.changes.map((line) => (
              <dd key={line}>{line}</dd>
            ))}
          </div>
        ))}
      </dl>
      <p>If the GM approves, the game's copy gets your new sheet and keeps what's happened in play: {inGame.join(' ')}</p>
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onKeep}>
          Keep the game's copy
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            onAsk()
            onKeep()
          }}
        >
          Ask the GM to update
        </button>
      </div>
    </Modal>
  )
}

function Toasts({ notices, onDismiss, onRetry }: { notices: readonly Notice[]; onDismiss: (id: string) => void; onRetry: (id: string) => void }) {
  if (!notices.length) return null
  return (
    <div className="gt-toasts" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`toast${n.kind === 'rejected' || n.kind === 'unreachable' ? ' toast--warn' : ''}`}>
          <span>
            {n.text}
            {n.adjustments?.length ? ` ${n.adjustments.join(' ')}` : ''}
          </span>
          {n.retry && (
            <button type="button" className="button button--small" onClick={() => onRetry(n.retry!)}>
              Try again
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** The changes between the game's copy and the library sheet, and what an update would do in this game. */
function sheetChange(copy: HeroOnTable, library: Hero) {
  const changes = sheetDiff(copy.sheet, library)
  if (!changes.length) return undefined
  const { adjustments } = reconcile(copy.play, library, copy.sheet)
  const line = healthLine(copy.play, buildSheet(copy.sheet).maxHealth, adjustments)
  return { changes, inGame: adjustments.length ? adjustments : line ? [line] : ['Nothing else changes.'] }
}

export function PlayerTable({ room, random }: { room: string; random?: () => number }) {
  const session = useSession()
  const heroStore = useStore()
  const client = session.playing?.info.room === room ? session.playing : undefined
  const snap = usePlayingSnapshot(client)
  const now = useTick()
  const phone = useMediaQuery('(max-width: 759px)', false)
  const [library, setLibrary] = useState<Hero | undefined>()
  // The sheet-changed prompt: shown by itself once on joining (when the sheet changed), or from the panel's ⋯.
  const [prompt, setPrompt] = useState<'auto' | 'shown' | 'done'>('auto')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [noteHidden, setNoteHidden] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [askFirst, setAskFirst] = useState(false)
  const lastTurn = useRef<{ mine: boolean; reactionUsed: boolean } | undefined>(undefined)
  const [reactionBack, setReactionBack] = useState(false)

  // The player's library sheet, to see whether it changed since joining.
  const sourceId = client?.info.heroSourceId
  useEffect(() => {
    if (!sourceId) return
    let live = true
    heroStore.get(sourceId).then(
      (r) => live && setLibrary(r.status === 'found' && !isDraft(r.hero) ? r.hero : undefined),
      () => {},
    )
    return () => {
      live = false
    }
  }, [heroStore, sourceId])

  // After a reload, the game as cached on this device, until the GM answers.
  const joinedStore = useOptionalJoinedStore()
  const needsCache = Boolean(client && !snap?.received)
  useEffect(() => {
    if (!client || !needsCache || !joinedStore) return
    let live = true
    joinedStore.list().then(
      (list) => {
        const j = list.find((x) => x.room === room && x.heroSourceId === client.info.heroSourceId)
        if (live && j) client.showCached({ room: j.room, version: j.version, table: j.table, gm: j.gm, you: { heroId: j.heroId, since: j.since }, at: j.updatedAt })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [client, needsCache, joinedStore, room])

  const received = snap?.received
  const table: TableView | undefined = received?.table
  const heroId = received?.you?.heroId
  const copy = table?.heroes.find((h) => h.id === heroId)
  const live = snap?.status === 'live'
  const mine = Boolean(heroId && table && sameActor(table.turn.current, { kind: 'hero', id: heroId }))

  // "Your turn", and "Your reaction is ready again" when the turn starting just cleared it.
  useEffect(() => {
    if (!copy) return
    const before = lastTurn.current
    lastTurn.current = { mine, reactionUsed: copy.play.reactionUsed }
    if (mine && !before?.mine) {
      const back = Boolean(before?.reactionUsed && !copy.play.reactionUsed)
      setReactionBack(back)
      setAnnounce(back ? 'Your turn. Your reaction is ready again.' : 'Your turn.')
    }
    if (!mine) setReactionBack(false)
  }, [mine, copy])

  // On joining or rejoining: if the library sheet has changed, offer to ask the GM to update the game's copy.
  const change = copy && library ? sheetChange(copy, library) : undefined
  const prompting = Boolean(change) && (prompt === 'shown' || (prompt === 'auto' && live && !snap?.syncWaiting))

  if (!client) {
    return (
      <div className="app-main">
        <p>
          <a href={gamesPath}>← Games</a>
        </p>
        <p>
          You're not in game {room} on this device. <a href={joinPath(room)}>Join it</a>.
        </p>
      </div>
    )
  }

  const status = snap?.status ?? 'connecting'
  const act = (action: HeroAction) => {
    client.act(action)
  }
  const heroes: HeroView[] = table ? table.heroes.map((h) => heroView(h, table)) : []
  const villains = table ? table.villains.map(villainView) : []
  const name = (ref: Parameters<typeof viewName>[1]) => (table ? viewName(table, ref, heroOnTableName) : '')
  const heroName = copy ? heroDisplayName(copy.sheet) : 'your hero'
  const gameName = table ? gameDisplayName(table) : `Game ${room}`
  const noteKey = table && heroId ? `${table.id}:${heroId}` : undefined
  const showNote = Boolean(noteKey && live && !noteHidden && !session.noteSeen(noteKey))
  const asOf = received ? new Date(received.at).toLocaleString(undefined, { weekday: undefined, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : undefined

  const menu: MenuItem[] = [
    {
      label: 'Update from my sheet…',
      onSelect: () => {
        if (!live) return
        if (change) setPrompt('shown')
        else setAnnounce("Your library sheet hasn't changed: the game's copy already matches it.")
      },
    },
    { label: 'Open my library sheet', href: heroPath(client.info.heroSourceId), onSelect: () => {} },
    {
      label: 'Leave game',
      onSelect: () => {
        session.leaveGame()
        navigate(gamesPath)
      },
    },
  ]

  const handOff = () => {
    if (!table) return []
    if (roundOver(table)) return [{ label: `End round; start round ${table.round + 1}`, onSelect: () => setAskFirst(true) }]
    return waiting(table).map((ref) => ({ label: name(ref), onSelect: () => act({ kind: 'handOff', to: ref }) }))
  }

  const banner =
    status === 'refused' ? (
      <p role="alert" className="gt-banner gt-banner--error">
        {REFUSED[snap!.refused ?? 'removed']}
      </p>
    ) : status === 'reconnecting' ? (
      <p role="status" className="gt-banner">
        Reconnecting to the GM… Actions are paused.
      </p>
    ) : (status === 'offline' || status === 'connecting') && received ? (
      <div role="status" className="gt-banner">
        <p>
          <strong>The GM isn't connected.</strong> This is {gameName} as of {asOf}. Read-only until the GM is back.
        </p>
        <button type="button" className="button button--small" onClick={() => client.reconnect()}>
          Try to reconnect
        </button>
        <span className="gt-sub"> Tries every 30 seconds.</span>
      </div>
    ) : status === 'offline' ? (
      <div role="status" className="gt-banner">
        <p>Can't reach the GM. Check the code, and that the GM is hosting.</p>
        <button type="button" className="button button--small" onClick={() => client.reconnect()}>
          Try to reconnect
        </button>
      </div>
    ) : null

  return (
    <PopoverGroup>
      <div className={phone ? 'gt-page gt-page--phone' : 'gt-page'}>
        <header className="app-header gt-header">
          <a className="button button--quiet button--small" href={gamesPath}>
            ← Games
          </a>
          <h1 className="gt-title">{gameName}</h1>
          <span className="gt-pill">Playing as {heroName}</span>
          {table && <span className="gt-sub">{table.heroes.filter((h) => h.player).length === 1 ? '1 player' : `${table.heroes.filter((h) => h.player).length} players`}</span>}
          {received && <span className="gt-sub">GM: {received.gm}</span>}
        </header>
        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>
        {mine && live && (
          <div className="gt-yourturn" role="region" aria-label="Your turn">
            <strong>Your turn</strong>
            {reactionBack && <span className="gt-sub">Your reaction is ready again</span>}
            <span className="gt-grow" />
            <MenuButton label="Hand off to" text="Hand off to…" items={handOff()} sheets={phone} />
          </div>
        )}
        {banner}
        {!table ? (
          <p className="app-main">{status === 'refused' ? null : `Connecting to game ${room}…`}</p>
        ) : (
          <div className="gt-layout">
            <TableCenter game={table} heroes={heroes} villains={villains} now={now} />
            {copy && (
              <PlayerPanel
                hero={copy}
                view={table}
                pending={snap?.pending ?? []}
                live={live}
                syncWaiting={snap?.syncWaiting ?? false}
                act={act}
                menu={menu}
                onCancelSync={() => client.cancelSync()}
                onOpenSheet={() => setSheetOpen(true)}
                {...(showNote && noteKey
                  ? {
                      note: {
                        gameName,
                        dismiss: () => {
                          session.markNoteSeen(noteKey)
                          setNoteHidden(true)
                        },
                      },
                    }
                  : {})}
                random={random}
              />
            )}
          </div>
        )}
      </div>
      {prompting && change && copy && (
        <SheetChanged name={heroName} changes={change.changes} inGame={change.inGame} onAsk={() => library && client.requestSync(library)} onKeep={() => setPrompt('done')} />
      )}
      {sheetOpen && copy && (
        <Modal title={`${heroName} · the game's copy`} onClose={() => setSheetOpen(false)}>
          <HeroSheetView hero={copy.sheet} interactive={false} />
        </Modal>
      )}
      {askFirst && table && (
        <Modal title={`Who starts round ${table.round + 1}?`} onClose={() => setAskFirst(false)}>
          <p className="hint">Anyone can start the new round, including whoever acted last.</p>
          <div className="gt-choices">
            {table.turn.order.map((ref) => (
              <button
                key={`${ref.kind}:${ref.id}`}
                type="button"
                className="button"
                onClick={() => {
                  setAskFirst(false)
                  act({ kind: 'startRound', first: ref })
                }}
              >
                {name(ref)}
              </button>
            ))}
          </div>
        </Modal>
      )}
      <Toasts notices={snap?.notices ?? []} onDismiss={(id) => client.dismiss(id)} onRetry={(id) => client.retry(id)} />
    </PopoverGroup>
  )
}
