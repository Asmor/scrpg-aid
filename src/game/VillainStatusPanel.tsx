/**
 * The Status section at the top of the Running panel (docs/design/villains-and-challenges/spec.md,
 * section 1): the die and its rule, Set by hand, and below that what drives it, by the rule's basis.
 */
import { useId } from 'react'
import { DieIcon } from '../components/icons'
import { DICE } from '../rules/dice'
import type { Die, Zone } from '../rules/types'
import { villainDisplayName } from '../villain/model'
import { villainHealth, villainZone } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import type { Challenge, Game, VillainInGame } from './model'
import { ZoneChip } from './TableCenter'
import { countLabel, linkedChallenge, statusLadder, statusRuleLine, tableCount, villainStatus } from './villain-status'

export interface VillainStatusActions {
  /** Sets or clears the villain's overrides. */
  setOverride: (override: { die?: Die; count?: number } | undefined) => void
  /** The GM's count for a villain the app can't count for. */
  setHandCount: (count: number) => void
  setWeakness: (tier: number, condition: string) => void
  /** Checks or unchecks a step of its challenge: the same challenge as on the table. */
  setStep: (challenge: Challenge, index: number, done: boolean) => void
}

const ZONES: readonly Zone[] = ['green', 'yellow', 'red']

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="gt-row">
      <span id={id} className="gt-grow">
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label="One fewer" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label="One more" onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

export function VillainStatusPanel({ game, copy, actions }: { game: Game; copy: VillainInGame; actions: VillainStatusActions }) {
  const id = useId()
  const status = villainStatus(copy, game)
  const rule = buildVillainSheet(copy.sheet).status
  if (!rule || !status) return null
  const name = villainDisplayName(copy.sheet)
  const manualDie = copy.statusOverride?.die
  const overridden = Boolean(copy.statusOverride)
  const counted = tableCount(copy, game)
  const count = status.count ?? 0
  const setCount = (n: number) => (counted ? actions.setOverride({ ...copy.statusOverride, count: n }) : actions.setHandCount(n))
  const zone = villainZone(villainHealth(copy.sheet, copy.play), copy.play)
  const challenge = rule.basis === 'challenge' ? linkedChallenge(copy.id, game) : undefined
  return (
    <section className="gt-status-panel" aria-labelledby={`${id}-head`}>
      <div className="gt-row">
        <h3 id={`${id}-head`} className="gt-grow gt-status-panel__head">
          Status die
        </h3>
        {overridden && (
          <button type="button" className="button button--small" onClick={() => actions.setOverride(undefined)}>
            Back to automatic
          </button>
        )}
      </div>
      <div className="gt-status-box">
        {status.die && <DieIcon die={status.die} size="large" />}
        <div className="gt-grow">
          <strong>{status.die ?? 'No status die'}</strong>
          <div className="gt-sub">{statusRuleLine(copy)}</div>
        </div>
        <label className="visually-hidden" htmlFor={`${id}-manual`}>
          Set the status die by hand
        </label>
        <select id={`${id}-manual`} value={manualDie ?? ''} onChange={(e) => actions.setOverride(e.target.value ? { ...copy.statusOverride, die: e.target.value as Die } : copy.statusOverride?.count !== undefined ? { count: copy.statusOverride.count } : undefined)}>
          <option value="">Set by hand…</option>
          {DICE.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {/* Set by hand wins, whatever the rule says. */}
      {!manualDie && rule.basis === 'count' && (
        <>
          <Stepper label={countLabel(copy)} value={count} onChange={setCount} />
          <p className="gt-sub">
            {!counted
              ? "The app can't see this, so you count. Kept until you change it."
              : copy.statusOverride?.count !== undefined
                ? `Counted by hand. The table says ${counted.count}.`
                : counted.parts.length
                  ? `Counted from the table: ${counted.parts.join(', ')} (revealed only). Change it to count by hand.`
                  : 'Counted from the table: nothing revealed yet. Change it to count by hand.'}
          </p>
          <ul className="gt-ladder" aria-label="Count to die">
            {statusLadder(rule.tiers, count).map((r) => (
              <li key={r.range} className={r.current ? 'gt-rung gt-rung--on' : 'gt-rung'} aria-current={r.current ? 'true' : undefined}>
                <span>{r.range}</span>
                <DieIcon die={r.die} />
              </li>
            ))}
          </ul>
        </>
      )}
      {!manualDie && rule.basis === 'healthZone' && (
        <>
          <ul className="gt-ladder" aria-label="Zone to die">
            {ZONES.map((z) => (
              <li key={z} className={z === zone ? 'gt-rung gt-rung--on' : 'gt-rung'} aria-current={z === zone ? 'true' : undefined}>
                <ZoneChip zone={z} />
                <DieIcon die={rule.zones[z]} />
              </li>
            ))}
          </ul>
          <p className="gt-sub">Follows {name}'s own Health zone. Damage changes it.</p>
        </>
      )}
      {!manualDie && rule.basis === 'weakness' && (
        <fieldset className="gt-weakness">
          <legend className="visually-hidden">{name}'s weakness</legend>
          {rule.tiers.map((t, i) => (
            <label key={t.condition} className="gt-weakness__row">
              <input type="radio" name={`${id}-weakness`} checked={(copy.play.weaknessTier ?? rule.tiers.length - 1) === i} onChange={() => actions.setWeakness(i, t.condition)} />
              <DieIcon die={t.die} />
              <span>{t.condition}</span>
            </label>
          ))}
        </fieldset>
      )}
      {!manualDie && rule.basis === 'challenge' && (
        <div className="gt-titan">
          {challenge ? (
            <>
              <div className="gt-row">
                <strong className="gt-grow">{challenge.name}</strong>
                <span className="gt-sub">On the table</span>
              </div>
              <TitanSteps challenge={challenge} actions={actions} />
            </>
          ) : (
            <p className="gt-sub">Its challenge isn't on the table.</p>
          )}
          <p className="gt-sub">
            Each completed part lowers the status one size, from {rule.startingDie}.
          </p>
        </div>
      )}
      {!manualDie && rule.basis === 'fixed' && (
        <p className="gt-sub">
          {buildVillainSheet(copy.sheet).archetype}: always {rule.die}. Nothing on the table changes it.
        </p>
      )}
    </section>
  )
}

function TitanSteps({ challenge, actions }: { challenge: Challenge; actions: VillainStatusActions }) {
  return (
    <ul className="gt-steps" aria-label="Steps">
      {challenge.steps.map((done, i) => (
        <li key={i} className="gt-row">
          <label className="gt-row">
            <input type="checkbox" checked={done} onChange={(e) => actions.setStep(challenge, i, e.target.checked)} />
            {challenge.labels?.[i] || `Step ${i + 1}`}
          </label>
        </li>
      ))}
    </ul>
  )
}
