/**
 * The game table for the GM (docs/design/game-table/spec.md; Phase 1: no network). The game
 * document is saved as it changes, and so are the heroes and villains on the table, which the
 * table works on directly. The rules are in ./table.ts and ./hero-changes.ts; this page wires
 * them to the shared center (./TableCenter.tsx) and the GM screen (./GmScreen.tsx).
 */
import { useCallback, useEffect, useState } from 'react'
import { useGameStore } from '../app/game-store-context'
import { listPath, playPath } from '../app/route'
import { useStore } from '../app/store-context'
import { useVillainStore } from '../app/villain-store-context'
import { RenameHeading } from '../components/RenameHeading'
import { useMediaQuery } from '../components/useMediaQuery'
import { buildSheet } from '../creation/sheet'
import { useDocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import { heroDisplayName, isDraft, newId, type Hero } from '../hero/model'
import { PopoverGroup, type MenuItem } from '../library/Popover'
import type { LibraryItem } from '../library/registry'
import { formDice } from '../play/forms'
import { currentHealth, effectiveZone, emptyPlay, setReactionUsed, setSceneZone, statusDieFor, type Clock } from '../play/state'
import { useTick } from '../play/useTick'
import { villainDisplayName, type Villain, type VillainPlayState } from '../villain/model'
import { emptyVillainPlay, villainSummary } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import { AddChallengeDialog, AddGroupDialog, ConfirmDialog, EnvironmentDialog, FixTurnDialog, HealthDialog, ModDialog, SceneSetupDialog, TwistDialog } from './dialogs'
import { GmScreen, type GroupActions, type QuickAddKind } from './GmScreen'
import { applyHeroChange, type HeroChange } from './hero-changes'
import { gameDisplayName, sceneDisplayName, type ActorRef, type Game } from './model'
import { TableCenter, TableLog, ZoneChip, type GmControls, type HeroView, type VillainView } from './TableCenter'
import { useDocMap } from './useDocMap'
import * as T from './table'

type Dialog =
  | { kind: 'quick'; which: QuickAddKind }
  | { kind: 'environment' }
  | { kind: 'scene' }
  | { kind: 'heroHealth' | 'heroMod' | 'heroTwist' | 'heroRemove'; hero: HeroView }
  | { kind: 'removeItem'; ref: T.ItemRef; name: string }
  | { kind: 'memberMod'; groupId: string; memberId: string; name: string }
  | { kind: 'fix'; part: 'current' | 'acted' | 'round' }

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })

/** Replaces the draft's contents with the next game (the reducers return a new object). */
function replaceInto(draft: Game, next: Game) {
  if (next === draft) return
  for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key]
  Object.assign(draft, next)
}

