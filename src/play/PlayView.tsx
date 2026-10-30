/**
 * Play mode of the character page (docs/design/hero-sheet/spec.md, "Play mode"): a status
 * column (Health, scene and status die, form or mode, dice, hero points and the reaction,
 * bonuses and penalties, twists, the game) beside an actions column (basic actions, the ability
 * bands with Use or why not, and the history). Every change is free and immediate, saved with
 * the hero, and logged to the history (./state.ts has the rules; ./forms.ts says which
 * abilities can be used).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { heroPath } from '../app/route'
import { ActionIcon, AbilityIcons, AbilityText, DiceText, DieIcon } from '../components/icons'
import { buildSheet } from '../creation/sheet'
import { modeLimits } from '../creation/format'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL, ZONE_LABEL } from '../hero/labels'
import type { Hero, PlayHistoryEntry, PlayMod, PlayState } from '../hero/model'
import type { BasicAction, Die, Zone } from '../rules/types'
import { usePlayerSnapshot, useSession } from '../session/context'
import { memberName } from '../session/gm'
import { heroSummary } from '../session/player'
import { PlayerPanel } from '../session/PlayerPanel'
import { villainTarget } from '../session/types'
import { availabilityContext, basicActionBlocked, changesForm, currentForm, dividedForm, formDice, formNoun, formZoneNote, notInDividedForm, playAbilities, playForms, zoneLockNotice, type PlayAbility, type PlayForm } from './forms'
import { diceChanges, noChanges } from '../creation/dice-changes'
import type { HeroTrait } from '../creation/traits'
import { outerLayer } from '../creation/layers'
import { ModForm, type ModTarget } from './ModForm'
import { confirmRoll, rollChange, undoRoll, type RollChange } from './roll'
import { RollDialog, type FormPicker, type RollSubject } from './RollDialog'
import { addMod, modName, addTwist, currentHealth, describeMod, effectiveZone, emptyPlay, healthZone, MAX_HERO_POINTS, noteGivenMod, removeMod, removeTwist, setDividedForm, setForm, setHealth, setHeroPoints, setReactionUsed, setSceneZone, statusDieFor, type Clock } from './state'
import { formatFull, formatWhen } from './time'
import { useTick } from './useTick'

const ZONES = ['green', 'yellow', 'red'] as const
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
function AbilityRowPlay({ ability: a, reactionUsed, onUse }: { ability: PlayAbility; reactionUsed: boolean; onUse: () => void }) {
  return (
    <li className={a.blocked ? 'play-row play-row--blocked' : 'play-row'}>
      <span className="play-row__name">
        <AbilityIcons actions={a.effects} />
        <strong>{a.name}</strong>
        <span className="play-row__type">{ABILITY_TYPE_LABEL[a.type]}</span>
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
      <span className="play-row__text">
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

/** How long a roll's Undo stays offered. */
const UNDO_MS = 10_000

