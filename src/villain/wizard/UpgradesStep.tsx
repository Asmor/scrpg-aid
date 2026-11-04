/**
 * Villain wizard step 4, Upgrades (p. 235–238; the villain wizard spec, sections 3 and 5): a
 * totals bar, then each upgrade as a checkbox row with its Health, requirement and abilities.
 * A checked upgrade opens a well for whatever it needs: blanks in its abilities, the dice Power
 * Upgrade and Quality Upgrade raise (with abilities for dice already at d12), and the vehicle.
 */
import { useId } from 'react'
import { abilityListField } from '../../creation/abilities'
import { ROLEPLAYING_QUALITY } from '../../creation/traits'
import { AbilityChooser } from '../../editor/AbilityPicker'
import { IssueField, SectionIssues } from '../../editor/inline-issues'
import { AbilityText, DieIcon } from '../../components/icons'
import { effectActions } from '../../creation/effects'
import { ABILITY_TYPE_LABEL } from '../../hero/labels'
import { parseSlots } from '../../rules/slots'
import { villainApproachesById, villainArchetypesById, villainUpgrades } from '../../rules/villain-data'
import type { VillainUpgrade } from '../../rules/villain-types'
import { villainDisplayName, type UpgradeChoice, type Villain, type VillainAbilityPick } from '../model'
import { isMajorVillain, knownUpgrades, upgradeField, VEHICLE_DIE_FIELD, villainTraitLabel, villainTraits, type DiceUpgrade } from '../sheet'
import { chosenCount, villainFilling, withPicks, type StepProps, type VillainUpdate } from './choices'
import { Section } from './shared'

const healthTag = (u: VillainUpgrade) => (u.health ? `+${u.health} Health` : 'No Health')

/** Changes one upgrade's choice. */
const changeUpgrade = (update: VillainUpdate, id: string, change: (c: UpgradeChoice) => void) =>
  update((v) => {
    const c = v.upgrades.find((x) => x.id === id)
    if (c) change(c)
  })

