/**
 * The shared center of the game table (scrpg-aid-designs/game-table/spec.md, section 6): the scene,
 * the turn order, the heroes, the opposition and the log. It's the same for everyone; `gm`
 * adds the GM's controls and never moves anything around. Without it, everything is read-only.
 */
import { HelpTip } from '../help/HelpTip'
import { ChooseDefense } from './ChooseDefense'
import { defenseText, type Defense } from '../play/defense'
import { useState, type ReactNode } from 'react'
import { DiceText, DieIcon } from '../components/icons'
import { PLAY_ZONE_LABEL } from '../hero/labels'
import type { PlayMod } from '../hero/model'
import { PopoverMenu, type MenuItem } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { heroPointCount, MAX_HERO_POINTS, modName, type PlayZone } from '../play/state'
import { formatFull, formatWhen } from '../play/time'
import type { Die } from '../rules/types'
import { overcomeOutcome } from '../play/roll'
import { betweenIssues, challengeDone, issueTitle, logByline, sceneDisplayName, type ActorRef, type Challenge, type GameFeedEntry, type HasTracker, type NpcGroup, type PlayersSee } from './model'
import { actedText, actorKey, boxLabel, groupSummary, memberLabel, memberName, nextStep, roundOver, sameActor, sceneZone, stepsText, turnStrip, waiting, type ItemRef } from './table'
import type { BackIssueStatus } from './issues'
import { heroOnTableName, viewHidden, viewName, type TableView } from './project'
import { CardBand, CharSwatch } from '../components/CharBand'
import { appearanceOf, type Appearance } from '../colors/palette'
import { TurnStrip } from './TurnStrip'
import type { TableShortcut } from './useTableShortcuts'
import { Modal } from '../components/Modal'

/** What a hero's card shows. */
export interface HeroView {
  ref: ActorRef
  name: string
  appearance: Appearance
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
  appearance: Appearance
  kind: string
  missing?: string
  hidden: boolean
  playersSee: PlayersSee
  zone?: PlayZone
  health?: number
  maxHealth?: number
  statusDie?: Die
  /** Why it's that die: "5 GM minions and lieutenants". */
  statusReason?: string
  mods: readonly PlayMod[]
  defenses: readonly Defense[]
}

