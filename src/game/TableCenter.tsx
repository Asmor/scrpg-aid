/**
 * The shared center of the game table (docs/design/game-table/spec.md, section 6): the scene,
 * the turn order, the heroes, the opposition and the log. It's the same for everyone; `gm`
 * adds the GM's controls and never moves anything around. Without it, everything is read-only.
 */
import { ChooseDefense } from './ChooseDefense'
import { defenseText, type Defense } from '../play/defense'
import { useState, type ReactNode } from 'react'
import { DiceText, DieIcon } from '../components/icons'
import { PLAY_ZONE_LABEL } from '../hero/labels'
import type { PlayMod } from '../hero/model'
import { PopoverMenu, type MenuItem } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { modName, type PlayZone } from '../play/state'
import { formatFull, formatWhen } from '../play/time'
import type { Die } from '../rules/types'
import { sceneDisplayName, type ActorRef, type Challenge, type Game, type GameFeedEntry, type NpcGroup, type PlayersSee } from './model'
import { actorKey, boxLabel, groupSummary, memberLabel, memberName, roundOver, sameActor, sceneZone, stepsText, turnStrip, waiting, type ItemRef } from './table'
import { heroOnTableName, viewHidden, viewName, type TableView } from './project'
import { Modal } from '../components/Modal'

/** What a hero's card shows. */
export interface HeroView {
  ref: ActorRef
  name: string
  /** The player's name, or where the hero comes from. */
  sub: string
  missing?: string
  zone?: PlayZone
  health?: number
  maxHealth?: number
  statusDie?: Die
  mods: readonly PlayMod[]
  /** Its Defends (ruling 65). */
  defenses: readonly Defense[]
  minions: readonly { id: string; name: string; die: Die }[]
  reactionUsed: boolean
  disconnected?: boolean
  /** The player asked for the game's copy to match their sheet (the GM's only). */
  syncRequested?: boolean
  /** Hits waiting for a choice of defense, and who chooses (the GM's only; ruling 65). */
  waiting?: readonly { id: string; by: string; amount: number }[]
  chooser?: string
}

/** What a villain's card shows (all of it: the GM's view). */
export interface VillainView {
  ref: { kind: 'villain'; id: string }
  name: string
  kind: string
  missing?: string
  hidden: boolean
  playersSee: PlayersSee
  zone?: PlayZone
  health?: number
  maxHealth?: number
  statusDie?: Die
  mods: readonly PlayMod[]
  defenses: readonly Defense[]
}

/** The GM's controls on the shared center. */
export interface GmControls {
  setPosition: (index: number) => void
  sceneMenu: MenuItem[]
  revealEnvironment: () => void
  startRound: (first: ActorRef) => void
  handOff: (to: ActorRef) => void
  turnMenu: MenuItem[]
  heroMenu: (hero: HeroView) => MenuItem[]
  reviewSync: (heroId: string) => void
  /** Settles a hit waiting on a hero with the defense chosen (for the GM's own hero, or in a player's place). */
  resolveHit: (hitId: string, defenseId: string) => void
  reveal: (ref: ItemRef) => void
  hide: (ref: ItemRef) => void
  itemMenu: (ref: ItemRef, hidden: boolean) => MenuItem[]
  setPlayersSee: (villainId: string, value: PlayersSee) => void
  run: (ref: ItemRef) => void
  running?: ItemRef
  addMemberMod: (group: NpcGroup, memberId: string) => void
  shrinkMember: (group: NpcGroup, memberId: string) => void
  setStep: (challenge: Challenge, index: number, done: boolean) => void
  /** Bottom sheets for menus (phones). */
  sheets: boolean
}

export function ZoneChip({ zone, label }: { zone: PlayZone; label?: string }) {
  return <span className={`zone-chip zone-${zone}`}>{label ?? PLAY_ZONE_LABEL[zone]}</span>
}

