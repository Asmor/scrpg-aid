/**
 * Play mode of the character page (docs/design/hero-sheet/spec.md, "Play mode"): a status
 * column (Health, scene and status die, form or mode, dice, hero points and the reaction,
 * bonuses and penalties, twists, the game) beside an actions column (basic actions, the ability
 * bands with Use or why not, and the history). Every change is free and immediate, saved with
 * the hero, and logged to the history (./state.ts has the rules; ./forms.ts says which
 * abilities can be used).
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { heroPath } from '../app/route'
import { ActionIcon, AbilityIcons, AbilityText, DiceText, DieIcon } from '../components/icons'
import { buildSheet } from '../creation/sheet'
import { modeLimits } from '../creation/format'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL, ZONE_LABEL } from '../hero/labels'
import type { Hero, PlayHistoryEntry, PlayMod, PlayState } from '../hero/model'
import type { BasicAction, Zone } from '../rules/types'
import { usePlayerSnapshot, useSession } from '../session/context'
import { memberName } from '../session/gm'
import { heroSummary } from '../session/player'
import { PlayerPanel } from '../session/PlayerPanel'
import { villainTarget } from '../session/types'
import { availabilityContext, basicActionBlocked, currentForm, dividedForm, formAvailable, formDice, formNoun, playAbilities, playForms, type PlayAbility } from './forms'
import { ModForm, type ModTarget } from './ModForm'
import { confirmRoll } from './roll'
import { RollDialog, type RollSubject } from './RollDialog'
import { addMod, addTwist, currentHealth, describeMod, effectiveZone, emptyPlay, healthZone, MAX_HERO_POINTS, noteGivenMod, removeMod, removeTwist, setDividedForm, setForm, setHealth, setHeroPoints, setReactionUsed, setSceneZone, statusDieFor, type Clock } from './state'
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
  const abilities = playAbilities(hero, sheet, play, zone)
  // Why basic actions can't be taken, each once (the buttons point to theirs).
  const whyIds = [...new Set(BASIC_ACTIONS.map((a) => basicActionBlocked(a, ctx)).filter((w): w is string => Boolean(w)))]
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0
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

        {(forms.length > 0 || divided) && (
          <Card title={noun === 'mode' ? 'Mode' : 'Form'}>
            {forms.length > 0 && (
              <label className="field" htmlFor={`${formId}-form`}>
                <span>{noun === 'mode' ? 'Current mode' : 'Current form'}</span>
                <select
                  id={`${formId}-form`}
                  value={form?.key ?? ''}
                  onChange={(e) => {
                    const next = forms.find((f) => (f.key ?? '') === e.target.value)
                    if (next) change((p, c) => setForm(p, next.key, next.name, c))
                  }}
                >
                  {forms.map((f) => (
                    <option key={f.key ?? ''} value={f.key ?? ''} disabled={f !== form && !formAvailable(f, zone)}>
                      {f.name}
                      {f.zone === 'yellow' ? ' (Yellow)' : f.zone === 'red' ? ' (Red)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form && !formAvailable(form, zone) && <p className="hint">{form.zone === 'red' ? 'This needs the Red zone.' : 'This needs the Yellow or Red zone.'}</p>}
            {divided && (
              <fieldset className="play-scene">
                <legend>Divided form</legend>
                {(['civilian', 'heroic'] as const).map((f) => (
                  <label key={f} className="checkbox">
                    <input type="radio" name={`${formId}-divided`} checked={divided === f} onChange={() => change((p, c) => setDividedForm(p, f, c))} />
                    {f === 'civilian' ? 'Civilian' : 'Heroic'}
                  </label>
                ))}
              </fieldset>
            )}
            {dice.slots[0] === dice.slots[1] && <p className="hint">Divided Psyche: you roll two {dice.slots[0] === 'power' ? 'powers' : 'qualities'} with your status die.</p>}
            {form && (form.cannot.length > 0 || form.immobile) && <p>{modeLimits(form.cannot, form.immobile)}</p>}
            {form?.powerless && <p>Only principle abilities can be used.</p>}
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
                    {list.map((t) => (
                      <li key={`${t.trait.kind}:${t.trait.id}`}>
                        <span>{t.name}</span>
                        <DieIcon die={t.die} size="compact" />
                      </li>
                    ))}
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
                  <span className="play-list__text">{m.label || (m.value > 0 ? 'Bonus' : 'Penalty')}</span>
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
          onConfirm={(record) =>
            change((p, c) => {
              const after = confirmRoll(p, record, c)
              return rolling.kind === 'ability' && rolling.reaction ? setReactionUsed(after, true, c) : after
            })
          }
          targets={targets}
          onAddMod={giveOrAdd}
          random={random}
        />
      )}
    </div>
  )
}