/** The GM's controls on the shared center. */
export interface GmControls {
  setPosition: (index: number) => void
  /** The game's hero points: the GM's − and + on the Heroes heading. */
  changeHeroPoints: (by: 1 | -1) => void
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
  /** Answers a player's Overcome: check off the next step, or not this time. */
  answerRequest: (challenge: Challenge, requestId: string, check: boolean) => void
  /** Bottom sheets for menus (phones). */
  sheets: boolean
  /** Undo for the scene just started or the issue just finished. */
  logUndo?: LogUndo
  /** Between issues, what the end card says comes next: "Next up: scene 4, Into the Tunnels (planned)." */
  nextUp?: string
  /** Between issues, who has recorded the issue. */
  backIssues?: readonly BackIssueStatus[]
  /** Between issues, opens Start issue N…. */
  startIssue?: () => void
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
export function MenuButton({ label, items, sheets, text, shortcut }: { label: string; items: readonly MenuItem[]; sheets: boolean; text?: string; /** A table shortcut that opens it (./useTableShortcuts.ts). */ shortcut?: TableShortcut }) {
  const [popover, bind] = usePopover()
  if (!items.length) return null
  return (
    <span className="popover-anchor">
      <button ref={bind} type="button" className={text ? 'button button--primary button--small' : 'icon-button'} aria-label={text ? undefined : label} title={text ? undefined : label} aria-haspopup="menu" aria-expanded={popover.open} data-shortcut={shortcut} onClick={popover.toggle}>
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
export function Tracker({ game, gm }: { game: HasTracker; gm?: GmControls }) {
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
        <div className="gt-label">
          Scene {game.scene.number}
          {game.scene.total !== undefined && ` of ${game.scene.total}`}
        </div>
        <h2 id="gt-scene" className={game.scene.name.trim() ? 'gt-scene__name' : 'gt-scene__name placeholder'}>
          {sceneDisplayName(game)}
        </h2>
        {env && (gm || !env.hidden) && (
          <>
            <div className="gt-sub">
              <CharSwatch appearance={appearanceOf({ kind: 'environment', color: env.color })} />
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
              {gm && (
                <>
                  {' '}
                  <RunButton refTo={{ kind: 'environment', id: env.id }} name={env.name} gm={gm} />
                </>
              )}
            </div>
            {env.description && <p className="gt-sub gt-scene__env">{env.description}</p>}
          </>
        )}
      </div>
      <div>
        <div className="gt-label">
          Scene tracker <HelpTip tip="sceneTracker" />
        </div>
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
      {gm && <MenuButton label="Scene menu" items={gm.sceneMenu} sheets={gm.sheets} />}
    </section>
  )
}

// ---- The end of an issue ----

/** "Nov 5". */
const finishedOn = (at: string | undefined) => (at ? new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

/** The title and summary of the issue just finished, for the table and the Finish dialog's preview. */
export function EndOfIssue({ number, title, summary, headingId }: { number: number; title: string; summary?: string | undefined; headingId?: string }) {
  return (
    <>
      <div className="gt-end__over">END OF ISSUE {number}</div>
      <h2 id={headingId} className="gt-end__title">
        {title}
      </h2>
      {summary && <p className="gt-end__summary">{summary}</p>}
    </>
  )
}

/** Replaces the scene card and the turn order while the game is between issues (scrpg-aid-designs/issues/spec.md, section 4). */
function EndCard({ game, gm, gmName }: { game: TableView; gm?: GmControls | undefined; gmName?: string | undefined }) {
  const issue = game.issues.at(-1)
  if (!issue) return null
  const scenes = `${issue.sceneCount} ${issue.sceneCount === 1 ? 'scene' : 'scenes'} · finished ${finishedOn(issue.finishedAt)}.`
  return (
    <section className="card gt-card gt-end" aria-labelledby="gt-end">
      <div className="gt-row gt-end__head">
        <div className="gt-grow">
          <EndOfIssue number={issue.number} title={issueTitle(issue)} summary={issue.summary} headingId="gt-end" />
        </div>
        {gm?.startIssue && (
          <button type="button" className="button button--primary" onClick={gm.startIssue}>
            Start issue {issue.number + 1}…
          </button>
        )}
      </div>
      <div className="gt-row">
        <div className="gt-end__tracker">
          <Tracker game={game} />
        </div>
        <span className="gt-sub">
          {scenes} {gm ? gm.nextUp : `The table is paused until ${gmName ?? 'the GM'} starts the next issue.`}
        </span>
      </div>
    </section>
  )
}

/** The GM's Back issues card: for information, since players decide on their own device. */
function BackIssuesCard({ rows }: { rows: readonly BackIssueStatus[] }) {
  return (
    <section className="card gt-card" aria-labelledby="gt-back-issues">
      <div className="gt-row">
        <h2 id="gt-back-issues">Back issues</h2>
        <HelpTip tip="backIssues" />
      </div>
      <p className="gt-sub">Players decide on their own device; this is for your information.</p>
      <ul className="gt-finish__facts">
        {rows.map((r) => (
          <li key={r.heroId} className="gt-row">
            <span className="gt-grow">
              <strong>{r.name}</strong> <span className="gt-sub">{r.who}</span>
            </span>
            <span className={r.added ? 'tag tag--strong' : 'tag'}>{r.text}</span>
          </li>
        ))}
      </ul>
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
        {gm && game.turn.order.length > 0 && (game.round === 0 ? <MenuButton label="Who goes first?" text="Start round 1" items={pickFirst} sheets={gm.sheets} shortcut="hand-off" /> : <MenuButton label="Hand off to" text={current ? `Hand off for ${name(current)}` : 'Hand off to…'} items={handItems} sheets={gm.sheets} shortcut="hand-off" />)}
        {gm && <MenuButton label="Fix the turn order" items={gm.turnMenu} sheets={gm.sheets} />}
      </div>
      {strip.length === 0 ? (
        <p className="sheet-empty">Nobody is in the turn order yet. Heroes join it when they come in, and everything else when it's revealed.</p>
      ) : (
        <TurnStrip game={game} name={name} />
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
      <CardBand appearance={hero.appearance} />
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
      <CardBand appearance={villain.appearance} />
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
          </div>
          {gm && villain.statusReason !== undefined && (
            <div className="gt-row gt-villain-status">
              {villain.statusDie && <DieIcon die={villain.statusDie} size="large" />}
              <span>
                <strong>{villain.statusDie ? `Status ${villain.statusDie}` : 'No status die'}</strong>
                <br />
                <span className="gt-sub">{villain.statusReason}</span>
              </span>
            </div>
          )}
          {gm && villain.playersSee !== 'health' && !villain.hidden && <p className="gt-sub">Players see {SEE_LABEL[villain.playersSee].toLowerCase()}.</p>}
          <ModChips mods={villain.mods} defenses={villain.defenses} />
        </>
      )}
    </article>
  )
}

/** A group's card. An environment's group shows the environment's name over its own, and acts on its turn. */
function GroupCard({ group, acting, envName, gm }: { group: NpcGroup; acting: boolean; envName?: string; gm?: GmControls }) {
  const [open, setOpen] = useState(false)
  const id = `gt-group-${group.id}`
  const ref = { kind: 'group' as const, id: group.id }
  return (
    <article className={cardClass(group.hidden, isRunning(gm, ref), acting)} aria-labelledby={id}>
      <CardBand appearance={appearanceOf({ kind: 'group', environment: group.owner.kind === 'environment', color: group.color })} />
      <div className="gt-row">
        <div className="gt-grow">
          <div className="gt-sub">
            {group.kind === 'minions' ? 'Minions' : 'Lieutenants'}
            {envName !== undefined && ` · ${envName}`}
          </div>
          <span className="gt-ent__name" id={id}>
            {group.name}
          </span>
        </div>
        {gm && <RunButton refTo={ref} name={group.name} gm={gm} />}
        {gm && <MenuButton label={`More for ${group.name}`} items={gm.itemMenu(ref, group.hidden)} sheets={gm.sheets} />}
      </div>
      {gm && group.hidden && <HiddenRow refTo={ref} gm={gm} />}
      {acting && <p className="gt-sub">{actedText(group)}</p>}
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

function ChallengeCard({ challenge, game, gm }: { challenge: Challenge; game: TableView; gm?: GmControls }) {
  const id = `gt-challenge-${challenge.id}`
  const ref = { kind: 'challenge' as const, id: challenge.id }
  const done = challengeDone(challenge)
  const nextIndex = nextStep(challenge)
  const linked = gm && challenge.linkedVillainId ? game.villains.find((v) => v.id === challenge.linkedVillainId) : undefined
  const heroName = (heroId: string) => viewName(game, { kind: 'hero', id: heroId }, heroOnTableName)
  return (
    <article className={`${cardClass(challenge.hidden, false, false)}${done ? ' gt-challenge--done' : ''}`} aria-labelledby={id}>
      <CardBand appearance={appearanceOf({ kind: 'challenge', environment: challenge.owner.kind === 'environment', color: challenge.color })} />
      <div className="gt-row">
        <div className="gt-sub gt-grow">
          Challenge{challenge.owner.kind === 'environment' ? ` · ${game.environment?.name ?? 'Environment'}` : ''} <HelpTip tip="challenges" />
        </div>
        <span className={done ? 'gt-progress gt-progress--done' : 'gt-progress'}>{stepsText(challenge)}</span>
        {gm && <MenuButton label={`More for ${challenge.name}`} items={gm.itemMenu(ref, challenge.hidden)} sheets={gm.sheets} />}
      </div>
      <span className="gt-ent__name" id={id}>
        {challenge.name}
      </span>
      {gm && challenge.hidden && (linked ? <HiddenBadge /> : <HiddenRow refTo={ref} gm={gm} />)}
      {linked && <p className="gt-sub">Linked to {linked.name}'s status die</p>}
      {challenge.description && <p className="gt-sub">{challenge.description}</p>}
      <ul className="gt-steps" aria-label="Steps">
        {challenge.steps.map((step, i) => (
          <li key={i} className={step.done ? 'gt-row gt-step-row gt-step-row--done' : 'gt-row gt-step-row'}>
            {gm ? (
              <label className="gt-row">
                <input type="checkbox" checked={step.done} onChange={(e) => gm.setStep(challenge, i, e.target.checked)} />
                <span className="gt-step-text">{step.label}</span>
              </label>
            ) : (
              <>
                <span className={step.done ? 'gt-box gt-box--on' : 'gt-box'} aria-hidden="true">
                  {step.done ? '✓' : ''}
                </span>
                <span className="gt-step-text">{step.label}</span>
                <span className="visually-hidden">{step.done ? ', done' : ', not done'}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {challenge.requests.map((r) =>
        gm ? (
          <div key={r.id} className="gt-request" role="group" aria-label={`Overcome from ${heroName(r.heroId)}`}>
            <p>
              <strong>{heroName(r.heroId)}</strong> rolled <strong>{r.total}</strong> to Overcome on this challenge{r.trait ? `, using ${r.trait}` : ''}.
            </p>
            <p>{overcomeOutcome(r.total)}</p>
            {nextIndex >= 0 && (
              <div className="button-row">
                <button type="button" className="button button--primary button--small" aria-label={`Check off ${challenge.steps[nextIndex]!.label} for ${heroName(r.heroId)}`} onClick={() => gm.answerRequest(challenge, r.id, true)}>
                  Check off "{challenge.steps[nextIndex]!.label}"
                </button>
                <button type="button" className="button button--small" aria-label={`Not this time for ${heroName(r.heroId)}`} onClick={() => gm.answerRequest(challenge, r.id, false)}>
                  Not this time
                </button>
              </div>
            )}
            <p className="gt-sub">You decide what the roll earns, twists included. The player sees your answer in the log.</p>
          </div>
        ) : (
          <p key={r.id} className="gt-sub">
            Waiting for the GM: your Overcome ({r.total}).
          </p>
        ),
      )}
      {done && challenge.whenDone && (
        <p className="gt-done">
          <strong>Done.</strong> {challenge.whenDone}
        </p>
      )}
    </article>
  )
}

// ---- The log ----

/** Undo on the log line of a scene that just started (the GM's, for 30 seconds). */
export interface LogUndo {
  entryId: string
  /** The button's accessible name: "Undo starting scene 2". */
  label: string
  onUndo: () => void
}

export function TableLog({ entries, now, gm, undo }: { entries: readonly GameFeedEntry[]; now: Date; gm: boolean; undo?: LogUndo | undefined }) {
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
            {logByline(e) && <strong>{logByline(e)}: </strong>}
            <DiceText text={e.text} />
            {e.gmOnly && <span className="gt-flag"> (only you see this)</span>}
            {gm && undo?.entryId === e.id && (
              <>
                {' '}
                <button type="button" className="button button--small" aria-label={undo.label} onClick={undo.onUndo}>
                  Undo
                </button>
              </>
            )}
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
  /** The GM's name, for what players read between issues. */
  gmName?: string
}

export function TableCenter({ game, heroes, villains, now, gm, hideLog = false, compact = false, gmName }: CenterProps) {
  const current = game.turn.current
  // Hidden items are the GM's alone.
  const shownVillains = gm ? villains : villains.filter((v) => !v.hidden)
  const groups = gm ? game.groups : game.groups.filter((g) => !g.hidden)
  const challenges = gm ? game.challenges : game.challenges.filter((c) => !c.hidden)
  const opposition = shownVillains.length + groups.length + challenges.length
  return (
    <div className={compact ? 'gt-center gt-center--compact' : 'gt-center'}>
      {betweenIssues(game) ? (
        <>
          <EndCard game={game} gm={gm} gmName={gmName} />
          {gm?.backIssues && gm.backIssues.length > 0 && <BackIssuesCard rows={gm.backIssues} />}
        </>
      ) : (
        <>
          <SceneCard game={game} gm={gm} />
          <TurnCard game={game} gm={gm} />
        </>
      )}
      <section aria-labelledby="gt-heroes">
        <div className="gt-section-head">
          <h2 id="gt-heroes">Heroes · {heroPointCount(game.heroPoints)}</h2>
          <HelpTip tip="heroPoints" />
          {gm && (
            <span className="gt-row">
              <button type="button" className="button button--small" aria-label="Take away a hero point" disabled={game.heroPoints <= 0} onClick={() => gm.changeHeroPoints(-1)}>
                −
              </button>
              <button type="button" className="button button--small" aria-label="Award a hero point" disabled={game.heroPoints >= MAX_HERO_POINTS} onClick={() => gm.changeHeroPoints(1)}>
                +
              </button>
            </span>
          )}
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
              <GroupCard
                key={g.id}
                group={g}
                {...(g.owner.kind === 'environment' ? { envName: game.environment?.name ?? 'Environment' } : {})}
                acting={g.owner.kind === 'environment' ? current?.kind === 'environment' : sameActor(current, { kind: 'group', id: g.id })}
                gm={gm}
              />
            ))}
            {challenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} game={game} gm={gm} />
            ))}
          </div>
        )}
      </section>
      {!hideLog && (
        <section className="card gt-card" aria-labelledby="gt-log">
          <h2 id="gt-log" tabIndex={-1}>
            Table log
          </h2>
          <TableLog entries={game.feed} now={now} gm={Boolean(gm)} undo={gm?.logUndo} />
        </section>
      )}
    </div>
  )
}
