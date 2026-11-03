/**
 * The game table for the GM (docs/design/game-table/spec.md; Phase 1: no network). The game is
 * the single source of truth: heroes and villains on the table are copies inside it, so every
 * change, the GM's edits to heroes included, changes the game and is saved with it. The rules
 * are in ./table.ts and ./hero-changes.ts; this page wires them to the shared center
 * (./TableCenter.tsx) and the GM screen (./GmScreen.tsx).
 */
import { useCallback, useState } from 'react'
import { gamesPath } from '../app/route'
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
import { formDice } from '../play/forms'
import { currentHealth, effectiveZone, statusDieFor, type Clock } from '../play/state'
import { useTick } from '../play/useTick'
import { villainDisplayName, type Villain, type VillainPlayState } from '../villain/model'
import { villainHealth, villainSummary } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import { AddChallengeDialog, AddGroupDialog, ConfirmDialog, EnvironmentDialog, FixTurnDialog, HealthDialog, ModDialog, SceneSetupDialog, TwistDialog, UpdateDialog } from './dialogs'
import { GmScreen, type GroupActions, type QuickAddKind } from './GmScreen'
import { applyHeroChange, type HeroChange } from './hero-changes'
import { gameDisplayName, sceneDisplayName, type ActorRef, type Game, type HeroInGame, type VillainInGame } from './model'
import { healthLine, reconcile, reconcileVillain } from './reconcile'
import { sheetDiff } from './sheet-diff'
import { TableCenter, TableLog, ZoneChip, type GmControls, type HeroView, type VillainView } from './TableCenter'
import { useDocMap } from './useDocMap'
import { useGameEditor } from './useGameEditor'
import * as T from './table'

