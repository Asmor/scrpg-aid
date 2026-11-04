/**
 * The player's side panel at the table (docs/design/game-table/spec.md, section 14, "The
 * player's side panel"): "My hero · game's copy". It works on the game's copy of the hero, as the
 * GM's device last sent it, and every control sends one action (section 10). Nothing changes here
 * until the GM's device answers: a pending change shows the old value muted with the new one
 * beside it ("18 → 15", "Sending…").
 *
 * While the GM isn't connected, controls that change the game are disabled and say "Needs the GM".
 */
import { defenseText } from '../play/defense'
import { ChooseDefense } from './ChooseDefense'
import { useId, useState, type ReactNode } from 'react'
import { DieIcon } from '../components/icons'
import { buildSheet } from '../creation/sheet'
import { outerLayer, secondaryLayer } from '../creation/layers'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL } from '../hero/labels'
import { heroDisplayName, type PlayMod } from '../hero/model'
import { type MenuItem } from '../library/Popover'
import { availabilityContext, basicActionBlocked, changesForm, currentForm, dividedForm, formDice, formNoun, formZoneNote, playAbilities, playForms } from '../play/forms'
import { MinionList } from '../play/MinionList'
import { minionCreation } from '../play/minions'
import { ModForm } from '../play/ModForm'
import { RollDialog, type FormPicker, type RollSubject } from '../play/RollDialog'
import { currentHealth, describeMod, effectiveZone, MAX_HERO_POINTS, modName, statusDieFor } from '../play/state'
import type { PendingAction } from '../session/client'
import type { HeroAction } from './actions'
import type { HeroOnTable, TableView } from './project'
import { rollAction, targetId } from './roll-targets'
import { targetOptions, viewTable } from './target-options'
import { heroPlayInScene } from './table'
import { MenuButton, ZoneChip } from './TableCenter'

interface Props {
  hero: HeroOnTable
  view: Pick<TableView, 'scene' | 'heroes' | 'villains' | 'groups' | 'pendingHits'>
  /** Actions sent and not answered yet. */
  pending: readonly PendingAction[]
  /** Whether the GM is connected: actions can be sent. */
  live: boolean
  syncWaiting: boolean
  /** Sends an action. */
  act: (action: HeroAction) => void
  menu: MenuItem[]
  onCancelSync: () => void
  onOpenSheet: () => void
  /** The first-join note, once per hero per game: the game's name, and Got it. */
  note?: { gameName: string; dismiss: () => void }
  random?: () => number
}

/** "Needs the GM", for a control's accessible description while it's disabled. */
function NeedsGm({ id }: { id: string }) {
  return (
    <span id={id} className="visually-hidden">
      Needs the GM
    </span>
  )
}

