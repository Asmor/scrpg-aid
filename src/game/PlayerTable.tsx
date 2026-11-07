/**
 * A player at the table (scrpg-aid-designs/game-table/spec.md, sections 7, 8, 10, 11 and 14): the shared
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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { advancementPath, gamesPath, heroPath, joinPath, navigate, tablePath } from '../app/route'
import { useStore } from '../app/store-context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { receivedFrom, setIssuePrompt, type IssuePrompts, type JoinedGame } from './joined-store'
import { addOfferedIssue, holdsIssue } from '../advancement/records'
import { BackIssuePrompt } from './BackIssuePrompt'
import { useNotTyping } from './useNotTyping'
import { issueToPrompt, offeredIssues } from './issues'
import { HeroSheetView } from '../components/HeroSheetView'
import { Modal } from '../components/Modal'
import { Toasts, type ToastData } from '../components/Toasts'
import { useMediaQuery } from '../components/useMediaQuery'
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, isDraft, newId, type Hero } from '../hero/model'
import { PopoverGroup, type MenuItem } from '../library/Popover'
import { useTick } from '../play/useTick'
import type { Notice } from '../session/client'
import { normalizeRoomCode } from '../session/code'
import { usePlayingSnapshot, useSession } from '../session/context'
import { refusedText } from '../session/refused'
import type { HeroAction } from './actions'
import { betweenIssues, gameDisplayName, issueTitle, nextIssueNumber, sceneDisplayName } from './model'
import { heroPointsLeft } from '../play/state'
import { playerAlerts, type PlayerWatch } from '../settings/alerts'
import { useAlerts } from '../settings/useAlerts'
import { HERO_POINTS_ID } from './HeroPointsCard'
import { finishedPill } from './summary'
import { heroOnTableName, viewName, type HeroOnTable, type IssueOnTable, type TableView } from './project'
import { PlayerPanel } from './PlayerPanel'
import { healthLine, reconcile } from './reconcile'
import { sheetDiff, type DiffSection } from './sheet-diff'
import { roundOver, sameActor, sceneZone, waiting } from './table'
import { MenuButton, TableCenter, ZoneChip, type HeroView } from './TableCenter'
import { heroView, villainView } from './views'

/** Log lines about the turn order: handoffs and rounds starting. */
const TURN_LINE = /handed off to|is up\.$|^Round \d+ started/

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

