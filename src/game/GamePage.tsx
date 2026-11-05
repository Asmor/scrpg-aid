/**
 * The game table for the GM (docs/design/game-table/spec.md; Phase 1: no network). The game is
 * the single source of truth: heroes and villains on the table are copies inside it, so every
 * change, the GM's edits to heroes included, changes the game and is saved with it. The rules
 * are in ./table.ts and ./hero-changes.ts; this page wires them to the shared center
 * (./TableCenter.tsx) and the GM screen (./GmScreen.tsx).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gameDisplayPath, gamesPath } from '../app/route'
import { useStore } from '../app/store-context'
import { useVillainStore } from '../app/villain-store-context'
import { RenameHeading } from '../components/RenameHeading'
import { gmAlerts, gmWatch } from '../settings/alerts'
import { useAlerts } from '../settings/useAlerts'
import { Modal } from '../components/Modal'
import { useSettings } from '../settings/context'
import { Toasts, type ToastData } from '../components/Toasts'
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
import { recalculateHealth, villainHealth } from '../villain/play'
import { BringInVillainDialog, RecalculateHealthDialog } from './VillainDialogs'
import { AddChallengeDialog, AddGroupDialog, ConfirmDialog, EditStepsDialog, EnvironmentDialog, FixTurnDialog, HealthDialog, IssueTextDialog, ModDialog, SceneRecordDialog, TwistDialog, UpdateDialog } from './dialogs'
import { GmScreen, type GmTab, type QuickAddKind, type VillainAttacks } from './GmScreen'
import type { GroupActions } from './RunningGroup'
import { applySaves } from './npc'
import { applyAttack, applyGroupRoll, giveMod, protect } from './resolve'
import { parseTarget } from './roll-targets'
import { applyHeroChange, type HeroChange } from './hero-changes'
import { betweenIssues, currentIssue, currentScene, gameDisplayName, issueTitle, nextIssueNumber, sceneName, sceneNumber, sceneOnTable, type ActorRef, type Issue, type OppositionRef, type Game, type HeroInGame, type VillainInGame } from './model'
import { backIssueStatuses, changeHeroPoints, finishIssue, issueStartFacts, setIssueRecord, startIssue, type FinishChoices } from './issues'
import { FinishIssueDialog } from './FinishIssueDialog'
import { finishedPill } from './summary'
import { healthLine, reconcile, reconcileVillain } from './reconcile'
import { SceneEditor, type EditorTarget } from './SceneEditor'
import type { SceneDraft } from './scenes'
import { addAsideTo, deleteScene, duplicateScene, moveScene, moveToTable, removeAside, saveCurrentScene, savePlannedScene, setAside, setSceneRecord, startScene, waitingNote } from './scenes'
import { StartSceneDialog } from './StartSceneDialog'
import { sheetDiff, type DiffSection } from './sheet-diff'
import { ColorPicker, SingleColorPicker } from '../colors/ColorPicker'
import { appearanceOf, appearanceText, type Appearance } from '../colors/palette'
import { TableCenter, TableLog, ZoneChip, type GmControls, type HeroView, type VillainView } from './TableCenter'
import { useDocMap } from './useDocMap'
import { useDisplayBroadcast } from './useDisplayBroadcast'
import { useGameEditor } from './useGameEditor'
import { InviteDialog, StartHostingDialog } from './hosting'
import { project } from './project'
import { heroView, villainView } from './views'
import type { VillainStatusActions } from './VillainStatusPanel'
import { logStatusChanges, newStatusLines, setHandCount, setStatusOverride, setWeakness } from './villain-status'
import { useHostSnapshot, useSession } from '../session/context'
import { formatAgo } from '../library/when'
import { newRoomCode } from '../session/code'
import * as T from './table'
import { useOptionalTemplateStores } from '../app/template-store-context'
import type { DocStore } from '../store/doc-store'
import type { ChallengeTemplate, EnvironmentTemplate, MinionTemplate } from '../template/model'
import { addAttached, environmentBasicAction, environmentFromTemplate, logEnvironmentRoll, resetTwists, rollAspects, setAspects, setTwistUsed } from './environment'
import { foundAttached } from './useLibraryItems'
import type { EnvironmentActions } from './RunningEnvironment'
import { challengeFromTemplate, groupFromTemplate, templateFromChallenge, templateFromGroup } from '../template/to-table'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Dialog =
  | { kind: 'quick'; which: QuickAddKind; owned?: boolean }
  | { kind: 'environment' }
  | { kind: 'scene'; target: EditorTarget }
  | { kind: 'sceneStart'; sceneId: string }
  | { kind: 'finishIssue' }
  | { kind: 'issueText'; issueId: string; field: 'title' | 'summary' }
  | { kind: 'sceneRecord'; sceneId: string }
  | { kind: 'sceneDelete'; sceneId: string; number: number }
  | { kind: 'asideRemove'; ref: OppositionRef; name: string }
  | { kind: 'heroHealth' | 'heroMod' | 'heroTwist' | 'heroRemove'; hero: HeroView }
  | { kind: 'removeItem'; ref: T.ItemRef; name: string }
  | { kind: 'memberMod'; groupId: string; memberId: string; name: string }
  | { kind: 'fix'; part: 'current' | 'acted' | 'round' }
  | { kind: 'update'; ref: { kind: 'hero' | 'villain'; id: string }; sheet: Hero | Villain }
  | { kind: 'review'; heroId: string }
  | { kind: 'startHosting' }
  | { kind: 'invite' }
  | { kind: 'bringVillain'; villain: Villain }
  | { kind: 'color'; ref: T.ItemRef }
  | { kind: 'recalculate'; villainId: string }
  | { kind: 'editSteps'; challengeId: string }
  | { kind: 'capture'; villainId: string; name: string }

/** How long a started scene can be undone. */
export const SCENE_UNDO_MS = 30_000

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })
const noSave = async () => {}

