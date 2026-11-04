/**
 * The game table for the GM (docs/design/game-table/spec.md; Phase 1: no network). The game is
 * the single source of truth: heroes and villains on the table are copies inside it, so every
 * change, the GM's edits to heroes included, changes the game and is saved with it. The rules
 * are in ./table.ts and ./hero-changes.ts; this page wires them to the shared center
 * (./TableCenter.tsx) and the GM screen (./GmScreen.tsx).
 */
import { useCallback, useMemo, useState } from 'react'
import { gameDisplayPath, gamesPath } from '../app/route'
import { useStore } from '../app/store-context'
import { useVillainStore } from '../app/villain-store-context'
import { RenameHeading } from '../components/RenameHeading'
import { useMediaQuery } from '../components/useMediaQuery'
import { buildSheet } from '../creation/sheet'
import type { Lookup } from '../editor/useDocumentEditor'
import { heroDisplayName, isDraft, newId, type Hero } from '../hero/model'
import { PopoverGroup, type MenuItem } from '../library/Popover'
import type { LibraryItem } from '../library/registry'
import { formatAgoInline } from '../library/when'
import type { Clock } from '../play/state'
import { useTick } from '../play/useTick'
import { villainDisplayName, type Villain, type VillainPlayState } from '../villain/model'
import { villainHealth } from '../villain/play'
import { AddChallengeDialog, AddGroupDialog, ConfirmDialog, EnvironmentDialog, FixTurnDialog, HealthDialog, ModDialog, SceneSetupDialog, TwistDialog, UpdateDialog } from './dialogs'
import { GmScreen, type QuickAddKind, type VillainAttacks } from './GmScreen'
import type { GroupActions } from './RunningGroup'
import { applySaves } from './npc'
import { applyAttack, applyGroupRoll, giveMod, protect } from './resolve'
import { parseTarget } from './roll-targets'
import { applyHeroChange, type HeroChange } from './hero-changes'
import { gameDisplayName, sceneDisplayName, type ActorRef, type Game, type HeroInGame, type VillainInGame } from './model'
import { healthLine, reconcile, reconcileVillain } from './reconcile'
import { sheetDiff } from './sheet-diff'
import { TableCenter, TableLog, ZoneChip, type GmControls, type HeroView, type VillainView } from './TableCenter'
import { useDocMap } from './useDocMap'
import { useDisplayBroadcast } from './useDisplayBroadcast'
import { useGameEditor } from './useGameEditor'
import { InviteDialog, StartHostingDialog } from './hosting'
import { project } from './project'
import { heroView, villainView } from './views'
import { useHostSnapshot, useSession } from '../session/context'
import { formatAgo } from '../library/when'
import { newRoomCode } from '../session/code'
import * as T from './table'
import { useOptionalTemplateStores } from '../app/template-store-context'
import type { DocStore } from '../store/doc-store'
import type { ChallengeTemplate, MinionTemplate } from '../template/model'
import { challengeFromTemplate, groupFromTemplate, templateFromChallenge, templateFromGroup } from '../template/to-table'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Dialog =
  | { kind: 'quick'; which: QuickAddKind }
  | { kind: 'environment' }
  | { kind: 'scene' }
  | { kind: 'heroHealth' | 'heroMod' | 'heroTwist' | 'heroRemove'; hero: HeroView }
  | { kind: 'removeItem'; ref: T.ItemRef; name: string }
  | { kind: 'memberMod'; groupId: string; memberId: string; name: string }
  | { kind: 'fix'; part: 'current' | 'acted' | 'round' }
  | { kind: 'update'; ref: { kind: 'hero' | 'villain'; id: string }; sheet: Hero | Villain }
  | { kind: 'review'; heroId: string }
  | { kind: 'startHosting' }
  | { kind: 'invite' }

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })
const noSave = async () => {}

/** What the update dialog shows for a copy and a newer library sheet: the changes, the adjustments, and the line on Health. */
function updatePreview(copy: HeroInGame | VillainInGame, sheet: Hero | Villain) {
  if ('method' in sheet) {
    const hero = copy as HeroInGame
    const { adjustments } = reconcile(hero.play, sheet, hero.sheet)
    return { name: heroDisplayName(hero.sheet), changes: sheetDiff(hero.sheet, sheet), adjustments, healthLine: healthLine(hero.play, buildSheet(hero.sheet).maxHealth, adjustments) }
  }
  const villain = copy as VillainInGame
  const { adjustments } = reconcileVillain(villain.play, sheet, villain.sheet)
  return { name: villainDisplayName(villain.sheet), changes: sheetDiff(villain.sheet, sheet), adjustments, healthLine: healthLine(villain.play, villainHealth(villain.sheet, villain.play).maxHealth, adjustments) }
}

