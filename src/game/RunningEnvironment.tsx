/**
 * The GM screen's Running panel for the environment (scrpg-aid-designs/npcs/spec.md, "The
 * environment's turn", and environment-turn.dc.html): its dice and their roll, its twists by
 * zone with Mark used, its attached templates with Add, its groups with Run, + Challenge, and
 * Hand off. All of it is the GM's alone.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { DicePad } from '../components/DicePad'
import { ActionIcon, DieIcon } from '../components/icons'
import { useSettings } from '../settings/context'
import { ACTION_LABEL } from '../creation/effects'
import type { FormDice } from '../play/forms'
import { RollDialog, type FollowUpMod, type TargetChoice } from '../play/RollDialog'
import type { RollRecord } from '../play/roll'
import { gmTable, targetOptions } from './target-options'
import { DiePicker } from '../components/DiePicker'
import { Modal } from '../components/Modal'
import { PLAY_ZONE_LABEL } from '../hero/labels'
import type { BasicAction, Die } from '../rules/types'
import { ASPECT_COUNT, type EnvironmentAspect, type EnvironmentTwist } from '../template/model'
import { aspectName, attachedChallengeCount, attachedGroup, twistTitle, type EnvironmentRoll } from './environment'
import { MAX_GROUP_SIZE, sceneOnTable, type ActorRef, type AttachedOnTable, type EnvironmentOnTable, type Game, type TableTwist } from './model'
import { boxLabel, itemName, roundOver, sameActor, sceneZone, waiting, type ItemRef } from './table'
import { MenuButton } from './TableCenter'

export interface EnvironmentActions {
  /** Rolls the environment dice, or takes the numbers entered from physical dice; undefined without three aspects. */
  roll: (entered?: readonly number[]) => EnvironmentRoll | undefined
  setTwistUsed: (twistId: string, used: boolean) => void
  resetTwists: () => void
  setAspects: (aspects: EnvironmentAspect[]) => void
  addAttached: (index: number, count: number) => void
  /** Quick-adds a challenge owned by the environment. */
  quickChallenge: () => void
  run: (ref: ItemRef) => void
  handOff: (to: ActorRef) => void
  /** A basic action with the environment dice, confirmed in the roll dialog: its results, and who they go to. */
  basicAction: (record: RollRecord, followUps: readonly FollowUpMod[], choices: readonly TargetChoice[]) => void
}

const BASIC: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
/** The roll dialog's dice for the environment: no powers or qualities, only its fixed pool. */
const NO_TRAITS: FormDice = { powers: [], qualities: [], slots: ['power', 'quality'], cannot: [], known: [] }