function ModChips({ mods, defenses = [], extra }: { mods: readonly PlayMod[]; defenses?: readonly Defense[]; extra?: ReactNode }) {
  if (!mods.length && !defenses.length && !extra) return null
  return (
    <ul className="gt-chips" aria-label="Bonuses, penalties and defenses">
      {mods.map((m) => (
        <li key={m.id} className="gt-mod">
          {m.value > 0 ? `+${m.value}` : `−${-m.value}`} {modName(m)}
        </li>
      ))}
      {defenses.map((d) => (
        <li key={d.id} className="gt-mod gt-defense">
          {defenseText(d)}
        </li>
      ))}
      {extra}
    </ul>
  )
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function HiddenBadge() {
  return <span className="gt-hidden-badge">Hidden from players</span>
}

/** A ⋯ button opening a menu (a bottom sheet on phones). */
export function MenuButton({ label, items, sheets, text }: { label: string; items: readonly MenuItem[]; sheets: boolean; text?: string }) {
  const [popover, bind] = usePopover()
  if (!items.length) return null
  return (
    <span className="popover-anchor">
      <button ref={bind} type="button" className={text ? 'button button--primary button--small' : 'icon-button'} aria-label={text ? undefined : label} title={text ? undefined : label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        {text ?? <MoreIcon />}
      </button>
      {popover.open && <PopoverMenu popover={popover} label={label} items={items} className={sheets ? 'popover--sheet' : 'popover--end'} />}
    </span>
  )
}

const SEE_LABEL: Record<PlayersSee, string> = { name: 'Name only', status: 'Status', health: 'Status and Health' }

/** The eye button: what players see of a villain, as a radio menu, and Hide from players. */
function PlayersSeeMenu({ villain, gm }: { villain: VillainView; gm: GmControls }) {
  const [popover, bind] = usePopover()
  const label = `What players see of ${villain.name}`
  const items: MenuItem[] = [
    ...(['name', 'status', 'health'] as const).map((value) => ({ label: SEE_LABEL[value], checked: villain.playersSee === value, onSelect: () => gm.setPlayersSee(villain.ref.id, value) })),
    { label: 'Hide from players', onSelect: () => gm.hide(villain.ref) },
  ]
  return (
    <span className="popover-anchor">
      <button ref={bind} type="button" className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        <EyeIcon />
      </button>
      {popover.open && <PopoverMenu popover={popover} label={label} items={items} className={gm.sheets ? 'popover--sheet' : 'popover--end'} header={<p className="popover__hint">Players see</p>} />}
    </span>
  )
}

// ---- The scene ----

/** The scene tracker: buttons for the GM, an image for everyone else (and on the Games page). */
export function Tracker({ game, gm }: { game: Pick<Game, 'scene'>; gm?: GmControls }) {
  const { tracker, position } = game.scene
  if (!gm) {
    return (
      <div className="gt-tracker" role="img" aria-label={`Scene tracker at ${boxLabel(tracker, position)} of ${tracker.length}`}>
        {tracker.map((z, i) => (
          <span key={i} className={`gt-box zone-${z}${i < position ? ' gt-box--past' : ''}${i === position ? ' gt-box--now' : ''}`} aria-hidden="true" />
        ))}
      </div>
    )
  }
  return (
    <div className="gt-tracker" role="group" aria-label="Scene tracker">
      {tracker.map((z, i) => (
        <button
          key={i}
          type="button"
          className={`gt-box zone-${z}${i < position ? ' gt-box--past' : ''}${i === position ? ' gt-box--now' : ''}`}
          aria-label={`${boxLabel(tracker, i)}${i === position ? ', current' : ''}`}
          aria-current={i === position ? 'step' : undefined}
          onClick={() => gm.setPosition(i)}
        />
      ))}
    </div>
  )
}

function SceneCard({ game, gm }: { game: Pick<TableView, 'scene' | 'environment'>; gm?: GmControls }) {
  const zone = sceneZone(game)
  const env = game.environment
  return (
    <section className="card gt-card gt-scene" aria-labelledby="gt-scene">
      <div>
        <div className="gt-label">Scene</div>
        <h2 id="gt-scene" className={game.scene.name.trim() ? 'gt-scene__name' : 'gt-scene__name placeholder'}>
          {sceneDisplayName(game)}
        </h2>
        {env && (gm || !env.hidden) && (
          <div className="gt-sub">
            Environment: {env.name}
            {gm && env.hidden && (
              <>
                {' '}
                <HiddenBadge />{' '}
                <button type="button" className="button button--primary button--small" onClick={gm.revealEnvironment}>
                  Reveal
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div>
        <div className="gt-label">Scene tracker</div>
        <Tracker game={game} gm={gm} />
      </div>
      <div>
        <div className="gt-label">Scene zone</div>
        <ZoneChip zone={zone} />
      </div>
      <span className="gt-grow" />
      <p className="gt-sub gt-scene__hint">
        Advances when the environment takes its turn.{gm && ' Click a box to correct it.'}
      </p>
      {gm && <MenuButton label="Scene setup" items={gm.sceneMenu} sheets={gm.sheets} />}
    </section>
  )
}

// ---- Turn order ----

function TurnCard({ game, gm }: { game: TableView; gm?: GmControls }) {
  const strip = turnStrip(game)
  const [askFirst, setAskFirst] = useState(false)
  const name = (ref: ActorRef) => {
    const n = viewName(game, ref, heroOnTableName)
    return gm && viewHidden(game, ref) ? `${n} (hidden)` : n
  }
  const current = game.turn.current
  const over = roundOver(game)
  const pickFirst = game.turn.order.map((ref) => ({ label: name(ref), onSelect: () => gm?.startRound(ref) }))
  const handItems: MenuItem[] = over ? [{ label: `End round; start round ${game.round + 1}`, onSelect: () => setAskFirst(true) }] : waiting(game).map((ref) => ({ label: name(ref), onSelect: () => gm?.handOff(ref) }))
  return (
    <section className="card gt-card" aria-labelledby="gt-turns">
      <div className="gt-row gt-turns__head">
        <h2 id="gt-turns">{game.round === 0 ? 'Not started' : `Round ${game.round}`}</h2>
        <span className="gt-sub">Whoever acts picks who goes next.</span>
        <span className="gt-grow" />
        {gm && game.turn.order.length > 0 && (game.round === 0 ? <MenuButton label="Who goes first?" text="Start round 1" items={pickFirst} sheets={gm.sheets} /> : <MenuButton label="Hand off to" text={current ? `Hand off for ${name(current)}` : 'Hand off to…'} items={handItems} sheets={gm.sheets} />)}
        {gm && <MenuButton label="Fix the turn order" items={gm.turnMenu} sheets={gm.sheets} />}
      </div>
      {strip.length === 0 ? (
        <p className="sheet-empty">Nobody is in the turn order yet. Heroes join it when they come in, and everything else when it's revealed.</p>
      ) : (
        <ol className="gt-strip" aria-label="Turn order this round">
          {strip.map(({ ref, state }) => (
            <li key={actorKey(ref)} className={`gt-actor gt-actor--${state}`}>
              {state === 'acted' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
              {name(ref)}
              {state !== 'waiting' && <span className="gt-actor__state">{state === 'acted' ? 'acted' : 'acting now'}</span>}
            </li>
          ))}
        </ol>
      )}
      {gm && askFirst && (
        <Modal title={`Who starts round ${game.round + 1}?`} onClose={() => setAskFirst(false)}>
          <p className="hint">Anyone can start the new round, including whoever acted last.</p>
          <div className="gt-choices">
            {game.turn.order.map((ref) => (
              <button
                key={actorKey(ref)}
                type="button"
                className="button"
                onClick={() => {
                  setAskFirst(false)
                  gm.startRound(ref)
                }}
              >
                {name(ref)}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  )
}

// ---- Heroes ----

function Health({ health, maxHealth }: { health?: number; maxHealth?: number }) {
  if (health === undefined) return null
  return (
    <span className="gt-hp">
      {health}
      {maxHealth !== undefined && <small> / {maxHealth}</small>}
    </span>
  )
}

function HealthBar({ health, maxHealth, zone }: { health?: number; maxHealth?: number; zone?: PlayZone }) {
  if (health === undefined || !maxHealth) return null
  return (
    <div className="gt-bar" aria-hidden="true">
      <span className={`zone-${zone ?? 'green'}`} style={{ width: `${Math.max(0, Math.min(100, Math.round((health / maxHealth) * 100)))}%` }} />
    </div>
  )
}

function HeroCard({ hero, acting, gm }: { hero: HeroView; acting: boolean; gm?: GmControls }) {
  const id = `gt-hero-${hero.ref.id}`
  return (
    <article className={`card gt-ent${acting ? ' gt-ent--acting' : ''}`} aria-labelledby={id}>
      <div className="gt-row">
        <span className="gt-ent__name gt-grow" id={id}>
          {hero.name}
        </span>
        {gm && <MenuButton label={`GM actions for ${hero.name}`} items={gm.heroMenu(hero)} sheets={gm.sheets} />}
      </div>
      <div className="gt-sub">{hero.sub}</div>
      {hero.missing ? (
        <p className="gt-sub">{hero.missing}</p>
      ) : (
        <>
          <div className="gt-row">
            {hero.zone && <ZoneChip zone={hero.zone} />}
            <Health health={hero.health} maxHealth={hero.maxHealth} />
            <span className="gt-grow" />
            {hero.statusDie && (
              <span className="gt-status-die">
                <span className="visually-hidden">Status die </span>
                <DieIcon die={hero.statusDie} />
              </span>
            )}
          </div>
          <HealthBar health={hero.health} maxHealth={hero.maxHealth} zone={hero.zone} />
          <ModChips
            mods={hero.mods}
            defenses={hero.defenses}
            extra={hero.minions.map((m) => (
              <li key={m.id} className="gt-mod">
                {m.name} <DieIcon die={m.die} size="inline" />
              </li>
            ))}
          />
          {(hero.reactionUsed || hero.disconnected) && (
            <div className="gt-row">
              {hero.reactionUsed && <span className="gt-flag">Reaction used</span>}
              {hero.disconnected && <span className="gt-flag">Disconnected</span>}
            </div>
          )}
          {gm &&
            hero.waiting?.map((h) => (
              <div key={h.id} className="gt-waiting">
                {hero.chooser !== 'The GM' && <p className="gt-sub">Waiting for {hero.chooser} to choose a defense. You can choose for them:</p>}
                <ChooseDefense hit={h} heroName={hero.name} defenses={hero.defenses} onChoose={(defenseId) => gm.resolveHit(h.id, defenseId)} />
              </div>
            ))}
          {gm && hero.syncRequested && (
            <button type="button" className="button button--small gt-sync-button" onClick={() => gm.reviewSync(hero.ref.id)}>
              Sheet update requested · Review
            </button>
          )}
        </>
      )}
    </article>
  )
}

// ---- Opposition ----

function RunButton({ refTo, name, gm }: { refTo: ItemRef; name: string; gm: GmControls }) {
  const on = gm.running && gm.running.kind === refTo.kind && gm.running.id === refTo.id
  return (
    <button type="button" className="button button--small" aria-pressed={Boolean(on)} aria-label={on ? `Running ${name}` : `Run ${name}`} onClick={() => gm.run(refTo)}>
      {on ? 'Running' : 'Run'}
    </button>
  )
}

function HiddenRow({ refTo, gm }: { refTo: ItemRef; gm: GmControls }) {
  return (
    <div className="gt-row">
      <HiddenBadge />
      <span className="gt-grow" />
      <button type="button" className="button button--primary button--small" onClick={() => gm.reveal(refTo)}>
        Reveal
      </button>
    </div>
  )
}

function cardClass(hidden: boolean, selected: boolean, acting: boolean) {
  return `card gt-ent${hidden ? ' gt-ent--hidden' : ''}${selected ? ' gt-ent--selected' : ''}${acting ? ' gt-ent--acting' : ''}`
}

const isRunning = (gm: GmControls | undefined, ref: ItemRef) => Boolean(gm?.running && gm.running.kind === ref.kind && gm.running.id === ref.id)

function VillainCard({ villain, acting, gm }: { villain: VillainView; acting: boolean; gm?: GmControls }) {
  const id = `gt-villain-${villain.ref.id}`
  // The GM sees everything; others what "What players see" allows.
  const see = gm ? 'health' : villain.playersSee
  return (
    <article className={cardClass(villain.hidden, isRunning(gm, villain.ref), acting)} aria-labelledby={id}>
      <div className="gt-row">
        <div className="gt-grow">
          <div className="gt-sub">{villain.kind}</div>
          <span className="gt-ent__name" id={id}>
            {villain.name}
          </span>
        </div>
        {gm && !villain.hidden && <PlayersSeeMenu villain={villain} gm={gm} />}
        {gm && !villain.missing && <RunButton refTo={villain.ref} name={villain.name} gm={gm} />}
        {gm && <MenuButton label={`More for ${villain.name}`} items={gm.itemMenu(villain.ref, villain.hidden)} sheets={gm.sheets} />}
      </div>
      {gm && villain.hidden && <HiddenRow refTo={villain.ref} gm={gm} />}
      {villain.missing ? (
        <p className="gt-sub">{villain.missing}</p>
      ) : see === 'name' ? (
        <p className="gt-sub">The GM is keeping its condition secret.</p>
      ) : (
        <>
          <div className="gt-row">
            {villain.zone && <ZoneChip zone={villain.zone} label={villain.zone === 'out' ? 'Defeated' : undefined} />}
            {see === 'health' && <Health health={villain.health} maxHealth={villain.maxHealth} />}
            <span className="gt-grow" />
            {gm && villain.statusDie && (
              <span className="gt-status-die">
                <span className="visually-hidden">Status die </span>
                <DieIcon die={villain.statusDie} />
              </span>
            )}
          </div>
          {gm && villain.playersSee !== 'health' && !villain.hidden && <p className="gt-sub">Players see {SEE_LABEL[villain.playersSee].toLowerCase()}.</p>}
          <ModChips mods={villain.mods} defenses={villain.defenses} />
        </>
      )}
    </article>
  )
}

function GroupCard({ group, acting, gm }: { group: NpcGroup; acting: boolean; gm?: GmControls }) {
  const [open, setOpen] = useState(false)
  const id = `gt-group-${group.id}`
  const ref = { kind: 'group' as const, id: group.id }
  return (
    <article className={cardClass(group.hidden, isRunning(gm, ref), acting)} aria-labelledby={id}>
      <div className="gt-row">
        <div className="gt-grow">
          <div className="gt-sub">{group.kind === 'minions' ? 'Minions' : 'Lieutenants'}</div>
          <span className="gt-ent__name" id={id}>
            {group.name}
          </span>
        </div>
        {gm && <RunButton refTo={ref} name={group.name} gm={gm} />}
        {gm && <MenuButton label={`More for ${group.name}`} items={gm.itemMenu(ref, group.hidden)} sheets={gm.sheets} />}
      </div>
      {gm && group.hidden && <HiddenRow refTo={ref} gm={gm} />}
      <div className="gt-row">
        <ul className="gt-summary" aria-label="Dice">
          {groupSummary(group).map((g) => (
            <li key={g.die}>
              <DieIcon die={g.die} /> <span className="gt-hp">× {g.count}</span>
            </li>
          ))}
        </ul>
        <span className="gt-grow" />
        <button type="button" className="button button--quiet button--small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide each' : 'Show each'}
        </button>
      </div>
      {open && (
        <ul className="gt-members" aria-label={`Members of ${group.name}`}>
          {group.members.map((m) => (
            <li key={m.id} className="gt-row">
              <DieIcon die={m.die} />
              <span>{memberLabel(group, m.n)}</span>
              <ModChips mods={m.mods} defenses={m.defenses ?? []} />
              <span className="gt-grow" />
              {gm && (
                <>
                  <button type="button" className="button button--quiet button--small" aria-label={`Add a bonus or penalty to ${memberName(group, m.n)}`} onClick={() => gm.addMemberMod(group, m.id)}>
                    + Mod
                  </button>
                  <button type="button" className="button button--small" aria-label={`${m.die === 'd4' ? 'Remove' : 'Shrink'} ${memberName(group, m.n)}`} onClick={() => gm.shrinkMember(group, m.id)}>
                    {m.die === 'd4' ? 'Remove' : 'Shrink'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function ChallengeCard({ challenge, gm }: { challenge: Challenge; gm?: GmControls }) {
  const id = `gt-challenge-${challenge.id}`
  const ref = { kind: 'challenge' as const, id: challenge.id }
  return (
    <article className={cardClass(challenge.hidden, false, false)} aria-labelledby={id}>
      <div className="gt-row">
        <div className="gt-grow">
          <div className="gt-sub">Challenge</div>
          <span className="gt-ent__name" id={id}>
            {challenge.name}
          </span>
        </div>
        {gm && <MenuButton label={`More for ${challenge.name}`} items={gm.itemMenu(ref, challenge.hidden)} sheets={gm.sheets} />}
      </div>
      {gm && challenge.hidden && <HiddenRow refTo={ref} gm={gm} />}
      <div className="gt-row">
        {challenge.steps.map((done, i) =>
          gm ? (
            <label key={i} className="gt-step">
              <input type="checkbox" checked={done} onChange={(e) => gm.setStep(challenge, i, e.target.checked)} />
              <span className="visually-hidden">Step {i + 1}</span>
            </label>
          ) : (
            <span key={i} className={done ? 'gt-step gt-step--done' : 'gt-step'} role="img" aria-label={`Step ${i + 1}${done ? ', done' : ''}`} />
          ),
        )}
        <span className="gt-sub">{stepsText(challenge)}</span>
      </div>
    </article>
  )
}

// ---- The log ----

export function TableLog({ entries, now, gm }: { entries: readonly GameFeedEntry[]; now: Date; gm: boolean }) {
  const shown = gm ? entries : entries.filter((e) => !e.gmOnly)
  if (!shown.length) return <p className="sheet-empty">Nothing yet.</p>
  return (
    <ol className="gt-log" reversed>
      {[...shown].reverse().map((e) => (
        <li key={e.id}>
          <time dateTime={e.at} title={formatFull(e.at)}>
            {formatWhen(e.at, now)}
          </time>
          <span>
            <strong>{e.by}:</strong> <DiceText text={e.text} />
            {e.gmOnly && <span className="gt-flag"> (only you see this)</span>}
            {e.details && (
              <ul>
                {e.details.map((d, i) => (
                  <li key={i}>
                    <DiceText text={d} />
                  </li>
                ))}
              </ul>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

interface CenterProps {
  /** The game as this audience sees it (the GM's: everything). */
  game: TableView
  heroes: readonly HeroView[]
  villains: readonly VillainView[]
  now: Date
  gm?: GmControls
  /** Leaves out the log (the GM's phone has it on its own tab). */
  hideLog?: boolean
  /** Heroes and opposition as tight rows, one per line (a player's phone). */
  compact?: boolean
}

export function TableCenter({ game, heroes, villains, now, gm, hideLog = false, compact = false }: CenterProps) {
  const current = game.turn.current
  // Hidden items are the GM's alone.
  const shownVillains = gm ? villains : villains.filter((v) => !v.hidden)
  const groups = gm ? game.groups : game.groups.filter((g) => !g.hidden)
  const challenges = gm ? game.challenges : game.challenges.filter((c) => !c.hidden)
  const opposition = shownVillains.length + groups.length + challenges.length
  return (
    <div className={compact ? 'gt-center gt-center--compact' : 'gt-center'}>
      <SceneCard game={game} gm={gm} />
      <TurnCard game={game} gm={gm} />
      <section aria-labelledby="gt-heroes">
        <div className="gt-section-head">
          <h2 id="gt-heroes">Heroes</h2>
        </div>
        {heroes.length === 0 ? (
          <p className="sheet-empty">No heroes yet.{gm && ' Bring one in from your library in the GM screen.'}</p>
        ) : (
          <div className="gt-grid gt-grid--heroes">
            {heroes.map((h) => (
              <HeroCard key={h.ref.id} hero={h} acting={sameActor(current, h.ref)} gm={gm} />
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="gt-opposition">
        <div className="gt-section-head">
          <h2 id="gt-opposition">Opposition</h2>
          {gm && <span className="gt-sub">Run a villain or group to work it in the GM screen.</span>}
        </div>
        {opposition === 0 ? (
          <p className="sheet-empty">Nothing yet.{gm && ' Quick add or bring in from the GM screen.'}</p>
        ) : (
          <div className="gt-grid">
            {shownVillains.map((v) => (
              <VillainCard key={v.ref.id} villain={v} acting={sameActor(current, v.ref)} gm={gm} />
            ))}
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} acting={sameActor(current, { kind: 'group', id: g.id })} gm={gm} />
            ))}
            {challenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} gm={gm} />
            ))}
          </div>
        )}
      </section>
      {!hideLog && (
        <section className="card gt-card" aria-labelledby="gt-log">
          <h2 id="gt-log">Table log</h2>
          <TableLog entries={game.feed} now={now} gm={Boolean(gm)} />
        </section>
      )}
    </div>
  )
}