/** "Roll recorded. Used up: …" with Undo, for about ten seconds. */
function Toast({ text, undo, onClose }: { text: string; undo: () => void; onClose: () => void }) {
  // The timer starts once per toast; re-renders (a new onClose) don't restart it.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const timer = setTimeout(() => close.current(), UNDO_MS)
    return () => clearTimeout(timer)
  }, [undo])
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button
        type="button"
        className="button button--small"
        onClick={() => {
          undo()
          onClose()
        }}
      >
        Undo
      </button>
    </div>
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
            <strong>{latest.text}</strong>
            <time dateTime={latest.at} title={formatFull(latest.at)}>
              {formatWhen(latest.at, now)}
            </time>
          </p>
          <ul>
            {(latest.details ?? []).map((d, i) => (
              <li key={i}>
                <DiceText text={d} />
              </li>
            ))}
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
                {h.text}
                {h.details && h.details.length > 0 && (
                  <ul>
                    {h.details.map((d, i) => (
                      <li key={i}>{d}</li>
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

export function PlayView({ hero, update, clock, random }: { hero: Hero; update: (change: (draft: Hero) => void) => void; clock: () => Clock; random?: () => number }) {
  const id = hero.id
  const formId = useId()
  const tick = useTick()
  const [amount, setAmount] = useState('')
  const [addingMod, setAddingMod] = useState(false)
  const [addingTwist, setAddingTwist] = useState(false)
  const [twistKind, setTwistKind] = useState<'minor' | 'major'>('minor')
  const [twistText, setTwistText] = useState('')
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)

  // A game session this hero is playing in (Phase 4).
  const session = useSession()
  const player = session.player?.heroId === id ? session.player : undefined
  const snapshot = usePlayerSnapshot(player)
  useEffect(() => {
    if (!player) return
    // The session's changes (the GM's scene, mods others gave) go into the hero's play state.
    const next = player.sync(hero.play ?? emptyPlay())
    if (next) update((h) => void (h.play = next))
    // The table sees the hero, and their history as it happens.
    player.updateHero(heroSummary(hero, buildSheet(hero), next ?? hero.play ?? emptyPlay()))
    if (snapshot?.status === 'connected') player.share((next ?? hero.play)?.history ?? [])
  }, [player, snapshot, hero, update])

  const sheet = buildSheet(hero)
  const play = hero.play ?? emptyPlay()
  const change = (fn: (p: PlayState, c: Clock) => PlayState) =>
    update((h) => {
      h.play = fn(h.play ?? emptyPlay(), clock())
    })
  // In a game, a mod can go to another hero (through the GM).
  const targets: ModTarget[] =
    snapshot?.status === 'connected' && player
      ? [
          ...(snapshot.state?.members ?? []).filter((m) => m.clientId !== player.clientId && m.hero).map((m) => ({ id: m.clientId, name: memberName(m) })),
          // Villains in the game take mods too (a Hinder); the GM's browser adds them.
          ...(snapshot.state?.villains ?? []).map((v) => ({ id: villainTarget(v.id), name: v.name })),
        ]
      : []
  /** Adds a mod to the hero, or gives it to another; false when it couldn't be sent. */
  const giveOrAdd = (mod: Omit<PlayMod, 'id'>, to?: string): boolean => {
    if (!to) {
      change((p, c) => addMod(p, mod, c))
      return true
    }
    const target = targets.find((t) => t.id === to)
    if (!target || !player?.giveMod(target.id, mod)) return false
    change((p, c) => noteGivenMod(p, mod, target.name, c))
    return true
  }
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
  const abilities = playAbilities(hero, sheet, play, zone)
  // Why basic actions can't be taken, each once (the buttons point to theirs).
  const whyIds = [...new Set(BASIC_ACTIONS.map((a) => basicActionBlocked(a, ctx)).filter((w): w is string => Boolean(w)))]
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0
  /** For an ability that changes form or mode: the choices for its Resolve step. */
  const formPickerFor = (text: string): FormPicker | undefined => {
    if (!changesForm(text)) return undefined
    if (divided && /civilian form/i.test(text)) {
      return { label: 'Change to', current: divided, options: [{ value: 'civilian', label: 'Civilian form' }, { value: 'heroic', label: 'Heroic form' }] }
    }
    if (!forms.length || !form) return undefined
    return { label: `Change ${noun} to`, current: form.key ?? '', options: forms.map((f) => ({ value: f.key ?? '', label: f.name, ...(formZoneNote(f, zone) ? { note: formZoneNote(f, zone) } : {}) })) }
  }
  const changeHealth = (by: number) => change((p, c) => setHealth(p, sheet, (currentHealth(sheet, p) ?? 0) + by, c))
  const ranges = sheet.healthRanges

  return (
    <div className="play-layout">
      <div className="play-status" role="region" aria-label="Status">
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
                <button type="button" className="button" disabled={!validAmount} onClick={() => (changeHealth(-delta), setAmount(''))}>
                  Lose
                </button>
                <button type="button" className="button" disabled={!validAmount} onClick={() => (changeHealth(delta), setAmount(''))}>
                  Gain
                </button>
              </div>
            </>
          )}
        </Card>

        <Card title="Scene" aside={player && <span className="play-card__note">Set by the GM</span>}>
          {player ? (
            <p className="play-scene__online">
              <span className={`zone-chip zone-${scene}`}>{ZONE_LABEL[scene]}</span> Follows the GM's scene tracker
            </p>
          ) : (
            <div className="segmented segmented--fill" role="group" aria-label="Scene zone">
              {ZONES.map((z) => (
                <button key={z} type="button" className={scene === z ? `zone-${z}` : undefined} aria-pressed={scene === z} onClick={() => scene !== z && change((p, c) => setSceneZone(p, z, c))}>
                  {ZONE_LABEL[z]}
                </button>
              ))}
            </div>
          )}
          <div className="status-die-line">
            {die && <DieIcon die={die} />}
            <div>
              <p className="status-die-line__what">Status die: {zone === 'out' ? 'none' : PLAY_ZONE_LABEL[zone ?? 'green']}</p>
              <p className="play-card__note">
                {zone === 'out'
                  ? "You're Out: only your Out ability is available."
                  : `You: ${PLAY_ZONE_LABEL[own ?? 'green']} · Scene: ${ZONE_LABEL[scene]}. The more severe one sets your status die and abilities.`}
              </p>
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
            {zoneLockNotice(form, zone) && <p className="form-notice">{zoneLockNotice(form, zone)}</p>}
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
              notInDividedForm(hero, sheet, divided).length > 0 && (
                <p className="play-card__note">
                  Not in this form:{' '}
                  {notInDividedForm(hero, sheet, divided)
                    .map((t) => t.name)
                    .join(', ')}
                </p>
              )
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
                            {!was && form?.key && <span className="play-dice__tag">added</span>}
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
            <button type="button" className="button" aria-label="Spend a hero point" disabled={play.heroPoints <= 0} onClick={() => change((p, c) => setHeroPoints(p, p.heroPoints - 1, c))}>
              −
            </button>
            <strong aria-live="polite" aria-label={`${play.heroPoints} of ${MAX_HERO_POINTS} hero points`}>
              {play.heroPoints}
            </strong>
            <button type="button" className="button" aria-label="Gain a hero point" disabled={play.heroPoints >= MAX_HERO_POINTS} onClick={() => change((p, c) => setHeroPoints(p, p.heroPoints + 1, c))}>
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
          {addingMod && <ModForm targets={targets} onSubmit={(mod, to) => giveOrAdd(mod, to) && setAddingMod(false)} />}
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

        <Card title="Game">
          <PlayerPanel
            heroId={id}
            player={session.player}
            snapshot={snapshot}
            hosting={Boolean(session.gm)}
            onLeave={session.leave}
            lastRoom={session.lastGame?.room}
            onRejoin={() => session.lastGame && session.join({ ...session.lastGame, heroId: id, sharedUpTo: play.history.at(-1)?.id })}
          />
        </Card>
      </div>

      <div className="play-actions" role="region" aria-label="Actions">
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
                  <AbilityRowPlay key={a.key} ability={a} reactionUsed={play.reactionUsed} onUse={() => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' })} />
                ))}
              </ul>
            </section>
          )
        })}

        <History history={play.history} now={tick} />
      </div>

      {rolling && (
        <RollDialog
          subject={rolling}
          dice={dice}
          zone={zone}
          mods={play.mods}
          onClose={() => setRolling(null)}
          formPicker={rolling.kind === 'ability' ? formPickerFor(rolling.text) : undefined}
          onConfirm={(record, followUps, formChoice) => {
            // Mods for other heroes go out first; one whose hero has left can't.
            const gifts = followUps.filter((f) => f.to).map((f) => {
              const target = targets.find((t) => t.id === f.to)
              return { ...f, name: target?.name ?? 'a hero who left', ok: Boolean(target && player?.giveMod(target.id, f.mod)) }
            })
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
              for (const f of followUps) if (!f.to) after = addMod(after, f.mod, c)
              for (const g of gifts) if (g.ok) after = noteGivenMod(after, g.mod, g.name, c)
              undo = rollChange(p, after, record.title)
              return after
            })
            const usedUp = record.results.flatMap((r) => r.mods).filter((m) => !m.persistent)
            const given = gifts.filter((g) => g.ok)
            const failed = gifts.filter((g) => !g.ok)
            setToast({
              text: [
                'Roll recorded.',
                usedUp.length ? `Used up: ${usedUp.map(modName).join(', ')}.` : '',
                ...failed.map((g) => `Couldn't give ${describeMod(g.mod)} to ${g.name}.`),
                given.length ? `Undo won't take back what you gave ${[...new Set(given.map((g) => g.name))].join(' and ')}.` : '',
              ]
                .filter(Boolean)
                .join(' '),
              // Undo reverses just this roll; in a game the table saw it, so it notes the undo instead.
              undo: () =>
                undo &&
                change((p, c) => {
                  const undone = undoRoll(p, undo!, player ? c : undefined)
                  if (formChoice === undefined) return undone
                  // Back to the form or mode it was in.
                  const { form: _form, dividedForm: _divided, ...rest } = undone
                  return { ...rest, ...formBefore }
                }),
            })
          }}
          targets={targets}
          random={random}
        />
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