const ZONES: readonly EnvironmentTwist['zone'][] = ['green', 'yellow', 'red']
const ZONE_WORD: Record<EnvironmentTwist['zone'], string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/** The aspects: three names and dice, set together. */
function AspectsDialog({ aspects, onSave, onClose }: { aspects: readonly EnvironmentAspect[]; onSave: (aspects: EnvironmentAspect[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<EnvironmentAspect[]>(() => Array.from({ length: ASPECT_COUNT }, (_, i) => ({ name: aspects[i]?.name ?? '', die: aspects[i]?.die ?? ('d8' as Die) })))
  const id = useId()
  return (
    <Modal title="Aspects" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
          onClose()
        }}
      >
        <p className="hint">Three aspects, each with a die: the environment dice.</p>
        {draft.map((a, i) => (
          <div key={i} className="template-aspect">
            <label className="field" htmlFor={`${id}-${i}`}>
              <span>Aspect {i + 1}</span>
              <input id={`${id}-${i}`} type="text" value={a.name} onChange={(e) => setDraft((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </label>
            <DiePicker label={`Aspect ${i + 1} die`} value={a.die} onChange={(die) => setDraft((all) => all.map((x, j) => (j === i ? { ...x, die } : x)))} />
          </div>
        ))}
        <div className="button-row">
          <button type="submit" className="button button--primary">
            Save aspects
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Twists by zone: a tab per zone, opening on the scene's zone. */
function Twists({ twists, zone, onUsed }: { twists: readonly TableTwist[]; zone: EnvironmentTwist['zone']; onUsed: (id: string, used: boolean) => void }) {
  const id = useId()
  const [tab, setTab] = useState(zone)
  // A new zone (the tracker moved) opens its tab.
  const [seenZone, setSeenZone] = useState(zone)
  if (zone !== seenZone) {
    setSeenZone(zone)
    setTab(zone)
  }
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + ZONES.length) % ZONES.length
    setTab(ZONES[next]!)
    tabs.current[next]?.focus()
  }
  const shown = twists.filter((t) => t.zone === tab).sort((a, b) => Number(a.kind === 'major') - Number(b.kind === 'major'))
  return (
    <div className="gt-env-twists">
      <div className="gt-row">
        <span className="gt-label gt-grow">Twists</span>
        <div className="gt-tabs" role="tablist" aria-label="Twists by zone">
          {ZONES.map((z, i) => (
            <button
              key={z}
              ref={(el) => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${id}-${z}`}
              aria-controls={`${id}-panel`}
              aria-selected={tab === z}
              tabIndex={tab === z ? 0 : -1}
              className={tab === z ? 'gt-tabs__on' : undefined}
              onClick={() => setTab(z)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {ZONE_WORD[z].toUpperCase()}
              {z === zone && ' · NOW'}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {shown.length === 0 ? (
          <p className="gt-sub">No {ZONE_WORD[tab].toLowerCase()} twists.</p>
        ) : (
          <ul className="gt-env-list">
            {shown.map((t) => (
              <li key={t.id} className={t.used ? 'gt-env-twist gt-env-twist--used' : 'gt-env-twist'}>
                <span className={t.kind === 'major' ? 'gt-env-kind gt-env-kind--major' : 'gt-env-kind'}>{t.kind === 'major' ? 'MAJOR' : 'MINOR'}</span>
                <span className="gt-grow">
                  {t.name?.trim() && <strong>{t.name.trim()}. </strong>}
                  {t.text}
                  {t.used && <span className="gt-sub"> · Used in round {t.used.round}</span>}
                </span>
                <button type="button" className="button button--small" aria-pressed={Boolean(t.used)} aria-label={`${t.used ? 'Used' : 'Mark used'}: ${twistTitle(t)}`} onClick={() => onUsed(t.id, !t.used)}>
                  {t.used ? 'Used' : 'Mark used'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** How many of an attached template to add: − and +, from 1 to the most a group holds. */
function Stepper({ value, name, onChange }: { value: number; name: string; onChange: (n: number) => void }) {
  return (
    <span className="gt-stepper">
      <button type="button" aria-label={`Fewer ${name} to add`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-label={`How many ${name} to add`}>{value}</output>
      <button type="button" aria-label={`More ${name} to add`} disabled={value >= MAX_GROUP_SIZE} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  )
}

const startCount = (a: AttachedOnTable) => (a.kind === 'challenge' ? 1 : a.groupSize)

export function RunningEnvironment({ game, env, actions, sheets, random }: { game: Game; env: EnvironmentOnTable; actions: EnvironmentActions; sheets: boolean; random?: () => number }) {
  const physical = useSettings().settings.rolling === 'physical'
  const [entering, setEntering] = useState(false)
  const [rolled, setRolled] = useState<EnvironmentRoll | null>(null)
  const [settingAspects, setSettingAspects] = useState(false)
  const [acting, setActing] = useState<BasicAction | null>(null)
  const attached = env.attached ?? []
  const [counts, setCounts] = useState<number[]>(() => attached.map(startCount))
  const aspects = env.aspects ?? []
  const zone = sceneZone({ scene: sceneOnTable(game) })
  const me: ActorRef = { kind: 'environment', id: env.id }
  const itsTurn = sameActor(game.turn.current, me)
  const groups = game.groups.filter((g) => g.owner.kind === 'environment')
  const handItems = waiting(game).map((ref) => ({ label: itemName(game, ref), onSelect: () => actions.handOff(ref) }))
  return (
    <div className="gt-env">
      <p className="gt-sub">
        Environment · the scene is {PLAY_ZONE_LABEL[zone]}
        {itsTurn && ` · the tracker just moved to ${boxLabel(sceneOnTable(game).tracker, sceneOnTable(game).position)}`}
      </p>
      <div className="gt-row">
        <span className="gt-grow" />
        <MenuButton
          label={`More for ${env.name}`}
          items={[
            { label: aspects.length ? 'Change aspects…' : 'Set aspects…', onSelect: () => setSettingAspects(true) },
            { label: 'Reset twists', onSelect: actions.resetTwists },
          ]}
          sheets={sheets}
        />
      </div>

      {entering && (
        <Modal title="Environment dice" onClose={() => setEntering(false)}>
          <DicePad
            dice={aspects.map((a, i) => ({ die: a.die, label: aspectName(a, i) }))}
            onCancel={() => setEntering(false)}
            onRollForMe={() => {
              setEntering(false)
              setRolled(actions.roll() ?? null)
            }}
            onAccept={(values) => {
              setEntering(false)
              setRolled(actions.roll(values) ?? null)
            }}
          />
        </Modal>
      )}
      <section className="gt-env-dice" aria-label="Environment dice">
        <div className="gt-row">
          <span className="gt-label gt-grow">Environment dice</span>
          <button type="button" className="button button--small" disabled={aspects.length !== ASPECT_COUNT} onClick={() => (physical ? setEntering(true) : setRolled(actions.roll() ?? null))}>
            Roll environment dice
          </button>
        </div>
        {aspects.length === 0 ? (
          <p className="gt-sub">
            No aspects yet.{' '}
            <button type="button" className="button button--quiet button--small" onClick={() => setSettingAspects(true)}>
              Set aspects…
            </button>
          </p>
        ) : (
          <ul className="gt-env-list">
            {aspects.map((a, i) => (
              <li key={i} className="gt-row">
                <DieIcon die={a.die} />
                <span>{aspectName(a, i)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="gt-row" role="group" aria-label="Basic action with these dice">
          <span className="gt-sub">Basic action with these dice:</span>
          {BASIC.map((a) => (
            <button key={a} type="button" className="button button--small" disabled={aspects.length !== ASPECT_COUNT} aria-label={`${ACTION_LABEL[a]} with the environment dice`} onClick={() => setActing(a)}>
              <ActionIcon action={a} decorative />
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
        <div role="status" aria-label="Environment roll">
          {rolled && (
            <div className="gt-env-roll">
              {(['min', 'mid', 'max'] as const).map((k) => (
                <div key={k} className="gt-env-roll__card">
                  <div className="gt-label">{k === 'min' ? 'Min' : k === 'mid' ? 'Mid' : 'Max'}</div>
                  <div className="gt-total">{rolled[k].value}</div>
                  <div className="gt-sub">{rolled[k].aspect}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Twists twists={env.twists ?? []} zone={zone} onUsed={actions.setTwistUsed} />

      <section aria-label="Its minions, lieutenants and challenges">
        <div className="gt-label">Its minions, lieutenants and challenges</div>
        {attached.length === 0 && groups.length === 0 && <p className="gt-sub">None attached.</p>}
        <ul className="gt-env-list">
          {attached.map((a, i) => {
            if (a.kind === 'challenge') {
              const onTable = attachedChallengeCount(game, a.templateId)
              return (
                <li key={`${a.kind}:${a.templateId}`} className="gt-row">
                  <span className="gt-grow">
                    <strong>{a.name}</strong>{' '}
                    <span className="gt-sub">
                      challenge · {onTable ? `${onTable} on the table` : 'none yet'}
                    </span>
                  </span>
                  <button type="button" className="button button--small" aria-label={`Add ${a.name}`} onClick={() => actions.addAttached(i, 1)}>
                    Add
                  </button>
                </li>
              )
            }
            const onTable = attachedGroup(game, a)?.members.length ?? 0
            const count = counts[i] ?? a.groupSize
            return (
              <li key={`${a.kind}:${a.templateId}`} className="gt-row">
                <DieIcon die={a.die} />
                <span className="gt-grow">
                  <strong>{a.name}</strong>{' '}
                  <span className="gt-sub">
                    {a.kind === 'minion' ? 'minions' : 'lieutenants'} · {onTable ? `${onTable} on the table` : 'none yet'}
                  </span>
                </span>
                <Stepper value={count} name={a.name} onChange={(n) => setCounts((all) => attached.map((x, j) => (j === i ? n : (all[j] ?? startCount(x)))))} />
                <button type="button" className="button button--small" aria-label={`Add ${a.name}`} disabled={onTable >= MAX_GROUP_SIZE} onClick={() => actions.addAttached(i, count)}>
                  Add
                </button>
              </li>
            )
          })}
        </ul>
        <div className="button-row">
          <button type="button" className="button button--small" onClick={actions.quickChallenge}>
            + Challenge
          </button>
        </div>
        {groups.length > 0 && (
          <ul className="gt-env-list" aria-label={`${env.name}'s groups on the table`}>
            {groups.map((g) => (
              <li key={g.id} className="gt-row">
                <span className="gt-grow">
                  {g.name} <span className="gt-sub">· {g.members.length} {g.kind === 'minions' ? 'minions' : 'lieutenants'}</span>
                </span>
                <button type="button" className="button button--small" aria-label={`Run ${g.name}`} onClick={() => actions.run({ kind: 'group', id: g.id })}>
                  Run
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">Added straight to the table, revealed, acting on the environment's turn.</p>
      </section>

      {itsTurn && (
        <div className="gt-row">
          <span className="gt-grow" />
          {roundOver(game) ? <p className="gt-sub">Everyone has acted: start the next round from the turn order.</p> : <MenuButton label="Hand off to" text={`Hand off for ${env.name}`} items={handItems} sheets={sheets} />}
        </div>
      )}
      {acting && (
        <RollDialog
          subject={{ kind: 'basic', action: acting }}
          dice={NO_TRAITS}
          zone={undefined}
          mods={[]}
          fixedPool={aspects.map((a, i) => ({ label: aspectName(a, i), die: a.die }))}
          targetsFor={(effect, opts) => targetOptions({ kind: 'environment' }, effect, gmTable(game), opts)}
          onClose={() => setActing(null)}
          onConfirm={(record, followUps, _form, _made, choices = []) => actions.basicAction(record, followUps, choices)}
          random={random}
        />
      )}
      {settingAspects && (
        <AspectsDialog
          aspects={aspects}
          onSave={(next) => {
            actions.setAspects(next)
            // A roll of the old aspects no longer applies.
            setRolled(null)
          }}
          onClose={() => setSettingAspects(false)}
        />
      )}
    </div>
  )
}