export function GamePage({ id, clock = defaultClock, random }: { id: string; clock?: () => Clock; random?: () => number }) {
  const heroStore = useStore()
  const villainStore = useVillainStore()
  // The library documents the copies came from, read only: to offer Update from library when they've changed.
  const loadHero = useCallback(async (heroId: string): Promise<Lookup<Hero>> => {
    const r = await heroStore.get(heroId)
    return r.status === 'found' ? { status: 'found', doc: r.hero } : r
  }, [heroStore])
  const loadVillain = useCallback(async (villainId: string): Promise<Lookup<Villain>> => {
    const r = await villainStore.get(villainId)
    return r.status === 'found' ? { status: 'found', doc: r.villain } : r
  }, [villainStore])

  // While this device hosts this game, the hosting session holds it (and saves it); otherwise the page does.
  const session = useSession()
  const host = session.hosting?.gameId === id ? session.hosting : undefined
  const hosted = useHostSnapshot(host)
  const editor = useGameEditor(host ? '' : id)
  const game = host ? hosted?.game : editor.state.status === 'ready' ? editor.state.doc : undefined
  const libraryHeroes = useDocMap(game?.heroes.filter((h) => !h.player).map((h) => h.sourceId) ?? [], loadHero, noSave)
  const libraryVillains = useDocMap(game?.villains.map((v) => v.sourceId) ?? [], loadVillain, noSave)
  const phone = useMediaQuery('(max-width: 759px)', false)
  const now = useTick()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [running, setRunning] = useState<T.ItemRef | null>(null)
  const [tab, setTab] = useState<'table' | 'gm' | 'log'>('table')
  const [announce, setAnnounce] = useState('')
  const [hostError, setHostError] = useState<string | null>(null)
  // Quick add's "Save to library" failing (the item is still on the table).
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null)
  const templates = useOptionalTemplateStores()
  // Display windows of this game on this device (Open display view) get what observers see.
  const observed = useMemo(() => (game ? project(game, 'observer') : undefined), [game])
  useDisplayBroadcast(id, observed, host?.room)

  if (!game) {
    return (
      <div className="app-main">
        <p>
          <a href={gamesPath}>← Games</a>
        </p>
        {host &&
          (hosted?.error ? (
            <>
              <p role="alert">{hosted.error}</p>
              <button type="button" className="button" onClick={() => void session.stopHosting()}>
                Stop hosting
              </button>
            </>
          ) : (
            <p>Loading…</p>
          ))}
        {!host && editor.state.status === 'loading' && <p>Loading…</p>}
        {editor.state.status === 'missing' && <p role="alert">There's no saved game with that link. It may have been deleted.</p>}
        {editor.state.status === 'unreadable' && <p role="alert">This game couldn't be read: {editor.state.error}</p>}
        {editor.state.status === 'error' && <p role="alert">Something went wrong loading this game: {editor.state.message}</p>}
      </div>
    )
  }

  const apply = host ? (fn: (g: Game) => Game) => host.apply(fn) : editor.apply
  const startHosting = (name: string) => {
    setHostError(null)
    void session.hostGame(game.id, name).then((why) => why && setHostError(why))
  }
  const connected = hosted?.connected ?? new Set<string>()
  const players = game.heroes.filter((h) => h.player)
  const zone = T.sceneZone(game)

  /** A GM change to a hero's copy in this game, in its history and the log. */
  const changeHero = (heroId: string, change: HeroChange) => apply((g) => T.changeHeroPlay(g, heroId, (p, sheet) => applyHeroChange(p, buildSheet(sheet), change, clock()), clock()))

  /** A change to a villain's play state, its history shared to the log (only the GM's while it's hidden). */
  const changeVillain = (villainId: string, fn: (play: VillainPlayState, c: Clock) => VillainPlayState) => apply((g) => T.changeVillainPlay(g, villainId, (p) => fn(p, clock()), clock()))

  /** A turn change; its log lines are announced. */
  const turn = (fn: (g: Game) => Game) => {
    let lines: string[] = []
    apply((g) => {
      const next = fn(g)
      const known = new Set(g.feed.map((e) => e.id))
      lines = next.feed.filter((e) => !known.has(e.id)).map((e) => e.text)
      return next
    })
    if (lines.length) setAnnounce(lines.join(' '))
  }

  const nameOf = (ref: T.ItemRef | ActorRef) => T.itemName(game, ref)
  const strip = (ref: ActorRef) => (T.isHidden(game, ref) && ref.kind !== 'hero' ? `${nameOf(ref)} (hidden)` : nameOf(ref))

  /** The library's newer sheet for a copy, when it differs from the game's (build only). */
  const libraryChange = (kind: 'hero' | 'villain', copy: HeroInGame | VillainInGame): Hero | Villain | undefined => {
    const doc = kind === 'hero' ? libraryHeroes.get(copy.sourceId) : libraryVillains.get(copy.sourceId)
    if (!doc || (kind === 'hero' && isDraft(doc as Hero))) return undefined
    return sheetDiff(copy.sheet, doc).length ? doc : undefined
  }

  // ---- What the cards show ----

  const table = project(game, 'gm')
  const heroes: HeroView[] = game.heroes.map((h) => heroView(h, game, { disconnected: Boolean(h.player && !connected.has(h.player.clientId)), syncRequested: game.pendingSyncs.some((r) => r.heroId === h.id), waiting: (game.pendingHits ?? []).filter((x) => x.heroId === h.id), chooser: T.defenseChooser(h) }))
  const villains: VillainView[] = table.villains.map(villainView)

  // ---- The GM's controls ----

  const run = (ref: T.ItemRef) => {
    const same = running?.kind === ref.kind && running.id === ref.id
    setRunning(same ? null : ref)
    if (!same && phone) setTab('gm')
  }
  const reveal = (ref: T.ItemRef) => apply((g) => T.setHidden(g, ref, false, clock()))
  const hide = (ref: T.ItemRef) => apply((g) => T.setHidden(g, ref, true, clock()))
  const env = game.environment
  const gm: GmControls = {
    setPosition: (i) => apply((g) => T.setTrackerPosition(g, i, clock())),
    sceneMenu: [
      { label: 'Scene setup…', onSelect: () => setDialog({ kind: 'scene' }) },
      { label: 'Set environment…', onSelect: () => setDialog({ kind: 'environment' }) },
      ...(env && !env.hidden ? [{ label: 'Hide the environment from players', onSelect: () => hide({ kind: 'environment', id: env.id }) }] : []),
      ...(env ? [{ label: 'Remove the environment…', danger: true, onSelect: () => setDialog({ kind: 'removeItem', ref: { kind: 'environment', id: env.id }, name: env.name }) }] : []),
    ],
    revealEnvironment: () => env && reveal({ kind: 'environment', id: env.id }),
    startRound: (first) => turn((g) => T.startRound(g, first, clock())),
    handOff: (to) => turn((g) => T.handOff(g, to, clock())),
    turnMenu: [
      { label: "Set who's acting…", onSelect: () => setDialog({ kind: 'fix', part: 'current' }) },
      { label: 'Mark acted or not acted…', onSelect: () => setDialog({ kind: 'fix', part: 'acted' }) },
      { label: 'Set the round number…', onSelect: () => setDialog({ kind: 'fix', part: 'round' }) },
    ],
    heroMenu: (hero) => {
      const remove: MenuItem = { label: 'Remove from the game…', danger: true, onSelect: () => setDialog({ kind: 'heroRemove', hero }) }
      const copy = T.findHero(game, hero.ref.id)
      const request = game.pendingSyncs.some((r) => r.heroId === hero.ref.id)
      // The GM's own heroes follow the library like villains do (a player's asks to sync instead, from Phase 2).
      const newer = copy && !copy.player ? libraryChange('hero', copy) : undefined
      return [
        ...(newer ? [{ label: `Library sheet changed ${formatAgoInline(newer.updatedAt, now)}`, note: true as const, onSelect: () => {} }, { label: 'Update from library…', onSelect: () => setDialog({ kind: 'update', ref: { kind: 'hero', id: hero.ref.id }, sheet: newer }) }] : []),
        ...(request ? [{ label: 'Review sheet update…', onSelect: () => setDialog({ kind: 'review', heroId: hero.ref.id }) }] : []),
        { label: 'Change Health…', onSelect: () => setDialog({ kind: 'heroHealth', hero }) },
        { label: 'Give a bonus or penalty…', onSelect: () => setDialog({ kind: 'heroMod', hero }) },
        { label: 'Add a twist…', onSelect: () => setDialog({ kind: 'heroTwist', hero }) },
        { label: hero.reactionUsed ? 'Mark reaction unused' : 'Mark reaction used', onSelect: () => changeHero(hero.ref.id, { kind: 'reaction', used: !hero.reactionUsed }) },
        remove,
      ]
    },
    reviewSync: (heroId) => setDialog({ kind: 'review', heroId }),
    resolveHit: (hitId, defenseId) => apply((g) => T.resolveHit(g, hitId, defenseId, clock())),
    reveal,
    hide,
    itemMenu: (ref, hidden) => [
      ...(() => {
        const copy = ref.kind === 'villain' ? T.findVillain(game, ref.id) : undefined
        const newer = copy && libraryChange('villain', copy)
        return newer ? [{ label: `Library sheet changed ${formatAgoInline(newer.updatedAt, now)}`, note: true as const, onSelect: () => {} }, { label: 'Update from library…', onSelect: () => setDialog({ kind: 'update', ref: { kind: 'villain', id: ref.id }, sheet: newer }) }] : []
      })(),
      ...(hidden ? [{ label: 'Reveal', onSelect: () => reveal(ref) }] : ref.kind === 'villain' ? [] : [{ label: 'Hide from players', onSelect: () => hide(ref) }]),
      { label: 'Remove from the game…', danger: true, onSelect: () => setDialog({ kind: 'removeItem', ref, name: nameOf(ref) }) },
    ],
    setPlayersSee: (villainId, value) => apply((g) => T.setPlayersSee(g, villainId, value)),
    run,
    ...(running ? { running } : {}),
    addMemberMod: (group, memberId) => {
      const m = group.members.find((x) => x.id === memberId)
      if (m) setDialog({ kind: 'memberMod', groupId: group.id, memberId, name: T.memberName(group, m.n) })
    },
    shrinkMember: (group, memberId) => apply((g) => T.shrinkMember(g, group.id, memberId, clock())),
    setStep: (challenge, i, done) => apply((g) => T.setChallengeStep(g, challenge.id, i, done, clock())),
    sheets: phone,
  }

  const runningGroup = running?.kind === 'group' ? game.groups.find((g) => g.id === running.id) : undefined
  const runningVillain = running?.kind === 'villain' ? T.findVillain(game, running.id) : undefined
  const groupActions = (groupId: string): GroupActions => ({
    shrink: (memberId) => apply((g) => T.shrinkMember(g, groupId, memberId, clock())),
    remove: (memberId) => apply((g) => T.removeMember(g, groupId, memberId, clock())),
    addMod: (memberId, mod) => apply((g) => T.addMemberMod(g, groupId, memberId, mod, clock())),
    removeMod: (memberId, modId) => apply((g) => T.removeMemberMod(g, groupId, memberId, modId, clock())),
    setActed: (memberId, acted) => apply((g) => T.setMemberActed(g, groupId, memberId, acted, clock())),
    applyRoll: (action, rows) => apply((g) => applyGroupRoll(g, groupId, action, rows, random ?? Math.random, clock())),
    applySaves: (saves) => apply((g) => applySaves(g, groupId, saves, clock())),
  })
  const runningPanel = runningVillain
    ? {
        kind: 'villain' as const,
        villain: runningVillain,
        change: (fn: (p: VillainPlayState, c: Clock) => VillainPlayState) => changeVillain(runningVillain.id, fn),
        attack: ((results) =>
          apply((g) =>
            results.reduce((x, a) => {
              const to = parseTarget(a.to)
              const by = villainDisplayName(runningVillain.sheet)
              if (!to) return x
              if (a.kind === 'mod') return giveMod(x, to, a.mod, by, clock(), !runningVillain.hidden)
              if (a.kind === 'attack') return applyAttack(x, by, to, a.amount, random ?? Math.random, clock(), runningVillain.hidden).game
              return protect(x, by, to, a.amount, clock(), runningVillain.hidden)
            }, g),
          )) satisfies VillainAttacks,
      }
    : runningGroup ? { kind: 'group' as const, group: runningGroup, actions: groupActions(runningGroup.id) } : undefined

  const bring = {
    placeOf: (item: LibraryItem) => {
      // Templates can come in again and again.
      if (item.type.key !== 'hero' && item.type.key !== 'villain') return 'absent' as const
      const kind = item.type.key === 'hero' ? 'hero' : 'villain'
      const copy = T.copyOf(game, kind, item.doc.id)
      if (!copy) return 'absent' as const
      if (!(copy as HeroInGame).player && sheetDiff(copy.sheet, item.doc as unknown as Hero | Villain).length) return 'changed' as const
      return 'hidden' in copy && copy.hidden ? ('hidden' as const) : ('shown' as const)
    },
    bringIn: (item: LibraryItem, count?: number) => {
      // Everything is copied into this game: damage never touches the library or other games.
      if (item.type.key === 'hero') apply((g) => T.addHero(g, item.doc as unknown as Hero, clock()))
      else if (item.type.key === 'villain') apply((g) => T.addVillain(g, item.doc as unknown as Villain, clock()))
      // A template brings in a fresh copy each time, hidden like everything else.
      else if (item.type.key === 'minion' || item.type.key === 'lieutenant') {
        const t = item.doc as unknown as MinionTemplate
        apply((g) => T.addGroup(g, groupFromTemplate(t, item.type.key === 'minion' ? 'minions' : 'lieutenants', count ?? t.groupSize, true), clock()))
      } else if (item.type.key === 'challenge') apply((g) => T.addChallenge(g, challengeFromTemplate(item.doc as unknown as ChallengeTemplate, true), clock()))
    },
    update: (item: LibraryItem) => {
      const kind = item.type.key === 'hero' ? 'hero' : 'villain'
      const copy = T.copyOf(game, kind, item.doc.id)
      if (copy) setDialog({ kind: 'update', ref: { kind, id: copy.id }, sheet: item.doc as unknown as Hero | Villain })
    },
  }

  const screen = (
    <GmScreen
      game={game}
      quickAdd={(which) => setDialog({ kind: 'quick', which })}
      {...(runningPanel ? { running: runningPanel } : {})}
      stopRunning={() => setRunning(null)}
      bring={bring}
      setNotes={(notes) => apply((g) => T.setNotes(g, notes))}
      requests={game.pendingSyncs.flatMap((r) => {
        const copy = T.findHero(game, r.heroId)
        if (!copy) return []
        const { changes, adjustments } = updatePreview(copy, r.sheet)
        const count = changes.reduce((n, c) => n + c.changes.length, 0)
        const summary = `${copy.player?.name ?? 'The player'} updated the sheet: ${count === 1 ? '1 change' : `${count} changes`}${adjustments.length ? `, ${adjustments.length === 1 ? '1 adjustment' : `${adjustments.length} adjustments`}` : ''}`
        return [{ heroId: r.heroId, name: heroDisplayName(copy.sheet), summary }]
      })}
      onReview={(heroId) => setDialog({ kind: 'review', heroId })}
      random={random}
    />
  )
  const center = <TableCenter game={table} heroes={heroes} villains={villains} now={now} gm={gm} hideLog={phone} />
  const saveError = editor.saveError
  const details = `${game.round > 0 ? `Round ${game.round}` : 'Not started'} · ${sceneDisplayName(game)}`

  return (
    <PopoverGroup>
      <div className={phone ? 'gt-page gt-page--phone' : 'gt-page'}>
        <header className="app-header gt-header">
          <a className="button button--quiet button--small" href={gamesPath}>
            ← Games
          </a>
          <RenameHeading shown={gameDisplayName(game)} name={game.name} placeholder={!game.name.trim()} noun="game" onRename={(name) => apply((g) => T.renameGame(g, name))} />
          {phone ? (
            <span className="gt-header__phone">
              <span className="gt-sub">{details}</span> <ZoneChip zone={zone} />
            </span>
          ) : host ? (
            <>
              <span className="gt-pill gt-pill--live">
                <span className="gt-live-dot" aria-hidden="true" />
                Hosting · {host.room}
              </span>
              <span className="gt-sub">{`${players.filter((h) => connected.has(h.player!.clientId)).length} of ${players.length} ${players.length === 1 ? 'player' : 'players'} connected${hosted?.observers.length ? ` · ${hosted.observers.length} watching` : ''}`}</span>
            </>
          ) : (
            <span className="gt-pill">Not hosting</span>
          )}
          <span className="gt-grow" />
          {!phone && (
            <button type="button" className="button button--small" onClick={() => window.open(gameDisplayPath(game.id), `scrpg-display-${game.id}`)}>
              Open display view
            </button>
          )}
          {host ? (
            <button type="button" className="button button--primary button--small" onClick={() => setDialog({ kind: 'invite' })}>
              Invite
            </button>
          ) : (
            <>
              {/* A game hosted before keeps its code: Invite shows it (and New code…) while not hosting. */}
              {game.code && (
                <button type="button" className="button button--small" onClick={() => setDialog({ kind: 'invite' })}>
                  Invite
                </button>
              )}
              <button type="button" className="button button--small" onClick={() => (session.name ? startHosting(session.name) : setDialog({ kind: 'startHosting' }))}>
                Start hosting
              </button>
            </>
          )}
        </header>
        {hostError && !host && (
          <p role="alert" className="error gt-save-error">
            {hostError}
          </p>
        )}
        {saveTemplateError && (
          <p role="alert" className="error gt-save-error">
            Added to the table, but couldn't save it to your library: {saveTemplateError}
          </p>
        )}
        {hosted?.error && (
          <p role="alert" className="error gt-save-error">
            {hosted.error}
          </p>
        )}
        {saveError && (
          <p role="alert" className="error gt-save-error">
            Your last change couldn't be saved: {saveError}
          </p>
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>
        {phone ? (
          <>
            <div className="gt-tabs gt-tabs--page" role="tablist" aria-label="Game table">
              {(
                [
                  ['table', 'Table'],
                  ['gm', 'GM screen'],
                  ['log', 'Log'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" role="tab" id={`gt-tab-${key}`} aria-controls="gt-tabpanel" aria-selected={tab === key} className={tab === key ? 'gt-tabs__on' : undefined} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div id="gt-tabpanel" role="tabpanel" aria-labelledby={`gt-tab-${tab}`} className="gt-phone-panel">
              {tab === 'table' && center}
              {tab === 'gm' && screen}
              {tab === 'log' && (
                <section className="card gt-card" aria-label="Table log">
                  <TableLog entries={game.feed} now={now} gm />
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="gt-layout">
            {center}
            {screen}
          </div>
        )}
      </div>

      {dialog?.kind === 'quick' &&
        (dialog.which === 'challenge' ? (
          <AddChallengeDialog
            canSave={Boolean(templates)}
            onAdd={(c, save) => {
              setSaveTemplateError(null)
              if (!save || !templates) return apply((g) => T.addChallenge(g, c, clock()))
              const t = templateFromChallenge(c)
              apply((g) => T.addChallenge(g, { ...c, templateId: t.id }, clock()))
              templates.challenges.save(t).catch((e: unknown) => setSaveTemplateError(errorText(e)))
            }}
            onClose={() => setDialog(null)}
          />
        ) : (
          <AddGroupDialog
            kind={dialog.which}
            canSave={Boolean(templates)}
            onAdd={(grp, save) => {
              setSaveTemplateError(null)
              if (!save || !templates) return apply((g) => T.addGroup(g, grp, clock()))
              const t = templateFromGroup(grp)
              apply((g) => T.addGroup(g, { ...grp, templateId: t.id }, clock()))
              const store = grp.kind === 'minions' ? templates.minions : templates.lieutenants
              ;(store as DocStore<typeof t>).save(t).catch((e: unknown) => setSaveTemplateError(errorText(e)))
            }}
            onClose={() => setDialog(null)}
          />
        ))}
      {dialog?.kind === 'environment' && <EnvironmentDialog {...(env ? { current: env.name } : {})} onSet={(e) => apply((g) => T.setEnvironment(g, e, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'scene' && <SceneSetupDialog game={game} onSave={(setup) => apply((g) => T.setupScene(g, setup, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'heroHealth' && <HealthDialog name={dialog.hero.name} health={dialog.hero.health ?? 0} {...(dialog.hero.maxHealth !== undefined ? { maxHealth: dialog.hero.maxHealth } : {})} onSet={(value) => changeHero(dialog.hero.ref.id, { kind: 'health', value })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'heroMod' && <ModDialog title={`Give ${dialog.hero.name} a bonus or penalty`} onAdd={(mod) => changeHero(dialog.hero.ref.id, { kind: 'mod', mod })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'heroTwist' && <TwistDialog name={dialog.hero.name} onAdd={(twist) => changeHero(dialog.hero.ref.id, { kind: 'twist', twist })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'heroRemove' && (
        <ConfirmDialog
          title={`Remove ${dialog.hero.name} from the game?`}
          text="They leave the table and the turn order, and this game's copy of them goes. Your library sheet doesn't change."
          confirm="Remove"
          onConfirm={() => {
            const copy = T.findHero(game, dialog.hero.ref.id)
            // A player's hero: the player goes too, and can't rejoin while hosting.
            if (host && copy?.player) host.removePlayer(copy.id)
            else apply((g) => T.removeFromTable(g, dialog.hero.ref, clock()))
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'removeItem' && (
        <ConfirmDialog
          title={`Remove ${dialog.name} from the game?`}
          text={dialog.ref.kind === 'villain' ? "It leaves the table and the turn order, and this game's copy of it goes. Your library sheet doesn't change." : 'It leaves the table and the turn order.'}
          confirm="Remove"
          onConfirm={() => {
            apply((g) => T.removeFromTable(g, dialog.ref, clock()))
            if (running?.kind === dialog.ref.kind && running.id === dialog.ref.id) setRunning(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'memberMod' && <ModDialog title={`Give ${dialog.name} a bonus or penalty`} onAdd={(mod) => apply((g) => T.addMemberMod(g, dialog.groupId, dialog.memberId, mod, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'update' &&
        (() => {
          const copy = dialog.ref.kind === 'hero' ? T.findHero(game, dialog.ref.id) : T.findVillain(game, dialog.ref.id)
          if (!copy) return null
          const preview = updatePreview(copy, dialog.sheet)
          const ref = dialog.ref.kind === 'hero' ? { kind: 'hero' as const, id: copy.id, sheet: dialog.sheet as Hero } : { kind: 'villain' as const, id: copy.id, sheet: dialog.sheet as Villain }
          return <UpdateDialog {...preview} onUpdate={() => apply((g) => T.updateSheet(g, ref, clock()))} onClose={() => setDialog(null)} />
        })()}
      {dialog?.kind === 'review' &&
        (() => {
          const request = game.pendingSyncs.find((r) => r.heroId === dialog.heroId)
          const copy = T.findHero(game, dialog.heroId)
          if (!request || !copy) return null
          const preview = updatePreview(copy, request.sheet)
          const who = copy.player?.name ?? 'the player'
          const approve = () => (host ? host.approveSync(copy.id) : apply((g) => T.updateSheet(g, { kind: 'hero', id: copy.id, sheet: request.sheet }, clock(), "at the player's request")))
          const decline = () => (host ? host.declineSync(copy.id) : apply((g) => ({ ...g, pendingSyncs: g.pendingSyncs.filter((r) => r.heroId !== copy.id) })))
          return (
            <UpdateDialog
              {...preview}
              review={{ title: `Update ${preview.name} to ${who}'s sheet?`, requested: `Requested ${formatAgo(request.at, now).replace(/^./, (c) => c.toLowerCase())}.`, onDecline: decline }}
              onUpdate={approve}
              onClose={() => setDialog(null)}
            />
          )
        })()}
      {dialog?.kind === 'startHosting' && <StartHostingDialog name={session.name} onStart={startHosting} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'invite' && (host || game.code) && (
        <InviteDialog
          room={host?.room ?? game.code!}
          hosting={Boolean(host)}
          needsNewCode={hosted?.needsNewCode ?? new Set()}
          onNewCode={async (keep) => {
            if (host) return session.newCode(game.id, keep)
            // Not hosting: the table holds the game, so the new code goes in through it.
            let code = newRoomCode()
            while (code === game.code) code = newRoomCode()
            apply((g) => T.setGameCode(g, code, clock()))
            return { ok: true, code }
          }}
          gm={host?.gm ?? session.name}
          onRenameGm={(name) => session.renameGm(name)}
          gameName={gameDisplayName(game)}
          players={players}
          connected={connected}
          onRemove={(hero) => host?.removePlayer(hero.id)}
          observers={hosted?.observers ?? []}
          onRemoveObserver={(clientId) => host?.removeObserver(clientId)}
          onStop={() => session.stopHosting()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'fix' && (
        <FixTurnDialog
          part={dialog.part}
          game={game}
          name={strip}
          onCurrent={(ref) => apply((g) => T.setCurrent(g, ref, clock()))}
          onActed={(ref, acted) => apply((g) => T.setActed(g, ref, acted, clock()))}
          onRound={(round) => apply((g) => T.setRound(g, round, clock()))}
          onClose={() => setDialog(null)}
        />
      )}
    </PopoverGroup>
  )
}