export function PlayerPanel({ hero, view, pending, live, syncWaiting, act, menu, onCancelSync, onOpenSheet, note, random }: Props) {
  const id = useId()
  const needs = `${id}-needs`
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  const [adding, setAdding] = useState<'mod' | 'twist' | null>(null)
  const [twist, setTwist] = useState('')
  const off = !live
  const describedBy = off ? needs : undefined

  const sheet = buildSheet(hero.sheet)
  const play = heroPlayInScene({ scene: view.scene }, hero.play)
  const zone = effectiveZone(sheet, play)
  const health = currentHealth(sheet, play)
  const dice = formDice(hero.sheet, sheet, play)
  const die = statusDieFor(dice, zone)
  const forms = playForms(sheet)
  const form = currentForm(forms, play)
  const divided = dividedForm(sheet, play)
  const noun = formNoun(forms)
  const abilities = playAbilities(hero.sheet, sheet, play, zone).filter((a) => !a.always)
  const ctx = availabilityContext(hero.sheet, sheet, play, zone)
  const makesMinions = [outerLayer(hero.sheet), secondaryLayer(hero.sheet)].some((l) => l?.archetype.minionForms)
  const name = heroDisplayName(hero.sheet)

  // What's waiting on the GM: Health shows "18 → 15".
  const healthDelta = pending.reduce((sum, p) => sum + (p.action.kind === 'health' ? p.action.by : 0), 0)
  const sending = pending.some((p) => !p.timedOut)

  const formPickerFor = (text: string): FormPicker | undefined => {
    if (!changesForm(text)) return undefined
    if (divided && (!forms.length || /civilian form/i.test(text))) {
      return { label: 'Change to', current: divided, options: [{ value: 'civilian', label: 'Civilian form' }, { value: 'heroic', label: 'Heroic form' }] }
    }
    if (!forms.length || !form) return undefined
    return { label: `Change ${noun} to`, current: form.key ?? '', options: forms.map((f) => ({ value: f.key ?? '', label: f.name, ...(formZoneNote(f, zone) ? { note: formZoneNote(f, zone) } : {}) })) }
  }

  const button = (label: string, onClick: () => void, opts: { aria?: string; primary?: boolean; disabled?: boolean; small?: boolean } = {}): ReactNode => (
    <button
      type="button"
      className={`button${opts.primary ? ' button--primary' : ''}${opts.small ? ' button--small' : ''}`}
      aria-label={opts.aria}
      aria-describedby={describedBy}
      disabled={off || opts.disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <aside className="gt-side" aria-label="My hero">
      {off && <NeedsGm id={needs} />}
      {note && (
        <section className="card gt-card gt-note" aria-label="About the game's copy">
          <p>
            <strong>
              {name} is in {note.gameName}.
            </strong>{' '}
            The game keeps {name}'s Health, mods and everything else in play. Your library sheet doesn't change.
          </p>
          <button type="button" className="button button--small" onClick={note.dismiss}>
            Got it
          </button>
        </section>
      )}
      {(view.pendingHits ?? [])
        .filter((h) => h.heroId === hero.id)
        .map((h) => (
          <section key={h.id} className="card gt-card gt-waiting" aria-label="Choose a defense" role="alert">
            <ChooseDefense hit={h} heroName={name} defenses={play.defenses ?? []} disabled={off} {...(describedBy ? { describedBy } : {})} onChoose={(defenseId) => act({ kind: 'chooseDefense', hitId: h.id, defenseId })} />
          </section>
        ))}
      <section className="card gt-card gt-player">
        <div className="gt-row">
          <div className="gt-grow">
            <div className="gt-label">My hero · game's copy</div>
            <h2>
              <button type="button" className="link-button" onClick={onOpenSheet} aria-label={`${name}: open the game's copy of the sheet`}>
                {name}
              </button>
            </h2>
          </div>
          <MenuButton label={`More for ${name}`} items={menu} sheets={false} />
        </div>
        {syncWaiting && (
          <div className="gt-waiting" role="status">
            <p>Waiting for the GM to approve your sheet update. You can keep playing meanwhile.</p>
            {button('Cancel request', onCancelSync, { small: true })}
          </div>
        )}
        {off && <p className="gt-sub">Needs the GM: changes wait until the GM is connected.</p>}

        <div className="gt-player__health">
          {button('−', () => act({ kind: 'health', by: -1 }), { aria: 'Lose 1 Health', disabled: health === undefined })}
          <p className="gt-player__hp" aria-live="polite">
            {health === undefined ? (
              <span className="gt-sub">No Health yet</span>
            ) : healthDelta ? (
              <>
                <span className="gt-old">{health}</span> → <strong>{health + healthDelta}</strong> <span className="gt-sub">Sending…</span>
              </>
            ) : (
              <>
                <strong>{health}</strong> <span className="gt-sub">of {sheet.maxHealth} Health</span>
              </>
            )}
          </p>
          {button('+', () => act({ kind: 'health', by: 1 }), { aria: 'Gain 1 Health', disabled: health === undefined })}
          {zone && <ZoneChip zone={zone} label={PLAY_ZONE_LABEL[zone].toUpperCase()} />}
        </div>

        <div className="gt-row gt-player__stats">
          <span className="gt-player__stat">
            <span className="gt-label">Status die</span>
            {die ? <DieIcon die={die} /> : <span>—</span>}
          </span>
          <span className="gt-player__stat">
            <span className="gt-label">Hero points</span>
            <span className="gt-row">
              {button('−', () => act({ kind: 'heroPoints', by: -1 }), { aria: 'Spend a hero point', disabled: play.heroPoints <= 0, small: true })}
              <strong>{play.heroPoints}</strong>
              {button('+', () => act({ kind: 'heroPoints', by: 1 }), { aria: 'Gain a hero point', disabled: play.heroPoints >= MAX_HERO_POINTS, small: true })}
            </span>
          </span>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={play.reactionUsed} disabled={off} aria-describedby={describedBy} onChange={(e) => act({ kind: 'reaction', used: e.target.checked })} />
          Reaction used this round
        </label>

        {(forms.length > 0 || divided) && (
          <fieldset className="gt-player__forms">
            <legend className="gt-label">{divided && !forms.length ? 'Form' : noun === 'mode' ? 'Mode' : 'Form'}</legend>
            {divided &&
              (['civilian', 'heroic'] as const).map((f) => (
                <label key={f} className="checkbox">
                  <input type="radio" name={`${id}-divided`} checked={divided === f} disabled={off} aria-describedby={describedBy} onChange={() => act({ kind: 'dividedForm', form: f })} />
                  {f === 'civilian' ? 'Civilian form' : 'Heroic form'}
                </label>
              ))}
            {forms.map((f) => (
              <label key={f.key ?? 'base'} className="checkbox">
                <input type="radio" name={`${id}-form`} checked={(form?.key ?? '') === (f.key ?? '')} disabled={off} aria-describedby={describedBy} onChange={() => act({ kind: 'form', key: f.key ?? '' })} />
                {f.name}
              </label>
            ))}
          </fieldset>
        )}

        <div className="gt-label">Bonuses and penalties</div>
        {play.mods.length === 0 ? (
          <p className="gt-sub">None.</p>
        ) : (
          <ul className="gt-chips">
            {play.mods.map((m: PlayMod) => (
              <li key={m.id} className="gt-mod">
                {m.value > 0 ? `+${m.value}` : `−${-m.value}`} {modName(m)}
                <button type="button" className="gt-chip-x" aria-label={`Remove ${describeMod(m)}`} aria-describedby={describedBy} disabled={off} onClick={() => act({ kind: 'removeMod', modId: m.id })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {(play.defenses?.length ?? 0) > 0 && (
          <>
            <div className="gt-label">Defenses</div>
            <ul className="gt-chips" aria-label="Defenses">
              {play.defenses!.map((d) => (
                <li key={d.id} className="gt-mod gt-defense">
                  {defenseText(d, heroDisplayName(hero.sheet))}
                </li>
              ))}
            </ul>
            <p className="gt-sub">Each hit uses one. They're gone when your next turn starts.</p>
          </>
        )}
        <div className="gt-row">
          {button('Roll', () => setRolling({ kind: 'basic' }), { primary: true, disabled: Boolean(basicActionBlocked('attack', ctx)) && Boolean(basicActionBlocked('overcome', ctx)) })}
          <button type="button" className="button button--small" aria-expanded={adding === 'mod'} aria-describedby={describedBy} disabled={off} onClick={() => setAdding(adding === 'mod' ? null : 'mod')}>
            + Mod
          </button>
          <button type="button" className="button button--small" aria-expanded={adding === 'twist'} aria-describedby={describedBy} disabled={off} onClick={() => setAdding(adding === 'twist' ? null : 'twist')}>
            + Twist
          </button>
        </div>
        {adding === 'mod' && !off && (
          <ModForm
            onSubmit={(mod) => {
              act({ kind: 'addMod', mod })
              setAdding(null)
            }}
          />
        )}
        {adding === 'twist' && !off && (
          <form
            className="gt-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!twist.trim()) return
              act({ kind: 'addTwist', twist: { kind: 'minor', text: twist.trim() } })
              setTwist('')
              setAdding(null)
            }}
          >
            <label className="visually-hidden" htmlFor={`${id}-twist`}>
              Minor twist
            </label>
            <input id={`${id}-twist`} type="text" value={twist} placeholder="Minor twist" onChange={(e) => setTwist(e.target.value)} />
            <button type="submit" className="button button--small" disabled={!twist.trim()}>
              Add
            </button>
          </form>
        )}
        {play.twists.length > 0 && (
          <ul className="gt-player__twists">
            {play.twists.map((t) => (
              <li key={t.id} className="gt-row">
                <span className="gt-grow">
                  {t.kind === 'major' ? 'Major' : 'Minor'} twist: {t.text}
                </span>
                {button('Resolve', () => act({ kind: 'removeTwist', twistId: t.id }), { small: true, aria: `Resolve the ${t.kind} twist: ${t.text}` })}
              </li>
            ))}
          </ul>
        )}

        <div className="gt-label">Abilities</div>
        <ul className="gt-lib">
          {abilities.map((a) => {
            const why = a.blocked ?? (a.type === 'R' && play.reactionUsed ? 'Reaction used this round' : undefined)
            return (
              <li key={a.key} className="gt-row">
                <span className="gt-grow">
                  <strong>{a.name}</strong>
                  <span className="gt-sub">
                    {' '}
                    {ABILITY_TYPE_LABEL[a.type]}
                    {why ? ` · ${why}` : a.from !== 'green' && a.from !== 'out' ? ` · ${PLAY_ZONE_LABEL[a.from]}` : ''}
                  </span>
                </span>
                {button('Use', () => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' }), { small: true, disabled: Boolean(why), aria: `Use ${a.name}` })}
              </li>
            )
          })}
        </ul>

        {makesMinions && (
          <>
            <div className="gt-label">
              {(play.minions ?? []).length} {(play.minions ?? []).length === 1 ? 'minion' : 'minions'}
            </div>
            <fieldset disabled={off} className="gt-plain-fieldset" aria-describedby={describedBy}>
              <MinionList
                minions={play.minions ?? []}
                forms={sheet.minionForms}
                onAdd={(minion) => act({ kind: 'makeMinion', minion })}
                onRemove={(minionId) => act({ kind: 'removeMinion', minionId })}
                onShrink={(minionId) => act({ kind: 'shrinkMinion', minionId })}
                onAddMod={(minionId, mod) => act({ kind: 'minionMod', minionId, mod })}
                onRemoveMod={(minionId, modId) => act({ kind: 'removeMinionMod', minionId, modId })}
                onUse={(minionId, roll) => act({ kind: 'minionRoll', minionId, roll })}
                onPickForm={(minionId, f) => act({ kind: 'minionForm', minionId, form: f })}
                random={random}
              />
            </fieldset>
          </>
        )}
        {sending && <p className="gt-sub" role="status">Sending…</p>}
      </section>

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
          targetsFor={(effect, opts) => targetOptions({ kind: 'hero', id: hero.id }, effect, viewTable(view), opts)}
          selfId={targetId({ kind: 'hero', id: hero.id })}
          onConfirm={(record, followUps, formChoice, made = [], choices = []) => {
            const subject = rolling.kind === 'ability' ? { kind: 'ability' as const, name: rolling.name } : { kind: 'basic' as const, ...(rolling.action ? { action: rolling.action } : {}) }
            act({ kind: 'roll', roll: rollAction(hero.id, subject, record, followUps, formChoice, made, choices) })
          }}
          random={random}
        />
      )}
    </aside>
  )
}