const sameColors = (a: Appearance | undefined, b: Appearance | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The update dialog's list: the sheet's changes, and a line for new colors, which `sheetDiff` leaves out. */
const withColors = (changes: readonly DiffSection[], from: Hero | Villain, to: Hero | Villain): DiffSection[] => (sameColors(from.appearance, to.appearance) ? [...changes] : [...changes, { section: 'Colors', changes: [appearanceText(appearanceOf(isHeroDoc(to) ? { kind: 'hero', appearance: to.appearance } : { kind: 'villain', appearance: to.appearance }))] }])
const isHeroDoc = (doc: Hero | Villain): doc is Hero => 'method' in doc

/** What the update dialog shows for a copy and a newer library sheet: the changes, the adjustments, and the line on Health. */
function updatePreview(copy: HeroInGame | VillainInGame, sheet: Hero | Villain) {
  if ('method' in sheet) {
    const hero = copy as HeroInGame
    const { adjustments } = reconcile(hero.play, sheet, hero.sheet)
    return { name: heroDisplayName(hero.sheet), changes: withColors(sheetDiff(hero.sheet, sheet), hero.sheet, sheet), adjustments, healthLine: healthLine(hero.play, buildSheet(hero.sheet).maxHealth, adjustments) }
  }
  const villain = copy as VillainInGame
  const { adjustments } = reconcileVillain(villain.play, sheet, villain.sheet)
  return { name: villainDisplayName(villain.sheet), changes: withColors(sheetDiff(villain.sheet, sheet), villain.sheet, sheet), adjustments, healthLine: healthLine(villain.play, villainHealth(villain.sheet, villain.play).maxHealth, adjustments) }
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
  // Alerts (docs/design/settings/spec.md, section 4): only a hosted game changes without the GM.
  const ownChange = useRef<string | null>(null)
  const alertWatch = useMemo(() => (host && game ? gmWatch(game) : undefined), [host, game])
  useAlerts(alertWatch, (before, after) => (JSON.stringify(after) === ownChange.current ? [] : gmAlerts(before, after)), game ? gameDisplayName(game) : '')
  const libraryHeroes = useDocMap(game?.heroes.filter((h) => !h.player).map((h) => h.sourceId) ?? [], loadHero, noSave)
  const libraryVillains = useDocMap(game?.villains.map((v) => v.sourceId) ?? [], loadVillain, noSave)
  const phone = useMediaQuery('(max-width: 759px)', false)
  const now = useTick()
  const newGameDefaults = useSettings().settings.newGame
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [running, setRunning] = useState<T.ItemRef | null>(null)
  // The turn last seen: when it becomes the environment's turn (or the game opens on it), its panel opens (npcs spec, section 6).
  const [seenTurn, setSeenTurn] = useState<string | null>(null)
  const [tab, setTab] = useState<'table' | 'gm' | 'log'>('table')
  const [gmTab, setGmTab] = useState<GmTab>('bring')
  const [announce, setAnnounce] = useState('')
  const [hostError, setHostError] = useState<string | null>(null)
  // Quick add's "Save to library" failing (the item is still on the table).
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null)
  const templates = useOptionalTemplateStores()
  // Display windows of this game on this device (Open display view) get what observers see.
  // The game before a scene started, kept until the undo window closes.
  const [sceneUndo, setSceneUndo] = useState<{ entryId: string; before: Game; label: string; undone: string; toast?: string } | null>(null)
  const [toasts, setToasts] = useState<ToastData[]>([])
  // A sheet update opened from the Start issue dialog, over it.
  const [startReview, setStartReview] = useState<string | null>(null)
  useEffect(() => {
    if (!sceneUndo) return
    const timer = setTimeout(() => setSceneUndo(null), SCENE_UNDO_MS)
    return () => clearTimeout(timer)
  }, [sceneUndo])
  const observed = useMemo(() => (game ? project(game, 'observer') : undefined), [game])
  useDisplayBroadcast(id, observed, host?.room)
  // A villain's status die changing, or a player's new Overcome on a challenge, is announced to the GM.
  const seenFeed = useRef(game?.feed)
  const feed = game?.feed
  const seenRequests = useRef(game && new Set(game.challenges.flatMap((c) => c.requests.map((r) => r.id))))
  const challenges = game?.challenges
  const heroesNow = game?.heroes
  useEffect(() => {
    const lines = seenFeed.current && feed ? newStatusLines(seenFeed.current, feed) : []
    seenFeed.current = feed
    const known = seenRequests.current
    const requests = (challenges ?? []).flatMap((c) => c.requests.filter((r) => known && !known.has(r.id)).map((r) => `${T.heroLabelOf(heroesNow ?? [], r.heroId)} rolled ${r.total} to Overcome on ${c.name}.`))
    if (challenges) seenRequests.current = new Set(challenges.flatMap((c) => c.requests.map((r) => r.id)))
    if (lines.length || requests.length) setAnnounce([...lines, ...requests].join(' '))
    // `heroesNow` only names them: a new Overcome is what's announced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, challenges])

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

  // The host logs status changes itself, since players' actions go straight to it.
  const apply = host
    ? (fn: (g: Game) => Game) => {
        host.apply(fn)
        // The GM's own change: nothing to alert them about.
        ownChange.current = host.game ? JSON.stringify(gmWatch(host.game)) : null
      }
    : (fn: (g: Game) => Game) => editor.apply((g) => logStatusChanges(g, fn(g), clock()))
  const between = betweenIssues(game)
  const issue = currentIssue(game)
  const turnKey = `${game.round}:${game.turn.current ? T.actorKey(game.turn.current) : ''}`
  if (turnKey !== seenTurn) {
    setSeenTurn(turnKey)
    const current = game.turn.current
    if (current?.kind === 'environment' && game.round > 0 && !between) {
      setRunning({ kind: 'environment', id: current.id })
      if (phone) setTab('gm')
    }
  }
  const addToast = (text: string, warn = false) => setToasts((t) => [...t, { id: clock().newId(), text, ...(warn ? { warn: true } : {}) }])

  /** Finishes the issue, with Undo on its log line. */
  const finish = (choices: FinishChoices) => {
    let finished: Issue | undefined
    let undo: NonNullable<typeof sceneUndo> | null = null
    apply((g) => {
      const next = finishIssue(g, choices, clock())
      const entry = next.feed.at(-1)
      if (next !== g && entry) {
        finished = next.issues.find((i) => i.id === g.currentIssueId)
        undo = { entryId: entry.id, before: structuredClone(g), label: `Undo finishing issue ${finished!.number}`, undone: 'Issue finish undone.', toast: 'Undone. Back issues players already added stay; they can remove them on the Advancement page.' }
      }
      return next
    })
    setSceneUndo(undo)
    const done = finished as Issue | undefined
    if (!done) return
    setAnnounce(`Issue ${done.number} finished: ${issueTitle(done)}.`)
  }

  const startHosting = (name: string) => {
    setHostError(null)
    void session.hostGame(game.id, name).then((why) => why && setHostError(why))
  }
  const connected = hosted?.connected ?? new Set<string>()
  const players = game.heroes.filter((h) => h.player)
  const zone = T.sceneZone({ scene: sceneOnTable(game) })

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
    if (sheetDiff(copy.sheet, doc).length) return doc
    // New colors only: offered for a sheet changed since it was copied, so a color chosen at the table doesn't look like a library change.
    return doc.updatedAt > copy.sheet.updatedAt && !sameColors(copy.sheet.appearance, doc.appearance) ? doc : undefined
  }

  // ---- What the cards show ----

  const table = project(game, 'gm')
  const heroes: HeroView[] = game.heroes.map((h) => heroView(h, { scene: table.scene }, { disconnected: Boolean(h.player && !connected.has(h.player.clientId)), syncRequested: game.pendingSyncs.some((r) => r.heroId === h.id), waiting: (game.pendingHits ?? []).filter((x) => x.heroId === h.id), chooser: T.defenseChooser(h) }))
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
  const planned = game.scenes.filter((s) => s.state === 'planned')
  const nextScene = planned[0]
  // Someone joining or leaving since makes "restore it exactly" wrong for them, so Undo goes.
  const sameHeroes = (a: Game, b: Game) => a.heroes.map((h) => h.id).join() === b.heroes.map((h) => h.id).join()
  const logUndo =
    sceneUndo && sameHeroes(sceneUndo.before, game)
      ? {
          entryId: sceneUndo.entryId,
          label: sceneUndo.label,
          onUndo: () => {
            const { before, undone, toast } = sceneUndo
            setSceneUndo(null)
            apply(() => before)
            setAnnounce(undone)
            if (toast) addToast(toast)
          },
        }
      : undefined
  const nextUp = nextScene ? `Next up: scene ${sceneNumber(game, nextScene.id)}, ${sceneName(nextScene)} (planned).` : 'Nothing planned yet.'
  const gm: GmControls = {
    ...(logUndo ? { logUndo } : {}),
    nextUp,
    ...(between ? { backIssues: backIssueStatuses(game, connected), startIssue: () => setDialog(nextScene ? { kind: 'sceneStart', sceneId: nextScene.id } : { kind: 'scene', target: { kind: 'new' } }) } : {}),
    setPosition: (i) => apply((g) => T.setTrackerPosition(g, i, clock())),
    changeHeroPoints: (by) => apply((g) => changeHeroPoints(g, by, clock())),
    sceneMenu: [
      ...(env ? [{ label: 'Environment color…', onSelect: () => setDialog({ kind: 'color', ref: { kind: 'environment', id: env.id } }) }] : []),
      { label: 'Edit this scene…', onSelect: () => setDialog({ kind: 'scene', target: { kind: 'current' } }) },
      nextScene ? { label: `Start the next scene: ${sceneName(nextScene)}…`, onSelect: () => setDialog({ kind: 'sceneStart', sceneId: nextScene.id }) } : { label: 'Plan the next scene…', onSelect: () => setDialog({ kind: 'scene', target: { kind: 'new' } }) },
      { label: 'Finish the issue…', onSelect: () => setDialog({ kind: 'finishIssue' }) },
      {
        label: 'Plan scenes',
        onSelect: () => {
          setGmTab('scenes')
          if (phone) setTab('gm')
        },
      },
      { label: 'Environment…', onSelect: () => setDialog({ kind: 'environment' }) },
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
      { label: 'Color…', onSelect: () => setDialog({ kind: 'color', ref }) },
      ...(() => {
        const copy = ref.kind === 'villain' ? T.findVillain(game, ref.id) : undefined
        const newer = copy && libraryChange('villain', copy)
        return newer ? [{ label: `Library sheet changed ${formatAgoInline(newer.updatedAt, now)}`, note: true as const, onSelect: () => {} }, { label: 'Update from library…', onSelect: () => setDialog({ kind: 'update', ref: { kind: 'villain', id: ref.id }, sheet: newer }) }] : []
      })(),
      ...(ref.kind === 'villain' ? [{ label: 'Recalculate Health…', onSelect: () => setDialog({ kind: 'recalculate', villainId: ref.id }) }] : []),
      ...(ref.kind === 'challenge' ? [{ label: 'Edit steps…', onSelect: () => setDialog({ kind: 'editSteps', challengeId: ref.id }) }, { label: 'Reset', onSelect: () => apply((g) => T.resetChallenge(g, ref.id, clock())) }] : []),
      ...(() => {
        const challenge = ref.kind === 'challenge' ? game.challenges.find((c) => c.id === ref.id) : undefined
        if (!challenge || challenge.linkedVillainId) return []
        if (challenge.owner.kind === 'environment') return [{ label: 'Give to the GM', onSelect: () => apply((g) => T.setChallengeOwner(g, ref.id, 'gm')) }]
        return game.environment ? [{ label: 'Give to the environment', onSelect: () => apply((g) => T.setChallengeOwner(g, ref.id, 'environment')) }] : []
      })(),
      // A Titan's challenge is hidden or shown with its villain.
      ...(ref.kind === 'challenge' && game.challenges.find((c) => c.id === ref.id)?.linkedVillainId ? [] : hidden ? [{ label: 'Reveal', onSelect: () => reveal(ref) }] : [{ label: 'Hide from players', onSelect: () => hide(ref) }]),
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
    answerRequest: (challenge, requestId, check) => apply((g) => T.answerRequest(g, challenge.id, requestId, check, clock())),
    sheets: phone,
  }

  const runningGroup = running?.kind === 'group' ? game.groups.find((g) => g.id === running.id) : undefined
  const runningVillain = running?.kind === 'villain' ? T.findVillain(game, running.id) : undefined
  const runningEnv = running?.kind === 'environment' && game.environment?.id === running.id ? game.environment : undefined
  const environmentActions: EnvironmentActions = {
    roll: (entered) => {
      const roll = rollAspects(game.environment?.aspects ?? [], random ?? Math.random, entered)
      if (roll) apply((g) => logEnvironmentRoll(g, roll, clock()))
      return roll
    },
    setTwistUsed: (twistId, used) => apply((g) => setTwistUsed(g, twistId, used, clock())),
    resetTwists: () => apply((g) => resetTwists(g, clock())),
    setAspects: (aspects) => apply((g) => setAspects(g, aspects, clock())),
    addAttached: (index, count) => apply((g) => addAttached(g, index, count, clock())),
    quickChallenge: () => setDialog({ kind: 'quick', which: 'challenge', owned: true }),
    run: (ref) => setRunning(ref),
    handOff: (to) => turn((g) => T.handOff(g, to, clock())),
    basicAction: (record, followUps, choices) => apply((g) => environmentBasicAction(g, record, followUps, choices, random ?? Math.random, clock())),
  }
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
        danger: (success: boolean) => apply((g) => T.resolveDanger(g, runningVillain.id, success, clock())),
        undoDanger: () => apply((g) => T.undoDanger(g, runningVillain.id, clock())),
        captured: () => setDialog({ kind: 'capture', villainId: runningVillain.id, name: villainDisplayName(runningVillain.sheet) }),
        escapes: () => {
          const name = villainDisplayName(runningVillain.sheet)
          apply((g) => setAside(g, { kind: 'villain', id: runningVillain.id }, sceneNumber(g, g.currentSceneId), clock(), `${name} escapes and is set aside for a later scene.`))
          setRunning(null)
        },
        status: {
          setOverride: (override) => apply((g) => setStatusOverride(g, runningVillain.id, override)),
          setHandCount: (n) => apply((g) => setHandCount(g, runningVillain.id, n, clock())),
          setWeakness: (tier, condition) => apply((g) => setWeakness(g, runningVillain.id, tier, condition, clock())),
          setStep: (challenge, i, done) => apply((g) => T.setChallengeStep(g, challenge.id, i, done, clock())),
        } satisfies VillainStatusActions,
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
    : runningGroup
      ? { kind: 'group' as const, group: runningGroup, actions: groupActions(runningGroup.id) }
      : runningEnv
        ? { kind: 'environment' as const, env: runningEnv, actions: environmentActions }
        : undefined

  /** An environment template comes in with copies of its attached templates, as the library has them now (a deleted one is left out). */
  const bringInEnvironment = async (t: EnvironmentTemplate) => {
    const found = await foundAttached(t, templates)
    apply((g) => T.setEnvironment(g, { ...environmentFromTemplate(t, found), hidden: newGameDefaults.startHidden }, clock()))
  }
  /** A villain's copy waiting off the table (there's one per game): it comes on as itself, keeping its Health. */
  const waitingCopy = (item: LibraryItem) => (item.type.key === 'villain' ? game.offTable.villains.find((v) => v.sourceId === item.doc.id) : undefined)
  const bring = {
    note: (item: LibraryItem) => waitingNote(game, item.type.key, item.doc.id),
    placeOf: (item: LibraryItem) => {
      if (waitingCopy(item)) return 'waiting' as const
      // An environment is on the table once (another one replaces it); other templates can come in again and again.
      if (item.type.key === 'environment') return game.environment?.templateId === item.doc.id ? (game.environment.hidden ? ('hidden' as const) : ('shown' as const)) : ('absent' as const)
      // A template already used here can be added again: "Add another".
      if (item.type.key === 'minion' || item.type.key === 'lieutenant') return game.groups.some((g) => g.templateId === item.doc.id && g.kind === (item.type.key === 'minion' ? 'minions' : 'lieutenants')) ? ('again' as const) : ('absent' as const)
      if (item.type.key === 'challenge') return game.challenges.some((c) => c.templateId === item.doc.id) ? ('again' as const) : ('absent' as const)
      if (item.type.key !== 'hero' && item.type.key !== 'villain') return 'absent' as const
      const kind = item.type.key === 'hero' ? 'hero' : 'villain'
      const copy = T.copyOf(game, kind, item.doc.id)
      if (!copy) return 'absent' as const
      if (!(copy as HeroInGame).player && sheetDiff(copy.sheet, item.doc as unknown as Hero | Villain).length) return 'changed' as const
      return 'hidden' in copy && copy.hidden ? ('hidden' as const) : ('shown' as const)
    },
    bringIn: (item: LibraryItem, count?: number, quick = false) => {
      const waiting = waitingCopy(item)
      if (waiting) return apply((g) => moveToTable(g, { kind: 'villain', id: waiting.id }, true, clock()))
      // Everything is copied into this game: damage never touches the library or other games.
      if (item.type.key === 'hero') apply((g) => T.addHero(g, item.doc as unknown as Hero, clock()))
      // A villain asks how many heroes are at the table, and what it comes with (the villain wizard spec, section 7); "the rest" come in for this table's heroes, alone.
      else if (item.type.key === 'villain' && quick) apply((g) => T.addVillain(g, item.doc as unknown as Villain, clock(), newGameDefaults.startHidden, Math.max(1, g.heroes.length), newGameDefaults.playersSee))
      else if (item.type.key === 'villain') setDialog({ kind: 'bringVillain', villain: item.doc as unknown as Villain })
      // A template brings in a fresh copy each time, hidden or not like everything else.
      else if (item.type.key === 'minion' || item.type.key === 'lieutenant') {
        const t = item.doc as unknown as MinionTemplate
        apply((g) => T.addGroup(g, groupFromTemplate(t, item.type.key === 'minion' ? 'minions' : 'lieutenants', count ?? t.groupSize, newGameDefaults.startHidden), clock()))
      } else if (item.type.key === 'challenge') apply((g) => T.addChallenge(g, challengeFromTemplate(item.doc as unknown as ChallengeTemplate, newGameDefaults.startHidden), clock()))
      else if (item.type.key === 'environment') void bringInEnvironment(item.doc as unknown as EnvironmentTemplate)
    },
    update: (item: LibraryItem) => {
      const kind = item.type.key === 'hero' ? 'hero' : 'villain'
      const copy = T.copyOf(game, kind, item.doc.id)
      if (copy) setDialog({ kind: 'update', ref: { kind, id: copy.id }, sheet: item.doc as unknown as Hero | Villain })
    },
  }

  /** Reviewing a player's sheet update. */
  const reviewDialog = (heroId: string, close: () => void) => {
    const request = game.pendingSyncs.find((r) => r.heroId === heroId)
    const copy = T.findHero(game, heroId)
    if (!request || !copy) return null
    const preview = updatePreview(copy, request.sheet)
    const who = copy.player?.name ?? 'the player'
    const approve = () => (host ? host.approveSync(copy.id) : apply((g) => T.updateSheet(g, { kind: 'hero', id: copy.id, sheet: request.sheet }, clock(), "at the player's request")))
    const decline = () => (host ? host.declineSync(copy.id) : apply((g) => ({ ...g, pendingSyncs: g.pendingSyncs.filter((r) => r.heroId !== copy.id) })))
    return <UpdateDialog {...preview} review={{ title: `Update ${preview.name} to ${who}'s sheet?`, requested: `Requested ${formatAgo(request.at, now).replace(/^./, (c) => c.toLowerCase())}.`, onDecline: decline }} onUpdate={approve} onClose={close} />
  }

  const screen = (
    <GmScreen
      game={game}
      quickAdd={(which) => setDialog({ kind: 'quick', which })}
      {...(runningPanel ? { running: runningPanel } : {})}
      stopRunning={() => setRunning(null)}
      bring={bring}
      setNotes={(notes) => apply((g) => T.setNotes(g, notes))}
      tab={gmTab}
      setTab={setGmTab}
      scenes={{
        start: (sceneId) => setDialog({ kind: 'sceneStart', sceneId }),
        edit: (sceneId) => setDialog({ kind: 'scene', target: sceneId === game.currentSceneId ? { kind: 'current' } : { kind: 'planned', sceneId } }),
        plan: () => setDialog({ kind: 'scene', target: { kind: 'new' } }),
        move: (sceneId, to) => apply((g) => moveScene(g, sceneId, to)),
        duplicate: (sceneId) => apply((g) => duplicateScene(g, sceneId, clock())),
        remove: (sceneId) => setDialog({ kind: 'sceneDelete', sceneId, number: sceneNumber(game, sceneId) }),
        record: (sceneId) => setDialog({ kind: 'sceneRecord', sceneId }),
        addAside: (ref, sceneId) => apply((g) => addAsideTo(g, ref, sceneId, clock())),
        removeAside: (chip) => setDialog({ kind: 'asideRemove', ref: chip.ref, name: chip.name }),
        finish: () => setDialog({ kind: 'finishIssue' }),
        renameIssue: (issueId) => setDialog({ kind: 'issueText', issueId, field: 'title' }),
        editIssueSummary: (issueId) => setDialog({ kind: 'issueText', issueId, field: 'summary' }),
      }}
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
      sheets={phone}
    />
  )
  const center = <TableCenter game={table} heroes={heroes} villains={villains} now={now} gm={gm} hideLog={phone} />
  const saveError = editor.saveError
  const details = between ? finishedPill(game.issues) : `${game.round > 0 ? `Round ${game.round}` : 'Not started'} · ${sceneName(currentScene(game))}`

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
                  <TableLog entries={game.feed} now={now} gm undo={logUndo} />
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
            environment={game.environment?.name}
            owned={Boolean(dialog.owned)}
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
      {dialog?.kind === 'scene' && (
        <SceneEditor
          game={game}
          target={dialog.target}
          clock={clock}
          onSave={(draft, restart) => {
            const { target } = dialog
            setDialog(null)
            apply((g) => (target.kind === 'current' ? saveCurrentScene(g, draft, restart, clock()) : savePlannedScene(g, target.kind === 'planned' ? target.sceneId : undefined, draft, clock()).game))
          }}
          {...((dialog.target.kind === 'planned' && dialog.target.sceneId === nextScene?.id) || (dialog.target.kind === 'new' && !nextScene)
            ? {
                onSaveAndStart: (draft: SceneDraft) => {
                  const { target } = dialog
                  const sceneId = target.kind === 'planned' ? target.sceneId : clock().newId()
                  apply((g) => savePlannedScene(g, sceneId, draft, clock()).game)
                  setDialog({ kind: 'sceneStart', sceneId })
                },
              }
            : {})}
          {...(dialog.target.kind === 'planned'
            ? {
                onDelete: () => {
                  const { target } = dialog
                  setDialog(null)
                  if (target.kind === 'planned') apply((g) => deleteScene(g, target.sceneId))
                },
              }
            : {})}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'sceneStart' && game.scenes.some((s) => s.id === dialog.sceneId) && (
        <StartSceneDialog
          game={game}
          sceneId={dialog.sceneId}
          onEdit={() => setDialog({ kind: 'scene', target: { kind: 'planned', sceneId: dialog.sceneId } })}
          {...(between ? { issue: { facts: issueStartFacts(game, connected), ...(host ? { onRemind: () => host.remindUnspent() } : {}), onReview: setStartReview } } : {})}
          onStart={(choices, recover) => {
            const { sceneId } = dialog
            setDialog(null)
            setRunning(null)
            const c = clock()
            let undo: { entryId: string; before: Game; label: string; undone: string } | null = null
            let line = ''
            apply((g) => {
              const next = between ? startIssue(g, sceneId, { ...choices, recover }, c) : startScene(g, sceneId, choices, c)
              const entry = next.feed.at(-1)
              if (next !== g && entry) {
                // A copy: both the editor's draft and what the host hands over can change afterwards.
                undo = { entryId: entry.id, before: structuredClone(g), label: between ? `Undo starting issue ${nextIssueNumber(g)}` : `Undo starting scene ${sceneNumber(next, sceneId)}`, undone: between ? 'Issue start undone.' : 'Scene change undone.' }
                line = entry.text
              }
              return next
            })
            setSceneUndo(undo)
            if (line) setAnnounce(line)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'finishIssue' && issue && (
        <FinishIssueDialog
          game={game}
          connected={connected}
          onFinish={(choices) => {
            setDialog(null)
            setRunning(null)
            finish(choices)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'issueText' &&
        (() => {
          const target = game.issues.find((i) => i.id === dialog.issueId)
          if (!target) return null
          const isTitle = dialog.field === 'title'
          return (
            <IssueTextDialog
              title={isTitle ? `Rename issue ${target.number}` : `Summary of issue ${target.number}`}
              label={isTitle ? 'Title' : 'What happened'}
              value={(isTitle ? target.title : target.summary) ?? ''}
              multiline={!isTitle}
              required={isTitle && target.state === 'finished'}
              onSave={(value) => apply((g) => setIssueRecord(g, target.id, { [dialog.field]: value }))}
              onClose={() => setDialog(null)}
            />
          )
        })()}
      {startReview && reviewDialog(startReview, () => setStartReview(null))}
      {dialog?.kind === 'sceneRecord' &&
        (() => {
          const scene = game.scenes.find((s) => s.id === dialog.sceneId)
          if (!scene) return null
          return <SceneRecordDialog title={`Scene ${sceneNumber(game, scene.id)}: ${sceneName(scene)}`} summary={scene.summary ?? ''} notes={scene.notes} onSave={(record) => apply((g) => setSceneRecord(g, scene.id, record))} onClose={() => setDialog(null)} />
        })()}
      {dialog?.kind === 'sceneDelete' && <ConfirmDialog title={`Delete scene ${dialog.number}?`} text="The scene goes, with anything only it was holding. Anything set aside stays set aside." confirm="Delete" onConfirm={() => apply((g) => deleteScene(g, dialog.sceneId))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'asideRemove' && <ConfirmDialog title={`Remove ${dialog.name} from the game?`} text="This game's copy goes, with its damage, and any scene planning on it loses it. Your library doesn't change." confirm="Remove" onConfirm={() => apply((g) => removeAside(g, dialog.ref, clock()))} onClose={() => setDialog(null)} />}
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
      {dialog?.kind === 'color' &&
        (() => {
          const { ref } = dialog
          const close = (
            <div className="button-row gt-dialog-actions">
              <button type="button" className="button button--primary" onClick={() => setDialog(null)}>
                Done
              </button>
            </div>
          )
          const villain = ref.kind === 'villain' ? T.findVillain(game, ref.id) : undefined
          if (villain) {
            return (
              <Modal title={`Color: ${villainDisplayName(villain.sheet)}`} onClose={() => setDialog(null)} wide>
                <ColorPicker kind="villain" appearance={villain.sheet.appearance} name={villainDisplayName(villain.sheet)} onChange={(appearance) => apply((g) => T.setCharacterColors(g, { kind: 'villain', id: ref.id }, appearance))} />
                {close}
              </Modal>
            )
          }
          const group = ref.kind === 'group' ? game.groups.find((g) => g.id === ref.id) : undefined
          const challenge = ref.kind === 'challenge' ? game.challenges.find((c) => c.id === ref.id) : undefined
          const environment = ref.kind === 'environment' && game.environment?.id === ref.id ? game.environment : undefined
          const item = group ? ({ kind: 'group', environment: group.owner.kind === 'environment', color: group.color } as const) : challenge ? ({ kind: 'challenge', environment: challenge.owner.kind === 'environment', color: challenge.color } as const) : environment ? ({ kind: 'environment', color: environment.color } as const) : undefined
          const name = group?.name ?? challenge?.name ?? environment?.name
          if (!item || name === undefined) return null
          return (
            <Modal title={`Color: ${name}`} onClose={() => setDialog(null)} wide>
              <SingleColorPicker item={item} name={name} onChange={(color) => apply((g) => T.setItemColor(g, ref, color))} />
              {close}
            </Modal>
          )
        })()}
      {dialog?.kind === 'bringVillain' && (
        <BringInVillainDialog
          villain={dialog.villain}
          heroes={game.heroes.length}
          onClose={() => setDialog(null)}
          onBring={(heroCount, picks) => {
            const villain = dialog.villain
            setDialog(null)
            // Its minions and lieutenants come in as the GM's groups, hidden or not like the villain.
            apply((g) => picks.reduce((x, p) => T.addGroup(x, groupFromTemplate(p.template, p.attachment.kind === 'minion' ? 'minions' : 'lieutenants', p.count, newGameDefaults.startHidden), clock()), T.addVillain(g, villain, clock(), newGameDefaults.startHidden, heroCount, newGameDefaults.playersSee)))
          }}
        />
      )}
      {dialog?.kind === 'recalculate' &&
        (() => {
          const copy = T.findVillain(game, dialog.villainId)
          if (!copy) return null
          return (
            <RecalculateHealthDialog
              villain={copy.sheet}
              heroes={copy.play.heroCount ?? copy.sheet.heroCount}
              onClose={() => setDialog(null)}
              onApply={(n) => {
                setDialog(null)
                changeVillain(copy.id, (p, c) => recalculateHealth(copy.sheet, p, n, c))
              }}
            />
          )
        })()}
      {dialog?.kind === 'capture' && (
        <ConfirmDialog
          title={`${dialog.name} is captured?`}
          text="It leaves the table and the turn order, and this game's copy of it goes. Your library sheet doesn't change."
          confirm="Captured"
          onConfirm={() => {
            apply((g) => T.removeFromTable(g, { kind: 'villain', id: dialog.villainId }, clock(), `${dialog.name} is captured.`))
            setRunning(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'editSteps' &&
        (() => {
          const challenge = game.challenges.find((c) => c.id === dialog.challengeId)
          if (!challenge) return null
          return <EditStepsDialog name={challenge.name} labels={challenge.steps.map((s) => s.label)} description={challenge.description} whenDone={challenge.whenDone} onSave={(edit) => apply((g) => T.editChallenge(g, challenge.id, edit))} onClose={() => setDialog(null)} />
        })()}
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
      {dialog?.kind === 'review' && reviewDialog(dialog.heroId, () => setDialog(null))}
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
      {toasts.length > 0 && <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />}
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