type Dialog =
  | { kind: 'quick'; which: QuickAddKind }
  | { kind: 'environment' }
  | { kind: 'scene' }
  | { kind: 'heroHealth' | 'heroMod' | 'heroTwist' | 'heroRemove'; hero: HeroView }
  | { kind: 'removeItem'; ref: T.ItemRef; name: string }
  | { kind: 'memberMod'; groupId: string; memberId: string; name: string }
  | { kind: 'fix'; part: 'current' | 'acted' | 'round' }
  | { kind: 'update'; ref: { kind: 'hero' | 'villain'; id: string }; sheet: Hero | Villain }

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

  const editor = useGameEditor(id)
  const game = editor.state.status === 'ready' ? editor.state.doc : undefined
  const libraryHeroes = useDocMap(game?.heroes.filter((h) => !h.player).map((h) => h.sourceId) ?? [], loadHero, noSave)
  const libraryVillains = useDocMap(game?.villains.map((v) => v.sourceId) ?? [], loadVillain, noSave)
  const phone = useMediaQuery('(max-width: 759px)', false)
  const now = useTick()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [running, setRunning] = useState<T.ItemRef | null>(null)
  const [tab, setTab] = useState<'table' | 'gm' | 'log'>('table')
  const [announce, setAnnounce] = useState('')

  if (!game) {
    return (
      <div className="app-main">
        <p>
          <a href={gamesPath}>← Games</a>
        </p>
        {editor.state.status === 'loading' && <p>Loading…</p>}
        {editor.state.status === 'missing' && <p role="alert">There's no saved game with that link. It may have been deleted.</p>}
        {editor.state.status === 'unreadable' && <p role="alert">This game couldn't be read: {editor.state.error}</p>}
        {editor.state.status === 'error' && <p role="alert">Something went wrong loading this game: {editor.state.message}</p>}
      </div>
    )
  }

  const { apply } = editor
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

  const heroes: HeroView[] = game.heroes.map((h) => {
    const sheet = buildSheet(h.sheet)
    const play = T.heroPlayInScene(game, h.play)
    const heroZone = effectiveZone(sheet, play)
    const statusDie = statusDieFor(formDice(h.sheet, sheet, play), heroZone)
    const health = currentHealth(sheet, play)
    return {
      ref: { kind: 'hero' as const, id: h.id },
      name: heroDisplayName(h.sheet),
      sub: h.player ? h.player.name || 'A player' : "GM's hero",
      ...(heroZone ? { zone: heroZone } : {}),
      ...(health !== undefined ? { health } : {}),
      ...(sheet.maxHealth !== undefined ? { maxHealth: sheet.maxHealth } : {}),
      ...(statusDie ? { statusDie } : {}),
      mods: play.mods,
      minions: (play.minions ?? []).map((m) => ({ id: m.id, name: m.name, die: m.die })),
      reactionUsed: play.reactionUsed,
    }
  })

  const villains: VillainView[] = game.villains.map((v) => {
    const { id: _, twists: _t, name, ...shown } = villainSummary(v.sheet, v.play)
    return { ref: { kind: 'villain' as const, id: v.id }, name, hidden: v.hidden, playersSee: v.playersSee, ...shown, kind: buildVillainSheet(v.sheet).major ? 'Major villain' : 'Minor villain' }
  })

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
      // The GM's own heroes follow the library like villains do (a player's asks to sync instead, from Phase 2).
      const newer = copy && !copy.player ? libraryChange('hero', copy) : undefined
      return [
        ...(newer ? [{ label: `Library sheet changed ${formatAgoInline(newer.updatedAt, now)}`, note: true as const, onSelect: () => {} }, { label: 'Update from library…', onSelect: () => setDialog({ kind: 'update', ref: { kind: 'hero', id: hero.ref.id }, sheet: newer }) }] : []),
        { label: 'Change Health…', onSelect: () => setDialog({ kind: 'heroHealth', hero }) },
        { label: 'Give a bonus or penalty…', onSelect: () => setDialog({ kind: 'heroMod', hero }) },
        { label: 'Add a twist…', onSelect: () => setDialog({ kind: 'heroTwist', hero }) },
        { label: hero.reactionUsed ? 'Mark reaction unused' : 'Mark reaction used', onSelect: () => changeHero(hero.ref.id, { kind: 'reaction', used: !hero.reactionUsed }) },
        remove,
      ]
    },
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
    roll: (memberId, roll) => apply((g) => T.recordMemberRoll(g, groupId, memberId, roll, clock())),
  })
  const runningPanel = runningVillain ? { kind: 'villain' as const, villain: runningVillain, change: (fn: (p: VillainPlayState, c: Clock) => VillainPlayState) => changeVillain(runningVillain.id, fn) } : runningGroup ? { kind: 'group' as const, group: runningGroup, actions: groupActions(runningGroup.id) } : undefined

  const bring = {
    placeOf: (item: LibraryItem) => {
      const kind = item.type.key === 'hero' ? 'hero' : 'villain'
      const copy = T.copyOf(game, kind, item.doc.id)
      if (!copy) return 'absent' as const
      if (!(copy as HeroInGame).player && sheetDiff(copy.sheet, item.doc as unknown as Hero | Villain).length) return 'changed' as const
      return 'hidden' in copy && copy.hidden ? ('hidden' as const) : ('shown' as const)
    },
    bringIn: (item: LibraryItem) => {
      // Everything is copied into this game: damage never touches the library or other games.
      if (item.type.key === 'hero') apply((g) => T.addHero(g, item.doc as unknown as Hero, clock()))
      else if (item.type.key === 'villain') apply((g) => T.addVillain(g, item.doc as unknown as Villain, clock()))
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
      random={random}
    />
  )
  const center = <TableCenter game={game} heroes={heroes} villains={villains} now={now} gm={gm} hideLog={phone} />
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
          ) : (
            <span className="gt-pill">Not hosting</span>
          )}
        </header>
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
          <AddChallengeDialog onAdd={(c) => apply((g) => T.addChallenge(g, c, clock()))} onClose={() => setDialog(null)} />
        ) : (
          <AddGroupDialog kind={dialog.which} onAdd={(grp) => apply((g) => T.addGroup(g, grp, clock()))} onClose={() => setDialog(null)} />
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
          onConfirm={() => apply((g) => T.removeFromTable(g, dialog.hero.ref, clock()))}
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