/** Power Upgrade's or Quality Upgrade's well: each die before and after, and abilities for dice already at d12. */
function DiceWell({ villain, update, upgrade, dice }: { villain: Villain; update: VillainUpdate; upgrade: VillainUpgrade; dice: DiceUpgrade }) {
  const choice = villain.upgrades.find((u) => u.id === upgrade.id)!
  const main = dice.list === 'approach' ? villain.approach && villainApproachesById.get(villain.approach.id) : villain.archetype && villainArchetypesById.get(villain.archetype.id)
  const taken = (dice.list === 'approach' ? villain.approach : villain.archetype)?.abilities ?? []
  const picks = (choice.extra ?? []).filter((p) => p.source === dice.list)
  const kind = upgrade.effect?.targets.includes('quality') ? 'quality' : 'power'
  return (
    <>
      {dice.changes.length ? (
        <ul className="vw-dice-changes" aria-label={`${upgrade.name} dice`}>
          {dice.changes.map((c) => (
            <li key={`${c.trait.kind}:${c.trait.id}`}>
              <span>{c.name}</span> <DieIcon die={c.from} /> <span aria-hidden="true">→</span>
              <span className="visually-hidden">to</span> <DieIcon die={c.to} />
              {c.overflow && <span className="hint"> (already the largest)</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Assign the approach's {kind === 'power' ? 'power' : 'quality'} dice in step 2 to see what this raises.</p>
      )}
      {kind === 'quality' && villain.approach && <p className="hint">{villainTraitLabel(villain, ROLEPLAYING_QUALITY)} stays d8: the roleplaying quality never changes.</p>}
      {dice.extra === 0 ? (
        <p className="hint">
          None was already d12, so there's no extra ability. A {kind} already at d12 stays d12 and gives one more {main?.name ?? dice.list} ability, picked here.
        </p>
      ) : main ? (
        <AbilityChooser<VillainAbilityPick>
          filling={villainFilling(villain)}
          legend={`Extra ${main.name} abilities: ${chosenCount(dice.extra, picks.length)}`}
          hint={`${dice.extra === 1 ? 'One die was' : `${dice.extra} dice were`} already d12, so ${upgrade.name} gives ${dice.extra === 1 ? 'another ability' : `${dice.extra} more abilities`} from ${main.name}'s list.`}
          options={main.abilities.options.filter((a) => !taken.some((p) => p.name === a.name) || picks.some((p) => p.name === a.name))}
          source={dice.list}
          picks={picks}
          listField={abilityListField(upgradeField(upgrade.id, 'extra'))}
          onChange={(next) => changeUpgrade(update, upgrade.id, (c) => (c.extra = withPicks(c.extra ?? [], dice.list, next)))}
        />
      ) : (
        <p className="hint">Choose the {dice.list} first: the extra abilities come from its list.</p>
      )}
    </>
  )
}

/** Villainous Vehicle's well: the vehicle built as a lieutenant, its name, die and abilities. */
function VehicleWell({ villain, update, upgrade }: { villain: Villain; update: VillainUpdate; upgrade: VillainUpgrade }) {
  const nameId = useId()
  const choice = villain.upgrades.find((u) => u.id === upgrade.id)!
  const vehicle = choice.vehicle ?? { abilities: [] }
  const option = upgrade.lieutenantOptions?.find((o) => o.die === vehicle.die)
  const setVehicle = (change: (v: NonNullable<UpgradeChoice['vehicle']>) => void) =>
    changeUpgrade(update, upgrade.id, (c) => {
      c.vehicle = structuredClone(c.vehicle ?? { abilities: [] })
      change(c.vehicle)
    })
  return (
    <>
      <p className="vw-well__title">Build the vehicle as a lieutenant</p>
      <label className="field" htmlFor={nameId}>
        <span>Name</span>
        <input id={nameId} type="text" value={vehicle.name ?? ''} placeholder={`${villainDisplayName(villain)}'s vehicle`} onChange={(e) => setVehicle((v) => (v.name = e.target.value))} />
      </label>
      <IssueField field={VEHICLE_DIE_FIELD}>
        {(f) => (
          <div className="vw-well__row">
            <span id={`${nameId}-die`}>Die</span>
            <div className="segmented" role="group" aria-labelledby={`${nameId}-die`} {...f.control}>
              {upgrade.lieutenantOptions?.map((o) => (
                <button key={o.die} type="button" aria-pressed={vehicle.die === o.die} onClick={() => setVehicle((v) => (v.die = o.die))}>
                  <DieIcon die={o.die} size="compact" /> {o.abilityCount} abilities
                </button>
              ))}
            </div>
            {f.list}
          </div>
        )}
      </IssueField>
      {option && upgrade.vehicleAbilities && (
        <AbilityChooser<VillainAbilityPick>
          filling={villainFilling(villain)}
          legend={`Vehicle abilities: ${chosenCount(option.abilityCount, vehicle.abilities.length)}`}
          options={upgrade.vehicleAbilities}
          source="vehicle"
          picks={vehicle.abilities}
          nameable={false}
          onChange={(next) => setVehicle((v) => (v.abilities = next))}
        />
      )}
    </>
  )
}

function UpgradeRow({ villain, update, upgrade, onUncheck, dice }: { villain: Villain; update: VillainUpdate; upgrade: VillainUpgrade; onUncheck: () => void; dice: DiceUpgrade | undefined }) {
  const choice = villain.upgrades.find((u) => u.id === upgrade.id)
  const withBlanks = (upgrade.abilities ?? []).some((a) => parseSlots(a.text).length > 0)
  return (
    <div className={choice ? 'vw-upgrade vw-upgrade--on' : 'vw-upgrade'}>
      <label className="vw-upgrade__head">
        <input
          type="checkbox"
          checked={Boolean(choice)}
          onChange={(e) => {
            if (e.target.checked) update((v) => void v.upgrades.push({ id: upgrade.id, abilities: [] }))
            else onUncheck()
          }}
        />
        <span className="vw-upgrade__name">{upgrade.name}</span>
        <span className="tag">{healthTag(upgrade)}</span>
        <span className="page-ref">p. {upgrade.page}</span>
      </label>
      <p className="vw-upgrade__req">{upgrade.requirement}</p>
      {!choice && upgrade.summary && <p className="hint">{upgrade.summary}</p>}
      {(upgrade.abilities ?? []).map((a) => (
        <p key={a.name} className="vw-upgrade__ability">
          <strong>{a.name}</strong> <span className="tag">{ABILITY_TYPE_LABEL[a.type]}</span> <AbilityText text={a.text} actions={a.effects && effectActions(a.effects)} />
        </p>
      ))}
      {choice && (withBlanks || dice || upgrade.lieutenantOptions) && (
        <div className="vw-well">
          {withBlanks && (
            <AbilityChooser<VillainAbilityPick>
              filling={villainFilling(villain)}
              legend={`${upgrade.name} gives`}
              options={upgrade.abilities ?? []}
              source="upgrade"
              picks={choice.abilities.filter((p) => p.source === 'upgrade')}
              fixed
              onChange={(next) => changeUpgrade(update, upgrade.id, (c) => (c.abilities = withPicks(c.abilities, 'upgrade', next)))}
            />
          )}
          {dice && <DiceWell villain={villain} update={update} upgrade={upgrade} dice={dice} />}
          {upgrade.lieutenantOptions && <VehicleWell villain={villain} update={update} upgrade={upgrade} />}
        </div>
      )}
    </div>
  )
}

export function UpgradesStep({ villain, update, confirm }: StepProps) {
  const taken = knownUpgrades(villain)
  const major = isMajorVillain(villain)
  const health = taken.reduce((sum, u) => sum + u.health, 0)
  const diceUpgrades = villainTraits(villain).upgrades
  /** Unchecking: the last upgrade with a mastery chosen asks first, since the mastery goes too. */
  const uncheck = (upgrade: VillainUpgrade) => {
    const remove = (v: Villain) => {
      v.upgrades = v.upgrades.filter((c) => c.id !== upgrade.id)
      if (!v.upgrades.length) v.mastery = null
    }
    const last = villain.upgrades.every((c) => c.id === upgrade.id)
    if (last && villain.mastery) {
      confirm({
        title: 'Remove the last upgrade?',
        body: `${villainDisplayName(villain)} becomes a minor villain and loses ${villain.mastery.name}.`,
        confirm: 'Remove it',
        onConfirm: () => update(remove),
      })
    } else {
      update(remove)
    }
  }
  return (
    <div className="step-form">
      <div className="vw-tally" aria-label="Totals" role="group">
        <span>
          <b>{taken.length}</b> <span className="hint">{taken.length === 1 ? 'upgrade' : 'upgrades'}</span>
        </span>
        <span>
          <b>+{health}</b> <span className="hint">Health</span>
        </span>
        <span className={major ? 'type-chip type-chip--major' : 'type-chip'}>{major ? 'Major villain' : 'Minor villain'}</span>
        <span className="hint">{major ? 'Choose a mastery next.' : 'No mastery needed.'}</span>
      </div>
      <Section title="Choose upgrades" section="choose">
        <SectionIssues section="choose" />
        <div className="vw-upgrades">
          {villainUpgrades.map((u) => (
            <UpgradeRow key={u.id} villain={villain} update={update} upgrade={u} dice={diceUpgrades.find((d) => d.upgradeId === u.id)} onUncheck={() => uncheck(u)} />
          ))}
        </div>
      </Section>
    </div>
  )
}