/** "New code from your GM" and Reconnect: rejoins a saved game on its new code, keeping the hero's place. */
function NewCodeForm({ onReconnect }: { onReconnect: (code: string) => void }) {
  const id = useId()
  const [value, setValue] = useState('')
  const code = normalizeRoomCode(value)
  return (
    <form
      className="gt-new-code"
      onSubmit={(e) => {
        e.preventDefault()
        if (code) onReconnect(code)
      }}
    >
      <div className="gt-row">
        <label className="field gt-grow" htmlFor={id}>
          <span>New code from your GM</span>
          <input id={id} type="text" autoComplete="off" autoCapitalize="characters" placeholder="ABCD-EFGH" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-hint`} />
        </label>
        <button type="submit" className="button button--small button--primary" disabled={!code}>
          Reconnect
        </button>
      </div>
      <p id={`${id}-hint`} className="gt-sub">
        Reconnecting with a new code keeps your hero's place in the game.
      </p>
    </form>
  )
}

/** A player's notices (rejected actions, the GM's answers, a new code) as toasts. */
function noticeToast(n: Notice, retry: (id: string) => void): ToastData {
  return {
    id: n.id,
    text: (
      <>
        {n.text}
        {n.code && (
          <>
            {' '}
            <code className="toast__code">{n.code}</code>
          </>
        )}
        {n.adjustments?.length ? ` ${n.adjustments.join(' ')}` : ''}
      </>
    ),
    ...(n.kind === 'rejected' || n.kind === 'unreachable' ? { warn: true } : {}),
    ...(n.retry ? { action: { label: 'Try again', onClick: () => retry(n.retry!) } } : {}),
  }
}

/** The changes between the game's copy and the library sheet, and what an update would do in this game. */
function sheetChange(copy: HeroOnTable, library: Hero) {
  const changes = sheetDiff(copy.sheet, library)
  if (!changes.length) return undefined
  const { adjustments } = reconcile(copy.play, library, copy.sheet)
  const line = healthLine(copy.play, buildSheet(copy.sheet).maxHealth, adjustments)
  return { changes, inGame: adjustments.length ? adjustments : line ? [line] : ['Nothing else changes.'] }
}

const heroNowColors = (hero: Hero | undefined) => (hero ? JSON.stringify(hero.appearance ?? null) : undefined)

export function PlayerTable({ room, random }: { room: string; random?: () => number }) {
  const session = useSession()
  const heroStore = useStore()
  // The game on this code, or one the GM has since moved to a new code (the page follows it there).
  const current = session.playing
  const client = current && (current.room === room || current.formerRooms.includes(room)) ? current : undefined
  const snap = usePlayingSnapshot(client)
  const clientRoom = client?.room
  useEffect(() => {
    if (clientRoom && clientRoom !== room) window.location.replace(tablePath(clientRoom))
  }, [clientRoom, room])
  const now = useTick()
  const phone = useMediaQuery('(max-width: 759px)', false)
  // The player's library hero: undefined until looked up; `hero` unset when it isn't on this device.
  const [loaded, setLoaded] = useState<{ hero?: Hero } | undefined>()
  const library = loaded?.hero && !isDraft(loaded.hero) ? loaded.hero : undefined
  // The sheet-changed prompt: shown by itself once on joining (when the sheet changed), or from the panel's ⋯.
  const [prompt, setPrompt] = useState<'auto' | 'shown' | 'done'>('auto')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [noteHidden, setNoteHidden] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [askFirst, setAskFirst] = useState(false)
  // On a phone (section 14, "Phones"): the table and the hero, as tabs.
  const [tab, setTab] = useState<'table' | 'hero'>('table')
  const lastTurn = useRef<{ mine: boolean; reactionUsed: boolean } | undefined>(undefined)
  const [reactionBack, setReactionBack] = useState(false)

  // The player's library sheet, to see whether it changed since joining.
  const sourceId = client?.info.heroSourceId
  useEffect(() => {
    if (!sourceId) return
    let live = true
    heroStore.get(sourceId).then(
      (r) => live && setLoaded(r.status === 'found' ? { hero: r.hero } : {}),
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
        if (live && j) client.showCached(receivedFrom(j))
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [client, needsCache, joinedStore, room])

  // Not connected to this game on this device, but it's cached: offer to open it.
  const [cachedGame, setCachedGame] = useState<JoinedGame | undefined>()
  useEffect(() => {
    if (client || !joinedStore) return
    let live = true
    joinedStore.list().then(
      (list) => live && setCachedGame(list.find((x) => x.room === room)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [client, joinedStore, room])

  const received = snap?.received
  const table: TableView | undefined = received?.table
  const heroId = received?.you?.heroId
  const copy = table?.heroes.find((h) => h.id === heroId)
  const live = snap?.status === 'live'
  const paused = Boolean(table && betweenIssues(table))
  const mine = Boolean(heroId && table && !paused && sameActor(table.turn.current, { kind: 'hero', id: heroId }))

  // A new scene is a toast. The first number seen, and going back (the GM's Undo), aren't.
  const sceneNow = table?.scene.number
  const issueNow = table?.currentIssueId ? table.issues.find((i) => i.id === table.currentIssueId)?.number : undefined
  const sceneNowName = table ? sceneDisplayName(table) : ''
  const seenScene = useRef<number | undefined>(undefined)
  const seenIssue = useRef<number | undefined>(undefined)
  const [sceneToast, setSceneToast] = useState<ToastData | null>(null)
  useEffect(() => {
    if (sceneNow === undefined) return
    if (seenScene.current !== undefined && sceneNow > seenScene.current) {
      const newIssue = issueNow !== undefined && seenIssue.current !== undefined && issueNow > seenIssue.current
      setSceneToast({ id: `scene-${sceneNow}`, text: newIssue ? `Issue ${issueNow} began: ${sceneNowName}.` : `New scene: ${sceneNowName}` })
    }
    seenScene.current = sceneNow
    if (issueNow !== undefined) seenIssue.current = issueNow
  }, [sceneNow, sceneNowName, issueNow])

  // Handoffs are announced as they happen (players never receive hidden ones).
  const seenLines = useRef<Set<string> | undefined>(undefined)
  const [closedToast, setClosedToast] = useState<ToastData | null>(null)
  const feed = table?.feed
  useEffect(() => {
    if (!feed) return
    const seen = seenLines.current
    seenLines.current = new Set(feed.map((e) => e.id))
    // The first state is what's already happened.
    if (!seen) return
    const turns = feed.filter((e) => !seen.has(e.id) && TURN_LINE.test(e.text)).map((e) => e.text)
    if (turns.length) setAnnounce(turns.join(' '))
    // A line for this player alone: the GM closed a challenge before answering their Overcome.
    const closed = feed.filter((e) => !seen.has(e.id) && e.forHero).at(-1)
    if (closed) setClosedToast({ id: `closed-${closed.id}`, text: `${closed.by}: ${closed.text}` })
  }, [feed])

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

  // This device's answers about back issues (scrpg-aid-designs/issues/spec.md, section 3).
  const gameId = table?.id
  const [prompts, setPrompts] = useState<IssuePrompts>({})
  useEffect(() => {
    if (!gameId || !joinedStore) return
    let live = true
    joinedStore.get(gameId).then(
      (j) => live && j?.issuePrompts && setPrompts((p) => ({ ...j.issuePrompts, ...p })),
      () => {},
    )
    return () => {
      live = false
    }
  }, [gameId, joinedStore])
  const answer = (issueId: string, value: 'later' | 'dismissed') => {
    setPrompts((p) => ({ ...p, [issueId]: value }))
    if (gameId && joinedStore) setIssuePrompt(joinedStore, gameId, issueId, value).catch(() => {})
  }
  const issues = useMemo(() => table?.issues ?? [], [table])
  const asked = sourceId && loaded ? issueToPrompt(issues, sourceId, loaded.hero, prompts) : undefined
  const [reopened, setReopened] = useState<string | undefined>()
  const free = useNotTyping(Boolean(asked))
  const issue = issues.find((i) => i.id === reopened && i.state === 'finished') ?? (free ? asked : undefined)
  const [backToast, setBackToast] = useState<ToastData | null>(null)

  // Once the prompt is out of the way, a hero with points is told they can spend them.
  const lastIssue = issues.at(-1)
  const pointsLeft = copy && table ? heroPointsLeft(table.heroPoints, copy.play) : 0
  const remindedFor = useRef<string | undefined>(undefined)
  const [pointsToast, setPointsToast] = useState<ToastData | null>(null)
  const focusPoints = useCallback(() => {
    setTab('hero')
    setTimeout(() => document.getElementById(HERO_POINTS_ID)?.focus())
  }, [])
  const remindNow = paused && Boolean(lastIssue) && pointsLeft > 0 && !asked && !issue
  useEffect(() => {
    if (!remindNow || !lastIssue || remindedFor.current === lastIssue.id) return
    remindedFor.current = lastIssue.id
    setPointsToast({ id: `points-${lastIssue.id}`, text: `You have ${pointsLeft} hero ${pointsLeft === 1 ? 'point' : 'points'} to spend on bonuses for issue ${lastIssue.number + 1}.`, action: { label: 'Spend', onClick: focusPoints } })
  }, [remindNow, lastIssue, pointsLeft, focusPoints])

  // Colors reach the game at once, with no review (scrpg-aid-designs/character-colors/spec.md, section 6).
  const libraryColors = heroNowColors(loaded?.hero)
  const tableColors = copy ? JSON.stringify(copy.sheet.appearance ?? null) : undefined
  const sentColors = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!live || !client || !copy || libraryColors === undefined || tableColors === libraryColors) return
    // Once for each difference: if the game's copy changes again, it's a new one.
    const difference = `${tableColors}|${libraryColors}`
    if (sentColors.current === difference) return
    if (client.sendAppearance(loaded?.hero?.appearance)) sentColors.current = difference
  }, [live, client, copy, libraryColors, tableColors, loaded])

  // Alerts (scrpg-aid-designs/settings/spec.md, section 4).
  const alertWatch = useMemo<PlayerWatch | undefined>(() => {
    if (!table || !copy) return undefined
    return {
      myTurn: mine,
      requests: table.challenges.reduce((n, c) => n + c.requests.filter((r) => r.heroId === copy.id).length, 0),
      syncAnswers: snap?.syncAnswers ?? 0,
      reminder: Boolean(snap?.spendReminder),
      prompt: asked?.id,
      choices: (table.pendingHits ?? []).filter((h) => h.heroId === copy.id).length + (copy.play.minions ?? []).filter((m) => m.needsForm).length,
    }
  }, [table, copy, mine, snap?.spendReminder, snap?.syncAnswers, asked?.id])
  // Only these can bring the turn round to this hero by the player's own doing.
  const acting = snap?.pending.some((p) => p.action.kind === 'startRound' || p.action.kind === 'handOff') ?? false
  useAlerts(alertWatch, (before, after) => playerAlerts(before, after, acting), table ? gameDisplayName(table) : '')

  // The GM's list hears what's been done, once for each answer. It stays right after the GM's Undo, or a reconnect.
  const sentAcks = useRef(new Set<string>())
  const heroNow = loaded?.hero
  useEffect(() => {
    if (!live || !client || !sourceId || !heroNow) return
    for (const i of offeredIssues(issues, sourceId)) {
      const status = holdsIssue(heroNow, i.id) ? ('added' as const) : prompts[i.id] ? ('later' as const) : undefined
      if (!status) continue
      const count = heroNow.backIssues.length
      const key = `${i.id}:${i.finishedAt}:${status}:${count}`
      if (sentAcks.current.has(key)) continue
      if (client.issueAck(i.id, status, count)) sentAcks.current.add(key)
    }
  }, [live, client, sourceId, heroNow, issues, prompts])

  // On joining or rejoining: if the library sheet has changed, offer to ask the GM to update the game's copy.
  const change = copy && library ? sheetChange(copy, library) : undefined
  const prompting = Boolean(change) && !issue && (prompt === 'shown' || (prompt === 'auto' && live && !snap?.syncWaiting))

  if (!client) {
    return (
      <div className="app-main">
        <p>
          <a href={gamesPath}>← Games</a>
        </p>
        {cachedGame ? (
          <>
            <p>
              {gameDisplayName(cachedGame.table)}: you play {cachedGame.table.heroes.find((h) => h.id === cachedGame.heroId)?.sheet.details.name || 'a hero'}. This device isn't connected to it right now.
            </p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => session.joinGame({ room: cachedGame.room, name: cachedGame.name, hero: cachedGame.sheet, cached: receivedFrom(cachedGame) })}
            >
              Open {gameDisplayName(cachedGame.table)}
            </button>
          </>
        ) : (
          <p>
            You're not in game {room} on this device. <a href={joinPath(room)}>Join it</a>.
          </p>
        )}
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

  // Put off with Later, and not added since.
  const notRecordedHere = sourceId && heroNow ? offeredIssues(issues, sourceId).filter((i) => prompts[i.id] === 'later' && !holdsIssue(heroNow, i.id)) : []

  /** Adds the back issue to the library hero: the latest copy, since the Advancement page may have changed it. */
  const addIssue = (i: IssueOnTable, collection?: string) => {
    setReopened(undefined)
    const fail = (e: unknown) => setBackToast({ id: `back-${i.id}`, text: `Couldn't add the back issue: ${e instanceof Error ? e.message : String(e)}`, warn: true })
    heroStore.get(client.info.heroSourceId).then((r) => {
      if (r.status !== 'found') return setLoaded({})
      const c = { now: new Date(), newId: () => newId() }
      const result = addOfferedIssue(r.hero, { id: i.id, number: i.number, title: issueTitle(i), game: { id: gameId!, name: gameName } }, collection, c)
      if (result.hero === r.hero) return setBackToast({ id: `back-${i.id}`, text: result.text })
      const after = { ...result.hero, updatedAt: c.now.toISOString() }
      return heroStore.save(after).then(() => {
        setLoaded({ hero: after })
        setBackToast({ id: `back-${i.id}`, text: result.text })
      })
    }).catch(fail)
  }

  const panel = copy && table && (
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
      {...(received ? { gmName: received.gm } : {})}
      {...(heroNow
        ? {
            backIssues: {
              count: heroNow.backIssues.length,
              advancementHref: advancementPath(heroNow.id),
              notRecorded: notRecordedHere.map((i) => ({ id: i.id, title: issueTitle(i), onAdd: () => setReopened(i.id) })),
            },
          }
        : {})}
    />
  )

  const banner =
    status === 'refused' ? (
      <p role="alert" className="gt-banner gt-banner--error">
        {refusedText(snap!.refused ?? 'removed', gameName)}
      </p>
    ) : status === 'reconnecting' ? (
      <p role="status" className="gt-banner">
        Reconnecting to the GM… Actions are paused.
      </p>
    ) : status === 'offline' && received && table ? (
      // The usual tries failed: the GM isn't hosting, or got a new code (and this device missed it).
      <div role="status" className="gt-banner">
        <p>
          <strong>Can't reach {gameName}.</strong> The GM isn't hosting, or changed the code. Read-only until you reconnect. <span className="gt-sub">As of {asOf}.</span>
        </p>
        <button type="button" className="button button--small" onClick={() => client.reconnect()}>
          Try to reconnect
        </button>
        <NewCodeForm
          onReconnect={(code) => {
            session.joinGame({ room: code, name: client.info.name, hero: client.info.sheet, cached: received, gameId: table.id })
            navigate(tablePath(code))
          }}
        />
      </div>
    ) : status === 'connecting' && received ? (
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
        {phone ? (
          // A phone's sticky top bar: back, the game, the round and scene, and the scene's zone.
          <header className="app-header gt-header">
            <a className="icon-button" href={gamesPath} aria-label="Back to Games">
              ←
            </a>
            <div className="gt-grow">
              <h1 className="gt-title">{gameName}</h1>
              {table && <p className="gt-sub gt-header__line">{paused ? finishedPill(table.issues) : [table.round > 0 ? `Round ${table.round}` : 'Not started', sceneDisplayName(table)].join(' · ')}</p>}
            </div>
            {table && <ZoneChip zone={sceneZone(table)} label={`SCENE ${sceneZone(table).toUpperCase()}`} />}
          </header>
        ) : (
          <header className="app-header gt-header">
            <a className="button button--quiet button--small" href={gamesPath}>
              ← Games
            </a>
            <h1 className="gt-title">{gameName}</h1>
            <span className="gt-pill">Playing as {heroName}</span>
            {table && <span className="gt-sub">{table.heroes.filter((h) => h.player).length === 1 ? '1 player' : `${table.heroes.filter((h) => h.player).length} players`}</span>}
            {received && <span className="gt-sub">GM: {received.gm}</span>}
          </header>
        )}
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
        ) : phone ? (
          <>
            <div className="gt-tabs gt-tabs--page" role="tablist" aria-label="Game table">
              {(
                [
                  ['table', 'Table'],
                  ['hero', heroName],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" role="tab" id={`gt-ptab-${key}`} aria-controls="gt-ptabpanel" aria-selected={tab === key} className={tab === key ? 'gt-tabs__on' : undefined} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div id="gt-ptabpanel" role="tabpanel" aria-labelledby={`gt-ptab-${tab}`} className="gt-phone-panel">
              {tab === 'table' ? <TableCenter game={table} heroes={heroes} villains={villains} now={now} compact {...(received ? { gmName: received.gm } : {})} /> : panel}
            </div>
          </>
        ) : (
          <div className="gt-layout">
            <TableCenter game={table} heroes={heroes} villains={villains} now={now} {...(received ? { gmName: received.gm } : {})} />
            {panel}
          </div>
        )}
      </div>
      {issue &&
        (loaded?.hero ? (
          <BackIssuePrompt
            number={issue.number}
            title={issueTitle(issue)}
            hero={loaded.hero}
            issueId={issue.id}
            who={received?.gm || 'The GM'}
            gameName={gameName}
            onAdd={(collection) => addIssue(issue, collection)}
            onLater={() => {
              setReopened(undefined)
              if (!prompts[issue.id]) answer(issue.id, 'later')
            }}
          />
        ) : (
          <Modal title={`End of issue ${issue.number}`} onClose={() => (setReopened(undefined), answer(issue.id, 'later'))}>
            <p>{copy ? heroName : 'Your hero'} isn't in this device's library, so the back issue can't be added here.</p>
            <div className="button-row gt-dialog-actions">
              <button type="button" className="button button--primary" onClick={() => (setReopened(undefined), answer(issue.id, 'later'))}>
                Close
              </button>
            </div>
          </Modal>
        ))}
      {snap?.spendReminder && paused && !issue && (
        <Modal title="Spend your hero points" onClose={() => client.dismissReminder()}>
          <p>
            {received?.gm || 'The GM'} is about to start issue {nextIssueNumber(table!)}. You have {pointsLeft} unspent hero {pointsLeft === 1 ? 'point' : 'points'}. Spend them now, or they're lost.
          </p>
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button" onClick={() => client.dismissReminder()}>
              Not now
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                client.dismissReminder()
                focusPoints()
              }}
            >
              Spend now
            </button>
          </div>
        </Modal>
      )}
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
      <Toasts toasts={[...(snap?.notices ?? []).map((n) => noticeToast(n, (id) => client.retry(id))), ...(sceneToast ? [sceneToast] : []), ...(closedToast ? [closedToast] : []), ...(backToast ? [backToast] : []), ...(pointsToast ? [pointsToast] : [])]} onDismiss={(id) => (id === pointsToast?.id ? setPointsToast(null) : id === sceneToast?.id ? setSceneToast(null) : id === closedToast?.id ? setClosedToast(null) : id === backToast?.id ? setBackToast(null) : client.dismiss(id))} />
    </PopoverGroup>
  )
}
