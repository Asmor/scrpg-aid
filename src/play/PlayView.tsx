/**
 * Play mode of the character page (docs/design/hero-sheet/spec.md, "Play mode"): a status
 * column (Health, scene and status die, form or mode, dice, hero points and the reaction,
 * bonuses and penalties, twists, the game) beside an actions column (basic actions, the ability
 * bands with Use or why not, and the history). Every change is free and immediate, saved with
 * the hero, and logged to the history (./state.ts has the rules; ./forms.ts says which
 * abilities can be used).
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { Toasts } from '../components/Toasts'
import { heroPath } from '../app/route'
import { useMediaQuery } from '../components/useMediaQuery'
import { heroDisplayName } from '../hero/model'
import { ActionIcon, AbilityIcons, AbilityText, DiceText, DieIcon } from '../components/icons'
import { buildSheet } from '../creation/sheet'
import { modeLimits } from '../creation/format'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL, ZONE_LABEL } from '../hero/labels'
import type { Hero, PlayHistoryEntry, PlayState } from '../hero/model'
import type { BasicAction, Die, Zone } from '../rules/types'
import { availabilityContext, basicActionBlocked, changesForm, currentForm, dividedForm, formDice, formNoun, formZoneNote, notInDividedForm, playAbilities, playForms, zoneLockNotice, type PlayAbility, type PlayForm } from './forms'
import { diceChanges, noChanges } from '../creation/dice-changes'
import type { HeroTrait } from '../creation/traits'
import { outerLayer, secondaryLayer } from '../creation/layers'
import { MinionList } from './MinionList'
import { addMinion, addMinionMod, minionCreation, removeMinion, removeMinionMod, setMinionForm, shrinkMinion, recordMinionRoll } from './minions'
import { ModForm } from './ModForm'
import { confirmRoll, effectAmount, effectLineAction, rollChange, undoRoll, type RollChange } from './roll'
import { RollDialog, type FormPicker, type RollSubject } from './RollDialog'
import { parseTarget, targetId } from '../game/roll-targets'
import { soloTable, targetOptions } from '../game/target-options'
import {
  addMod,
  clearHeroDefenses,
  dropDefense,
  gainDefense,
  modName,
  addTwist,
  currentHealth,
  describeMod,
  effectiveZone,
  healthZone,
  MAX_HERO_POINTS,
  removeMod,
  removeTwist,
  setDividedForm,
  setForm,
  setHealth,
  noteHeroPoints,
  setReactionUsed,
  setSceneZone,
  statusDieFor,
  takeDamage,
  type Clock,
} from './state'
import { defaultDefense, defenseText } from './defense'
import { formatFull, formatWhen } from './time'
import { useTick } from './useTick'

const ZONES = ['green', 'yellow', 'red'] as const
type PhoneTab = 'actions' | 'status' | 'history'
const PHONE_TABS: readonly [PhoneTab, string][] = [
  ['actions', 'Actions'],
  ['status', 'Status'],
  ['history', 'History'],
]
/** A follow-up mod's recipient when it's one of the hero's own minions. */
const BASIC_ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const ACTION_LABEL: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }

function Card({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card play-card ${className}`} aria-label={title}>
      <div className="play-card__head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A bonus's or penalty's size: on the accent for bonuses and the danger color for penalties, never a game color. */
export function ModBadge({ value }: { value: number }) {
  return <span className={value > 0 ? 'mod-badge mod-badge--bonus' : 'mod-badge mod-badge--penalty'}>{value > 0 ? `+${value}` : `−${-value}`}</span>
}

/** One ability in its band: icons, name and type; Use, "Always on", or why it can't be used; and its text. */
function AbilityRowPlay({ ability: a, reactionUsed, compact, onUse }: { ability: PlayAbility; reactionUsed: boolean; compact: boolean; onUse: () => void }) {
  // On a phone the rows are compact: tapping a name shows the ability's text.
  const [open, setOpen] = useState(false)
  const textId = useId()
  const showText = !compact || open
  return (
    <li className={a.blocked ? 'play-row play-row--blocked' : 'play-row'}>
      <span className="play-row__name">
        <AbilityIcons actions={a.effects} />
        {compact ? (
          <button type="button" className="play-row__toggle" aria-expanded={open} aria-controls={textId} onClick={() => setOpen(!open)}>
            <strong>{a.name}</strong>
          </button>
        ) : (
          <strong>{a.name}</strong>
        )}
        {!compact && <span className="play-row__type">{ABILITY_TYPE_LABEL[a.type]}</span>}
      </span>
      <span className="play-row__act">
        {a.always ? (
          <span className="play-row__why">Always on</span>
        ) : a.blocked ? (
          <span className="play-row__why">{a.blocked}</span>
        ) : (
          <>
            {/* Noted, not enforced: the app never blocks, and some abilities allow more reactions. */}
            {a.type === 'R' && reactionUsed && <span className="play-row__why">Reaction used this round</span>}
            <button type="button" className="button button--small" aria-label={`Use ${a.name}`} onClick={onUse}>
              Use
            </button>
          </>
        )}
      </span>
      <span className="play-row__text" id={textId} hidden={!showText}>
        {compact && <span className="play-row__type">{ABILITY_TYPE_LABEL[a.type]} · </span>}
        <AbilityText text={a.text} actions={a.effects} />
      </span>
    </li>
  )
}

/** What the current form or mode changes, as on the Sheet card: dice changed and added, what's not in it, and its restriction. */
function FormChanges({ form, base, noun }: { form: PlayForm; base: readonly HeroTrait[]; noun: 'form' | 'mode' }) {
  const changes = diceChanges(base, form.traits)
  const limit = form.powerless ? 'Only principle abilities can be used.' : modeLimits(form.cannot, form.immobile)
  if (noChanges(changes) && !limit) return <p className="play-card__note">Uses your base dice.</p>
  return (
    <div className="form-changes">
      {changes.changed.length + changes.added.length > 0 && (
        <ul className="dice-changes" aria-label="Dice changes">
          {changes.changed.map((c) => (
            <li key={c.name}>
              <span>{c.name}</span>
              <DieIcon die={c.from} size="compact" />
              <span role="img" aria-label="becomes">
                →
              </span>
              <DieIcon die={c.to} size="compact" />
            </li>
          ))}
          {changes.added.map((t) => (
            <li key={`${t.trait.kind}:${t.trait.id}`}>
              <span>{t.name}</span>
              <DieIcon die={t.die} size="compact" />
              <span className="tag tag--added">Added</span>
            </li>
          ))}
        </ul>
      )}
      {changes.dropped.length > 0 && (
        <p className="play-card__note">
          Not in this {noun}: {changes.dropped.map((t) => t.name).join(', ')}
        </p>
      )}
      {limit && <p className="form-limit">{limit}</p>}
    </div>
  )
}

/** The three status dice, small, in their zones' colors. */
function StatusDiceInline({ dice }: { dice: Record<Zone, Die> }) {
  return (
    <span className="status-chips" aria-label="Status dice">
      {ZONES.map((z) => (
        <span key={z} className={`zone-${z}`}>
          <span className="visually-hidden">{ZONE_LABEL[z]} </span>
          <DieIcon die={dice[z]} size="compact" />
        </span>
      ))}
    </span>
  )
}

/** The latest roll as a card, then everything else newest first. */
function History({ history, now }: { history: readonly PlayHistoryEntry[]; now: Date }) {
  const latest = [...history].reverse().find((h) => h.roll)
  const rest = [...history].reverse().filter((h) => h !== latest)
  return (
    <Card title="History" aside={<span className="play-card__note">This issue</span>}>
      {!history.length && <p className="sheet-empty">Nothing yet. Changes you make here are recorded.</p>}
      {latest && (
        <div className="latest-roll" role="group" aria-label="Latest roll">
          <p className="latest-roll__head">
            <strong>
              <DiceText text={latest.text} />
            </strong>
            <time dateTime={latest.at} title={formatFull(latest.at)}>
              {formatWhen(latest.at, now)}
            </time>
          </p>
          <ul>
            {(latest.details ?? []).map((d, i) => {
              const action = effectLineAction(d)
              return (
                <li key={i} className={action ? 'latest-roll__effect' : undefined}>
                  {/* "Deal 6 damage." doesn't name its action, so its icon does. */}
                  {action && <ActionIcon action={action} decorative={action !== 'attack'} />}
                  <DiceText text={d} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <ol className="play-history" aria-label="Earlier">
          {rest.map((h) => (
            <li key={h.id}>
              <time dateTime={h.at} title={formatFull(h.at)}>
                {formatWhen(h.at, now)}
              </time>
              <span>
                <DiceText text={h.text} />
                {h.details && h.details.length > 0 && (
                  <ul>
                    {h.details.map((d, i) => (
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
      )}
    </Card>
  )
}

interface PlayViewProps {
  /** The hero's sheet: the game's copy (in a solo game, kept up to date with the library). */
  hero: Hero
  /** The hero's play state in that game. */
  play: PlayState
  /** Changes the play state, and the solo game's hero points by an amount; the game saves it. */
  changePlay: (fn: (play: PlayState) => PlayState, heroPointsBy?: number) => void
  /** The solo game's hero points. */
  heroPoints: number
  clock: () => Clock
  random?: () => number
}

export function PlayView({ hero, play, changePlay, heroPoints, clock, random }: PlayViewProps) {
  const id = hero.id
  const formId = useId()
  const tick = useTick()
  const [amount, setAmount] = useState('')
  const [addingMod, setAddingMod] = useState(false)
  const [addingTwist, setAddingTwist] = useState(false)
  const [twistKind, setTwistKind] = useState<'minor' | 'major'>('minor')
  const [twistText, setTwistText] = useState('')
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string; undo: () => void } | null>(null)
  const toastCount = useRef(0)
  // On a phone (docs/design/hero-sheet/spec.md, "Play on a phone"): a sticky top bar and three tabs.
  const phone = !useMediaQuery('(min-width: 760px)')
  const [tab, setTab] = useState<PhoneTab>('actions')

  const sheet = buildSheet(hero)
  const change = (fn: (p: PlayState, c: Clock) => PlayState, heroPointsBy?: number) => changePlay((p) => fn(p, clock()), heroPointsBy)
  const changePoints = (by: 1 | -1) => change((p, c) => noteHeroPoints(p, heroPoints, heroPoints + by, c), by)
  const health = currentHealth(sheet, play)
  const own = health === undefined ? undefined : healthZone(sheet, health)
  const zone = effectiveZone(sheet, play)
  const scene: Zone = play.sceneZone ?? 'green'
  const forms = playForms(sheet)
  const form = currentForm(forms, play)
  const divided = dividedForm(sheet, play)
  const dice = formDice(hero, sheet, play)
  const die = statusDieFor(dice, zone)
  const noun = formNoun(forms)
  const ctx = availabilityContext(hero, sheet, play, zone)
  // Divided's transition method, as a one-line reminder: "Controllable: You choose when to change, …".
  const method = divided ? outerLayer(hero)?.archetype.transitionMethods?.find((m) => m.id === hero.archetype?.divided?.transitionMethod) : undefined
  const transition = method && `${method.name.replace(/ Transition$/, '')}: ${method.summary}`
  const lockNotice = zoneLockNotice(form, zone)
  // A Minion-Maker (or a Divided hero building on one) tracks the minions they make.
  const makesMinions = [outerLayer(hero), secondaryLayer(hero)].some((l) => l?.archetype.minionForms)
  const missingHere = divided ? notInDividedForm(hero, sheet, divided) : []
  const abilities = playAbilities(hero, sheet, play, zone)
  // Why basic actions can't be taken, each once (the buttons point to theirs).
  const whyIds = [...new Set(BASIC_ACTIONS.map((a) => basicActionBlocked(a, ctx)).filter((w): w is string => Boolean(w)))]
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0
  /** For an ability that changes form or mode: the choices for its Resolve step. */
  const formPickerFor = (text: string): FormPicker | undefined => {
    if (!changesForm(text)) return undefined
    // Divided's own changes (and any change for a Divided hero with no forms or modes) flip the form.
    if (divided && (!forms.length || /civilian form/i.test(text))) {
      return {
        label: 'Change to',
        current: divided,
        options: [
          { value: 'civilian', label: 'Civilian form' },
          { value: 'heroic', label: 'Heroic form' },
        ],
      }
    }
    if (!forms.length || !form) return undefined
    return { label: `Change ${noun} to`, current: form.key ?? '', options: forms.map((f) => ({ value: f.key ?? '', label: f.name, ...(formZoneNote(f, zone) ? { note: formZoneNote(f, zone) } : {}) })) }
  }
  const changeHealth = (by: number) => change((p, c) => setHealth(p, sheet, (currentHealth(sheet, p) ?? 0) + by, c))
  const defenses = play.defenses ?? []
  // Which defense a hit uses: the one picked, or the default for the amount (ruling 65).
  const [defenseChoice, setDefenseChoice] = useState('')
  const hitDefense = defenses.find((d) => d.id === defenseChoice) ?? defaultDefense(defenses, validAmount ? delta : 0)
  const ranges = sheet.healthRanges

  // The cards of the status column, the actions column, and the history, laid out as columns, or as tabs on a phone.
  const statusCards = (
    <>
      <Card title="Health" aside={own && <span className={own === 'out' ? 'zone-chip zone-out' : `zone-chip zone-${own}`}>{PLAY_ZONE_LABEL[own]}</span>}>
        {health === undefined ? (
          <p className="sheet-empty">Work out Health in the editor first.</p>
        ) : (
          <>
            <p className="play-health">
              <strong>{health}</strong> <span>of {sheet.maxHealth}</span>
            </p>
            {ranges && (
              <>
                <div className="health-meter" aria-hidden="true">
                  {(['red', 'yellow', 'green'] as const).map((z) => (
                    <span key={z} className={`zone-${z}${own === z ? ' health-meter__on' : ''}`} style={{ flexGrow: ranges[z][0] - ranges[z][1] + 1 }} />
                  ))}
                </div>
                <p className="health-meter__labels">
                  {(['red', 'yellow', 'green'] as const).map((z) => (
                    <span key={z}>
                      {ZONE_LABEL[z]} {ranges[z][0]}–{ranges[z][1]}
                    </span>
                  ))}
                </p>
              </>
            )}
            <div className="play-health__controls">
              <button type="button" className="button" aria-label="Lose 1 Health" onClick={() => changeHealth(-1)}>
                −1
              </button>
              <button type="button" className="button" aria-label="Gain 1 Health" onClick={() => changeHealth(1)}>
                +1
              </button>
              <label className="visually-hidden" htmlFor={`${formId}-amount`}>
                Amount
              </label>
              <input id={`${formId}-amount`} className="play-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
              {defenses.length > 0 && (
                <button type="button" className="button" disabled={!validAmount} onClick={() => (change((p, c) => takeDamage(p, sheet, delta, c, hitDefense?.id)), setAmount(''), setDefenseChoice(''))}>
                  Take damage
                </button>
              )}
              <button type="button" className="button" disabled={!validAmount} onClick={() => (changeHealth(-delta), setAmount(''))}>
                Lose
              </button>
              <button type="button" className="button" disabled={!validAmount} onClick={() => (changeHealth(delta), setAmount(''))}>
                Gain
              </button>
            </div>
            {defenses.length > 0 && (
              <div className="play-defenses">
                <p className="label">Defenses</p>
                <ul className="gt-chips" aria-label="Defenses">
                  {defenses.map((d) => (
                    <li key={d.id} className="gt-mod gt-defense">
                      {defenseText(d, heroDisplayName(hero))}
                      <button type="button" className="gt-chip-x" aria-label={`Remove ${defenseText(d, heroDisplayName(hero))}`} onClick={() => change((p, c) => dropDefense(p, d.id, c))}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {defenses.length > 1 && (
                  <p className="play-defenses__use">
                    <label htmlFor={`${formId}-defense`}>Take damage uses</label>{' '}
                    <select id={`${formId}-defense`} value={hitDefense?.id ?? ''} onChange={(e) => setDefenseChoice(e.target.value)}>
                      {defenses.map((d) => (
                        <option key={d.id} value={d.id}>
                          {defenseText(d, heroDisplayName(hero))}
                        </option>
                      ))}
                    </select>
                  </p>
                )}
                <p className="play-card__note">
                  Take damage uses one; Lose doesn't. They're gone when your next turn starts.{' '}
                  <button type="button" className="button button--small" onClick={() => (change((p, c) => clearHeroDefenses(p, c)), setDefenseChoice(''))}>
                    Clear defenses
                  </button>
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="Scene">
        <div className="segmented segmented--fill" role="group" aria-label="Scene zone">
          {ZONES.map((z) => (
            <button key={z} type="button" className={scene === z ? `zone-${z}` : undefined} aria-pressed={scene === z} onClick={() => scene !== z && change((p, c) => setSceneZone(p, z, c))}>
              {ZONE_LABEL[z]}
            </button>
          ))}
        </div>
        <div className="status-die-line">
          {die && <DieIcon die={die} />}
          <div>
            <p className="status-die-line__what">Status die: {zone === 'out' ? 'none' : PLAY_ZONE_LABEL[zone ?? 'green']}</p>
            <p className="play-card__note">{zone === 'out' ? "You're Out: only your Out ability is available." : `You: ${PLAY_ZONE_LABEL[own ?? 'green']} · Scene: ${ZONE_LABEL[scene]}. The more severe one sets your status die and abilities.`}</p>
          </div>
        </div>
      </Card>

      {forms.length > 0 && form && (
        <Card title={noun === 'mode' ? 'Mode' : 'Form'}>
          <p className="form-current">
            <strong>{form.name}</strong>
            {!form.powerless && <span className={`zone-chip zone-${form.zone}`}>{ZONE_LABEL[form.zone]}</span>}
          </p>
          {/* Any option, any time; the app never blocks a change. */}
          <div className="form-options" role="radiogroup" aria-label={noun === 'mode' ? 'Modes' : 'Forms'}>
            {forms.map((f) => {
              const note = formZoneNote(f, zone)
              return (
                <label key={f.key ?? ''} className="form-option">
                  <input type="radio" name={`${formId}-form`} checked={f.key === form.key} onChange={() => change((p, c) => setForm(p, f.key, f.name, c))} />
                  <span className="form-option__name">{f.name}</span>
                  {!f.powerless && <span className={`zone-chip zone-${f.zone}`}>{ZONE_LABEL[f.zone]}</span>}
                  {note && <span className="form-option__note">{note}</span>}
                </label>
              )
            })}
          </div>
          <FormChanges form={form} base={forms[0]!.traits} noun={noun} />
          {lockNotice && <p className="form-notice">{lockNotice}</p>}
        </Card>
      )}

      {divided && (
        <Card title="Divided form">
          <div className="segmented segmented--fill" role="group" aria-label="Divided form">
            {(['civilian', 'heroic'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={divided === f} onClick={() => divided !== f && change((p, c) => setDividedForm(p, f, c))}>
                {f === 'civilian' ? 'Civilian' : 'Heroic'}
              </button>
            ))}
          </div>
          {transition && <p className="play-card__note form-transition">{transition}</p>}
          {sheet.divided?.heroicPersonality && (
            <p className="form-personality">
              {divided === 'heroic' ? sheet.divided.heroicPersonality : sheet.characteristics.personality}
              {dice.statusDice && <StatusDiceInline dice={dice.statusDice} />}
            </p>
          )}
          {dice.slots[0] === dice.slots[1] ? (
            <p className="hint">Divided Psyche: you roll two {dice.slots[0] === 'power' ? 'powers' : 'qualities'} with your status die.</p>
          ) : (
            missingHere.length > 0 && <p className="play-card__note">Not in this form: {missingHere.map((t) => t.name).join(', ')}</p>
          )}
        </Card>
      )}

      <Card title="Dice" aside={<a href={heroPath(id)}>Full sheet</a>}>
        <div className="play-dice">
          {(
            [
              ['Powers', dice.powers],
              ['Qualities', dice.qualities],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <p className="label">{label}</p>
              {list.length === 0 ? (
                <p className="sheet-empty">None</p>
              ) : (
                <ul aria-label={label}>
                  {list.map((t) => {
                    // A die the form or mode changed is marked, with what it was.
                    const was = form?.key ? forms[0]!.traits.find((b) => b.trait.kind === t.trait.kind && b.trait.id === t.trait.id)?.die : undefined
                    return (
                      <li key={`${t.trait.kind}:${t.trait.id}`} className={was && was !== t.die ? 'play-dice__changed' : undefined}>
                        <span>
                          {t.name}
                          {was && was !== t.die && <span className="visually-hidden"> (was {was})</span>}
                          {!was && form?.key && (
                            <>
                              {' '}
                              <span className="play-dice__tag">added</span>
                            </>
                          )}
                        </span>
                        <DieIcon die={t.die} size="compact" />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Hero points" className="play-card--points">
        <div className="play-points">
          <button type="button" className="button" aria-label="Spend a hero point" disabled={heroPoints <= 0} onClick={() => changePoints(-1)}>
            −
          </button>
          <strong aria-live="polite" aria-label={`${heroPoints} of ${MAX_HERO_POINTS} hero points`}>
            {heroPoints}
          </strong>
          <button type="button" className="button" aria-label="Gain a hero point" disabled={heroPoints >= MAX_HERO_POINTS} onClick={() => changePoints(1)}>
            +
          </button>
        </div>
        <label className="checkbox play-reaction">
          <input type="checkbox" checked={play.reactionUsed} onChange={(e) => change((p, c) => setReactionUsed(p, e.target.checked, c))} />
          Reaction used this round
        </label>
      </Card>

      <Card
        title="Bonuses and penalties"
        aside={
          <button type="button" className="button button--small" aria-expanded={addingMod} onClick={() => setAddingMod(!addingMod)}>
            {addingMod ? 'Close' : '+ Add'}
          </button>
        }
      >
        {play.mods.length === 0 ? (
          <p className="sheet-empty">None.</p>
        ) : (
          <ul className="play-list">
            {play.mods.map((m) => (
              <li key={m.id}>
                <ModBadge value={m.value} />
                <span className="play-list__text">{modName(m)}</span>
                {m.persistent && <span className="tag">Persistent</span>}
                {m.exclusive && <span className="tag">Exclusive</span>}
                <button type="button" className="button button--small" aria-label={`Remove ${describeMod(m)}`} onClick={() => change((p, c) => removeMod(p, m.id, c))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {addingMod && (
          <ModForm
            onSubmit={(mod) => {
              change((p, c) => addMod(p, mod, c))
              setAddingMod(false)
            }}
          />
        )}
      </Card>

      <Card
        title="Twists"
        aside={
          <button type="button" className="button button--small" aria-expanded={addingTwist} onClick={() => setAddingTwist(!addingTwist)}>
            {addingTwist ? 'Close' : '+ Add'}
          </button>
        }
      >
        {play.twists.length === 0 ? (
          <p className="sheet-empty">None.</p>
        ) : (
          <ul className="play-list">
            {play.twists.map((t) => (
              <li key={t.id}>
                <span className="tag">{t.kind === 'minor' ? 'Minor' : 'Major'}</span>
                <span className="play-list__text">{t.text}</span>
                <button type="button" className="button button--small" aria-label={`Resolve the ${t.kind} twist: ${t.text}`} onClick={() => change((p, c) => removeTwist(p, t.id, c))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {addingTwist && (
          <form
            className="play-add"
            onSubmit={(e) => {
              e.preventDefault()
              change((p, c) => addTwist(p, { kind: twistKind, text: twistText }, c))
              setTwistText('')
              setAddingTwist(false)
            }}
          >
            <label className="field" htmlFor={`${formId}-twist-kind`}>
              <span>Kind</span>
              <select id={`${formId}-twist-kind`} value={twistKind} onChange={(e) => setTwistKind(e.target.value as 'minor' | 'major')}>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
            </label>
            <label className="field" htmlFor={`${formId}-twist-text`}>
              <span>Twist</span>
              <input id={`${formId}-twist-text`} type="text" value={twistText} onChange={(e) => setTwistText(e.target.value)} />
            </label>
            <button type="submit" className="button" disabled={!twistText.trim()}>
              Add
            </button>
          </form>
        )}
      </Card>

      {makesMinions && (
        <Card title="Your minions">
          <MinionList
            minions={play.minions ?? []}
            forms={sheet.minionForms}
            onAdd={(m) => change((p, c) => addMinion(p, m, c))}
            onRemove={(mid) => change((p, c) => removeMinion(p, mid, c))}
            onShrink={(mid) => change((p, c) => shrinkMinion(p, mid, c))}
            onAddMod={(mid, mod) => change((p, c) => addMinionMod(p, mid, mod, c))}
            onRemoveMod={(mid, modId) => change((p, c) => removeMinionMod(p, mid, modId, c))}
            onUse={(mid, roll) => change((p, c) => recordMinionRoll(p, mid, roll, c))}
            onPickForm={(mid, form) => change((p, c) => setMinionForm(p, mid, form, c))}
            random={random}
          />
        </Card>
      )}
    </>
  )
  const actionCards = (
    <>
      <Card title="Basic actions" aside={<span className="play-card__note">Pick any power and quality</span>}>
        <div className="basic-actions">
          {BASIC_ACTIONS.map((action) => {
            const why = basicActionBlocked(action, ctx)
            return (
              <button key={action} type="button" className="button" disabled={Boolean(why)} aria-describedby={why ? `${formId}-why-${whyIds.indexOf(why)}` : undefined} onClick={() => setRolling({ kind: 'basic', action })}>
                <ActionIcon action={action} decorative />
                {ACTION_LABEL[action]}
              </button>
            )
          })}
        </div>
        {whyIds.map((why, i) => (
          <p key={why} id={`${formId}-why-${i}`} className="play-card__note">
            {why}
          </p>
        ))}
      </Card>

      {(['green', 'yellow', 'red', 'out'] as const).map((z) => {
        const list = abilities.filter((a) => a.from === z)
        if (!list.length) return null
        return (
          <section key={z} className={`sheet-band sheet-band--${z}`} aria-label={z === 'out' ? 'Out ability' : `${ZONE_LABEL[z]} abilities`}>
            <h4 className={`sheet-band__head${z === 'out' ? '' : ` zone-${z}`}`}>
              <span>{z === 'out' ? 'OUT' : ZONE_LABEL[z].toUpperCase()}</span>
              {z === 'out' && <span className="sheet-band__note">When your Health reaches 0</span>}
            </h4>
            <ul className="play-rows">
              {list.map((a) => (
                <AbilityRowPlay key={a.key} ability={a} reactionUsed={play.reactionUsed} compact={phone} onUse={() => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' })} />
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
  const historyCard = <History history={play.history} now={tick} />
  const overlays = (
    <>
      {rolling && (
        <RollDialog
          subject={rolling}
          dice={dice}
          zone={zone}
          mods={play.mods}
          onClose={() => setRolling(null)}
          formPicker={rolling.kind === 'ability' ? formPickerFor(rolling.text) : undefined}
          creates={rolling.kind === 'ability' ? minionCreation(rolling.text) : undefined}
          minionForms={sheet.minionForms}
          heroPoint={{ kind: 'solo', count: heroPoints }}
          onConfirm={(record, followUps, formChoice, made = [], choices = [], _overcoming, gainedHeroPoint = false) => {
            // A mod for one of the hero's own minions goes on it. (Solo Play has no one else to give one to.)
            let undo: RollChange | undefined
            let formBefore: Pick<PlayState, 'form' | 'dividedForm'> = {}
            change((p, c) => {
              formBefore = { ...(p.form ? { form: p.form } : {}), ...(p.dividedForm ? { dividedForm: p.dividedForm } : {}) }
              let after = confirmRoll(p, record, c)
              // The form or mode the ability changed to (the app never forces it).
              if (formChoice === 'civilian' || formChoice === 'heroic') after = setDividedForm(after, formChoice, c)
              else if (formChoice !== undefined) {
                const next = forms.find((f) => (f.key ?? '') === formChoice)
                if (next) after = setForm(after, next.key, next.name, c)
              }
              if (rolling.kind === 'ability' && rolling.reaction) after = setReactionUsed(after, true, c)
              for (const f of followUps) {
                const to = f.to ? parseTarget(f.to) : undefined
                if (!f.to) after = addMod(after, f.mod, c)
                else if (to?.kind === 'heroMinion') after = addMinionMod(after, to.minionId, f.mod, c)
              }
              for (const m of made) after = addMinion(after, m, c)
              // A Defend for the hero (no target is someone outside the app): a defense they hold.
              for (const ch of choices) {
                const r = record.results[ch.result]
                if (ch.to === '' && r?.action === 'defend' && r.total !== undefined) after = gainDefense(after, effectAmount(r.total), heroDisplayName(hero), c)
              }
              if (gainedHeroPoint) after = noteHeroPoints(after, heroPoints, heroPoints + 1, c)
              undo = rollChange(p, after, record.title)
              return after
            }, gainedHeroPoint ? 1 : undefined)
            const usedUp = record.results.flatMap((r) => r.mods).filter((m) => !m.persistent)
            setToast({
              id: ++toastCount.current,
              text: [
                'Roll recorded.',
                usedUp.length ? `Used up: ${usedUp.map(modName).join(', ')}.` : '',
              ]
                .filter(Boolean)
                .join(' '),
              // Undo reverses just this roll.
              undo: () =>
                undo &&
                change((p) => {
                  const undone = undoRoll(p, undo!)
                  if (formChoice === undefined) return undone
                  // Back to the form or mode it was in: only the one the choice changed.
                  if (formChoice === 'civilian' || formChoice === 'heroic') {
                    const { dividedForm: _divided, ...rest } = undone
                    return { ...rest, ...(formBefore.dividedForm ? { dividedForm: formBefore.dividedForm } : {}) }
                  }
                  const { form: _form, ...rest } = undone
                  return { ...rest, ...(formBefore.form ? { form: formBefore.form } : {}) }
                }, gainedHeroPoint ? -1 : undefined),
            })
          }}
          // A Defend protects the hero or no one in the app: solo minions take no hits here.
          targetsFor={(effect, opts) => targetOptions({ kind: 'hero', id: hero.id }, effect, soloTable(hero, effect === 'defend' ? {} : play), opts)}
          selfId={targetId({ kind: 'hero', id: hero.id })}
          pickTargets="mods"
          random={random}
        />
      )}
      {/* "Roll recorded" with Undo, for ten seconds (an action keeps a toast longer). */}
      <Toasts toasts={toast ? [{ id: String(toast.id), text: toast.text, action: { label: 'Undo', onClick: toast.undo } }] : []} onDismiss={() => setToast(null)} />
    </>
  )

  // The overlays sit after either layout, in the same place, so crossing 760px (a phone turned
  // sideways) keeps an open roll or toast rather than rebuilding it.
  const layout = phone ? (
    <div className="play-phone">
      <div className="play-topbar" role="region" aria-label="At a glance">
        <div className="play-topbar__row">
          <div>
            <p className="play-topbar__name">{heroDisplayName(hero)}</p>
            {health !== undefined && (
              <p className="play-topbar__health">
                <strong>{health}</strong> <span>/ {sheet.maxHealth}</span>
                {own && <span className={own === 'out' ? 'zone-chip zone-out' : `zone-chip zone-${own}`}>{PLAY_ZONE_LABEL[own]}</span>}
              </p>
            )}
          </div>
          <div className="play-topbar__stat">
            {die ? <DieIcon die={die} /> : <span>—</span>}
            <span>Status</span>
          </div>
          <div className="play-topbar__stat">
            <strong>{heroPoints}</strong>
            <span>Hero pts</span>
          </div>
        </div>
        <div className="play-topbar__row">
          {health !== undefined && (
            <>
              <button type="button" className="button button--small" aria-label="Lose 1 Health" onClick={() => changeHealth(-1)}>
                −1
              </button>
              <button type="button" className="button button--small" aria-label="Gain 1 Health" onClick={() => changeHealth(1)}>
                +1
              </button>
            </>
          )}
          <span className="play-topbar__scene">
            Scene {ZONE_LABEL[scene]}
            {own && ` · you ${PLAY_ZONE_LABEL[own]}`}
          </span>
        </div>
      </div>
      <div
        className="play-tabs"
        role="tablist"
        aria-label="Play"
        onKeyDown={(e) => {
          // Left and Right move between the tabs (Home and End to the ends), as tabs do.
          const at = PHONE_TABS.findIndex(([v]) => v === tab)
          const next = e.key === 'ArrowRight' ? (at + 1) % PHONE_TABS.length : e.key === 'ArrowLeft' ? (at + PHONE_TABS.length - 1) % PHONE_TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? PHONE_TABS.length - 1 : -1
          if (next < 0) return
          e.preventDefault()
          setTab(PHONE_TABS[next]![0])
          document.getElementById(`${formId}-tab-${PHONE_TABS[next]![0]}`)?.focus()
        }}
      >
        {PHONE_TABS.map(([value, label]) => (
          <button key={value} type="button" role="tab" id={`${formId}-tab-${value}`} aria-controls={`${formId}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="play-panel" id={`${formId}-panel`} role="tabpanel" aria-labelledby={`${formId}-tab-${tab}`}>
        {tab === 'actions' ? (
          <div className="play-actions" role="region" aria-label="Actions">
            {actionCards}
          </div>
        ) : tab === 'status' ? (
          <div className="play-status" role="region" aria-label="Status">
            {statusCards}
          </div>
        ) : (
          historyCard
        )}
      </div>
    </div>
  ) : (
    <div className="play-layout">
      <div className="play-status" role="region" aria-label="Status">
        {statusCards}
      </div>
      <div className="play-actions" role="region" aria-label="Actions">
        {actionCards}
        {historyCard}
      </div>
    </div>
  )
  return (
    <>
      {layout}
      {overlays}
    </>
  )
}