export function GamePage({ id, clock = defaultClock, random }: { id: string; clock?: () => Clock; random?: () => number }) {
  const gameStore = useGameStore()
  const heroStore = useStore()
  const villainStore = useVillainStore()
  const loadGame = useCallback(async (gameId: string): Promise<Lookup<Game>> => {
    const r = await gameStore.get(gameId)
    return r.status === 'found' ? { status: 'found', doc: r.game } : r
  }, [gameStore])
  const saveGame = useCallback((g: Game) => gameStore.save(g), [gameStore])
  const loadHero = useCallback(async (heroId: string): Promise<Lookup<Hero>> => {
    const r = await heroStore.get(heroId)
    return r.status === 'found' ? { status: 'found', doc: r.hero } : r
  }, [heroStore])
  const saveHero = useCallback((h: Hero) => heroStore.save(h), [heroStore])
  const loadVillain = useCallback(async (villainId: string): Promise<Lookup<Villain>> => {
    const r = await villainStore.get(villainId)
    return r.status === 'found' ? { status: 'found', doc: r.villain } : r
  }, [villainStore])
  const saveVillain = useCallback((v: Villain) => villainStore.save(v), [villainStore])

  const editor = useDocumentEditor(id, loadGame, saveGame)
  const game = editor.state.status === 'ready' ? editor.state.doc : undefined
  const heroDocs = useDocMap(game?.heroes.flatMap((h) => (h.source.kind === 'local' ? [h.source.heroId] : [])) ?? [], loadHero, saveHero)
  const villainDocs = useDocMap(game?.villains.map((v) => v.villainId) ?? [], loadVillain, saveVillain)
  const phone = useMediaQuery('(max-width: 759px)', false)
  const now = useTick()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [running, setRunning] = useState<T.ItemRef | null>(null)
  const [tab, setTab] = useState<'table' | 'gm' | 'log'>('table')
  const [announce, setAnnounce] = useState('')

  const localHeroId = (g: Game, tableId: string) => {
    const h = g.heroes.find((x) => x.id === tableId)
    return h?.source.kind === 'local' ? h.source.heroId : undefined
  }
  const names: T.Names = (ref) => {
    if (ref.kind === 'hero') {
      const heroId = game && localHeroId(game, ref.id)
      const doc = heroId ? heroDocs.get(heroId) : undefined
      return doc ? heroDisplayName(doc) : 'A hero'
    }
    const doc = villainDocs.get(ref.id)
    return doc ? villainDisplayName(doc) : 'A villain'
  }

  // A hero on the table has the table's scene zone (it raises their zone, p. 14; heroes only, ruling 64).
  const zone = game ? T.sceneZone(game) : 'green'
  useEffect(() => {
    if (!game) return
    for (const h of game.heroes) {
      if (h.source.kind !== 'local') continue
      const doc = heroDocs.entries.get(h.source.heroId)
      if (doc?.status !== 'ready' || isDraft(doc.doc) || (doc.doc.play?.sceneZone ?? 'green') === zone) continue
      heroDocs.update(h.source.heroId, (hero) => ({ ...hero, play: setSceneZone(hero.play ?? emptyPlay(), zone, clock(), true) }))
    }
  }, [game, zone, heroDocs, clock])

  if (!game) {
    return (
      <div className="app-main">
        <p>
          <a href={listPath}>← Library</a>
        </p>
        {editor.state.status === 'loading' && <p>Loading…</p>}
        {editor.state.status === 'missing' && <p role="alert">There's no saved game with that link. It may have been deleted.</p>}
        {editor.state.status === 'unreadable' && <p role="alert">This game couldn't be read: {editor.state.error}</p>}
        {editor.state.status === 'error' && <p role="alert">Something went wrong loading this game: {editor.state.message}</p>}
      </div>
    )
  }

  const apply = (fn: (g: Game) => Game) => editor.update((draft) => replaceInto(draft, fn(draft)))

  /** A GM change to a hero from the library, recorded in its history; `share` puts it in the log too. */
  const changeHero = (tableId: string, change: HeroChange, share = true) => {
    const heroId = localHeroId(game, tableId)
    if (!heroId) return
    const result = heroDocs.update(heroId, (hero) => {
      if (isDraft(hero)) return hero
      const play = hero.play ?? emptyPlay()
      const next = applyHeroChange(play, buildSheet(hero), change, clock())
      return next === play ? hero : { ...hero, play: next }
    })
    if (!result || !share) return
    const entries = (result.after.play?.history ?? []).slice(result.before.play?.history.length ?? 0).map((e) => ({ ...e, text: e.text.replace(/^GM: /, '') }))
    apply((g) => T.shareHistory(g, heroDisplayName(result.after), entries, clock()))
  }

  /** A change to a villain's play state, its history shared to the log (only the GM's while it's hidden). */
  const changeVillain = (villainId: string, fn: (play: VillainPlayState, c: Clock) => VillainPlayState, share = true) => {
    const result = villainDocs.update(villainId, (v) => {
      const play = v.play ?? emptyVillainPlay()
      const next = fn(play, clock())
      return next === play ? v : { ...v, play: next }
    })
    if (!result || !share) return
    const entries = (result.after.play?.history ?? []).slice(result.before.play?.history.length ?? 0)
    apply((g) => T.shareHistory(g, villainDisplayName(result.after), entries, clock(), T.isHidden(g, { kind: 'villain', id: villainId })))
  }

  /** A turn change: a turn starting clears that character's reaction (and only theirs). */
  const turn = (fn: (g: Game) => T.TurnResult) => {
    let started: ActorRef | undefined
    let lines: string[] = []
    apply((g) => {
      const result = fn(g)
      started = result.started
      const known = new Set(g.feed.map((e) => e.id))
      lines = result.game.feed.filter((e) => !known.has(e.id)).map((e) => e.text)
      return result.game
    })
    if (lines.length) setAnnounce(lines.join(' '))
    const who = started as ActorRef | undefined
    if (who?.kind === 'hero') changeHero(who.id, { kind: 'clearReaction' }, false)
    if (who?.kind === 'villain') changeVillain(who.id, (p, c) => setReactionUsed(p, false, c), false)
  }

  const nameOf = (ref: T.ItemRef | ActorRef) => T.itemName(game, ref, names)
  const strip = (ref: ActorRef) => (T.isHidden(game, ref) && ref.kind !== 'hero' ? `${nameOf(ref)} (hidden)` : nameOf(ref))

  // ---- What the cards show ----

  const heroes: HeroView[] = game.heroes.map((h) => {
    const ref = { kind: 'hero' as const, id: h.id }
    const base = { ref, mods: [], minions: [], reactionUsed: false }
    if (h.source.kind !== 'local') return { ...base, name: 'A player’s hero', sub: 'Joins when the game is hosted', missing: 'Not connected.' }
    const entry = heroDocs.entries.get(h.source.heroId)
    if (!entry || entry.status === 'loading') return { ...base, name: 'Loading…', sub: 'From your library', missing: 'Loading…' }
    if (entry.status !== 'ready' || isDraft(entry.doc)) return { ...base, name: 'A hero', sub: 'From your library', missing: entry.status === 'missing' ? 'This hero was deleted from your library.' : "This hero can't be read." }
    const hero = entry.doc
    const sheet = buildSheet(hero)
    const play = hero.play ?? emptyPlay()
    const heroZone = effectiveZone(sheet, play)
    const statusDie = statusDieFor(formDice(hero, sheet, play), heroZone)
    const health = currentHealth(sheet, play)
    return {
      ...base,
      name: heroDisplayName(hero),
      sub: 'From your library',
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
    const ref = { kind: 'villain' as const, id: v.villainId }
    const base = { ref, hidden: v.hidden, playersSee: v.playersSee, mods: [] }
    const entry = villainDocs.entries.get(v.villainId)
    if (!entry || entry.status === 'loading') return { ...base, name: 'Loading…', kind: 'Villain', missing: 'Loading…' }
    if (entry.status !== 'ready') return { ...base, name: 'A villain', kind: 'Villain', missing: entry.status === 'missing' ? 'This villain was deleted from your library.' : "This villain can't be read." }
    const summary = villainSummary(entry.doc)
    const { id: _, twists: _t, ...shown } = summary
    return { ...base, ...shown, kind: buildVillainSheet(entry.doc).major ? 'Major villain' : 'Minor villain' }
  })

  // ---- The GM's controls ----

  const run = (ref: T.ItemRef) => {
    const same = running?.kind === ref.kind && running.id === ref.id
    setRunning(same ? null : ref)
    if (!same && phone) setTab('gm')
  }
  const reveal = (ref: T.ItemRef) => apply((g) => T.setHidden(g, ref, false, names, clock()))
  const hide = (ref: T.ItemRef) => apply((g) => T.setHidden(g, ref, true, names, clock()))
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
    startRound: (first) => turn((g) => T.startRound(g, first, names, clock())),
    handOff: (to) => turn((g) => T.handOff(g, to, names, clock())),
    turnMenu: [
      { label: "Set who's acting…", onSelect: () => setDialog({ kind: 'fix', part: 'current' }) },
      { label: 'Mark acted or not acted…', onSelect: () => setDialog({ kind: 'fix', part: 'acted' }) },
      { label: 'Set the round number…', onSelect: () => setDialog({ kind: 'fix', part: 'round' }) },
    ],
    heroMenu: (hero) => {
      const remove: MenuItem = { label: 'Remove from the game…', danger: true, onSelect: () => setDialog({ kind: 'heroRemove', hero }) }
      if (hero.missing) return [remove]
      const heroId = localHeroId(game, hero.ref.id)
      return [
        { label: 'Change Health…', onSelect: () => setDialog({ kind: 'heroHealth', hero }) },
        { label: 'Give a bonus or penalty…', onSelect: () => setDialog({ kind: 'heroMod', hero }) },
        { label: 'Add a twist…', onSelect: () => setDialog({ kind: 'heroTwist', hero }) },
        { label: hero.reactionUsed ? 'Mark reaction unused' : 'Mark reaction used', onSelect: () => changeHero(hero.ref.id, { kind: 'reaction', used: !hero.reactionUsed }) },
        ...(heroId ? [{ label: 'Open Play page', href: playPath(heroId), onSelect: () => {} }] : []),
        remove,
      ]
    },
    reveal,
    hide,
    itemMenu: (ref, hidden) => [
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
  const runningVillain = running?.kind === 'villain' && game.villains.some((v) => v.villainId === running.id) ? villainDocs.get(running.id) : undefined
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
      if (item.type.key === 'hero') return game.heroes.some((h) => h.source.kind === 'local' && h.source.heroId === item.doc.id) ? ('shown' as const) : ('absent' as const)
      const v = game.villains.find((x) => x.villainId === item.doc.id)
      return v ? (v.hidden ? ('hidden' as const) : ('shown' as const)) : ('absent' as const)
    },
    bringIn: (item: LibraryItem) => {
      if (item.type.key === 'hero') apply((g) => T.addLocalHero(g, item.doc.id, item.row.name, clock()))
      else if (item.type.key === 'villain') apply((g) => T.addVillain(g, item.doc.id, item.row.name, clock()))
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
  const center = <TableCenter game={game} heroes={heroes} villains={villains} names={names} now={now} gm={gm} hideLog={phone} />
  const saveError = editor.saveError ?? heroDocs.saveError ?? villainDocs.saveError
  const details = `${game.round > 0 ? `Round ${game.round}` : 'Not started'} · ${sceneDisplayName(game)}`

  return (
    <PopoverGroup>
      <div className={phone ? 'gt-page gt-page--phone' : 'gt-page'}>
        <header className="app-header gt-header">
          <a className="button button--quiet button--small" href={listPath}>
            ← Library
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
          text="They leave the table and the turn order. The hero stays in your library, with any damage and changes."
          confirm="Remove"
          onConfirm={() => apply((g) => T.removeFromTable(g, dialog.hero.ref, names, clock()))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'removeItem' && (
        <ConfirmDialog
          title={`Remove ${dialog.name} from the game?`}
          text={dialog.ref.kind === 'villain' ? 'It leaves the table and the turn order. The villain stays in your library, with any damage and changes.' : 'It leaves the table and the turn order.'}
          confirm="Remove"
          onConfirm={() => {
            apply((g) => T.removeFromTable(g, dialog.ref, names, clock()))
            if (running?.kind === dialog.ref.kind && running.id === dialog.ref.id) setRunning(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'memberMod' && <ModDialog title={`Give ${dialog.name} a bonus or penalty`} onAdd={(mod) => apply((g) => T.addMemberMod(g, dialog.groupId, dialog.memberId, mod, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'fix' && (
        <FixTurnDialog
          part={dialog.part}
          game={game}
          name={strip}
          onCurrent={(ref) => apply((g) => T.setCurrent(g, ref, names, clock()))}
          onActed={(ref, acted) => apply((g) => T.setActed(g, ref, acted, names, clock()))}
          onRound={(round) => apply((g) => T.setRound(g, round, clock()))}
          onClose={() => setDialog(null)}
        />
      )}
    </PopoverGroup>
  )
}
