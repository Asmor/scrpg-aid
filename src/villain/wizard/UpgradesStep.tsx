/**
 * Villain wizard step 4, Upgrades (p. 235–238; the villain wizard spec, sections 3 and 5): a
 * totals bar, then each upgrade as a checkbox row with its Health, requirement and abilities.
 * A checked upgrade opens a well for whatever it needs: blanks in its abilities, the dice Power
 * Upgrade and Quality Upgrade raise (with abilities for dice already at d12), the vehicle (saved
 * as a lieutenant template when the GM leaves the step), and Mook Squad's signature minions.
 */
import { useEffect, useId, useState } from 'react'
import { useOptionalTemplateStores } from '../../app/template-store-context'
import { NewMinionDialog } from '../../template/TemplateEditor'
import type { LieutenantTemplate, MinionTemplate } from '../../template/model'
import { attachedAs, lieutenantLine, MOOK_SQUAD, minionLine, setAttached, vehicleFromTemplate, VILLAINOUS_VEHICLE } from '../attached'
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
import { SuggestBar, SuggestButton } from './SuggestBar'
import { suggestedView } from '../suggest'

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

const NEW = '__new'

/** Mook Squad's well: signature minions, a minion template from the library (optional), or a new one. */
function SignatureWell({ villain, update }: { villain: Villain; update: VillainUpdate }) {
  const id = useId()
  const stores = useOptionalTemplateStores()
  const [minions, setMinions] = useState<MinionTemplate[] | null>(null)
  const [making, setMaking] = useState(false)
  const chosen = attachedAs(villain, 'signature')?.templateId ?? ''
  useEffect(() => {
    if (!stores) return
    let current = true
    stores.minions.list().then(
      (r) => current && setMinions(r.docs),
      () => current && setMinions([]),
    )
    return () => {
      current = false
    }
  }, [stores])
  if (!stores) return null
  const name = villainDisplayName(villain)
  return (
    <>
      <label className="field" htmlFor={id}>
        <span>Signature minions</span>
        <select
          id={id}
          value={chosen}
          onChange={(e) => {
            if (e.target.value === NEW) setMaking(true)
            else update((v) => setAttached(v, 'signature', e.target.value || undefined))
          }}
        >
          <option value="">None chosen</option>
          {chosen && minions && !minions.some((m) => m.id === chosen) && <option value={chosen}>Missing template</option>}
          {(minions ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {minionLine(m)}
            </option>
          ))}
          <option value={NEW}>Make a new minion template…</option>
        </select>
      </label>
      <p className="hint">
        {chosen ? `Attached to ${name}. Bringing ${name} into a game offers to bring them too, one per hero.` : `Optional. Alert! works either way; with signature minions, bringing ${name} into a game offers to bring them too.`}
      </p>
      {making && (
        <NewMinionDialog
          tags={villain.tags}
          onClose={() => setMaking(false)}
          onSaved={(doc) => {
            setMaking(false)
            setMinions((list) => [...(list ?? []), doc])
            update((v) => setAttached(v, 'signature', doc.id))
          }}
        />
      )}
    </>
  )
}

/**
 * "Use a lieutenant from your library", while no vehicle is attached: the lieutenant templates,
 * the one last detached from this villain first, then the most recently changed. Choosing one
 * attaches it and fills in the build from it.
 */
function LibraryVehicle({ villain, update, upgrade }: { villain: Villain; update: VillainUpdate; upgrade: VillainUpgrade }) {
  const id = useId()
  const stores = useOptionalTemplateStores()
  const [lieutenants, setLieutenants] = useState<LieutenantTemplate[] | null>(null)
  useEffect(() => {
    if (!stores) return
    let current = true
    stores.lieutenants.list().then(
      (r) => current && setLieutenants(r.docs),
      () => current && setLieutenants([]),
    )
    return () => {
      current = false
    }
  }, [stores])
  if (!lieutenants?.length || attachedAs(villain, 'vehicle')) return null
  const first = villain.detachedVehicle
  const sorted = [...lieutenants].sort((a, b) => Number(b.id === first) - Number(a.id === first) || b.updatedAt.localeCompare(a.updatedAt))
  return (
    <label className="field" htmlFor={id}>
      <span>Use a lieutenant from your library</span>
      <select
        id={id}
        value=""
        onChange={(e) => {
          const t = lieutenants.find((l) => l.id === e.target.value)
          if (!t) return
          update((v) => {
            setAttached(v, 'vehicle', t.id)
            delete v.detachedVehicle
            const c = v.upgrades.find((u) => u.id === upgrade.id)
            if (c) c.vehicle = vehicleFromTemplate(t, upgrade)
          })
        }}
      >
        <option value="">Build a new one below</option>
        {sorted.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name.trim() || 'Unnamed lieutenant'} · {lieutenantLine(t)}
            {t.id === first ? ' (detached from this villain)' : ''}
          </option>
        ))}
      </select>
    </label>
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
      <p className="hint">Saved as a lieutenant template in your library and attached to {villainDisplayName(villain)}, like an environment's minions.</p>
      <LibraryVehicle villain={villain} update={update} upgrade={upgrade} />
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
      {choice && (withBlanks || dice || upgrade.lieutenantOptions || upgrade.id === MOOK_SQUAD) && (
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
          {upgrade.id === MOOK_SQUAD && <SignatureWell villain={villain} update={update} />}
        </div>
      )}
    </div>
  )
}

export function UpgradesStep({ villain, update, confirm, suggest }: StepProps) {
  const stores = useOptionalTemplateStores()
  const taken = knownUpgrades(villain)
  const major = isMajorVillain(villain)
  const health = taken.reduce((sum, u) => sum + u.health, 0)
  const diceUpgrades = villainTraits(villain).upgrades
  // Every checked upgrade stays visible while Suggest 3 is on.
  const checked = villain.upgrades.map((u) => u.id)
  /** Unchecking: the last upgrade with a mastery chosen asks first, since the mastery goes too. */
  const uncheck = (upgrade: VillainUpgrade) => {
    // Unchecking detaches what the upgrade built; the vehicle's template may be deleted too.
    const vehicleId = upgrade.id === VILLAINOUS_VEHICLE ? attachedAs(villain, 'vehicle')?.templateId : undefined
    const remove = (v: Villain) => {
      v.upgrades = v.upgrades.filter((c) => c.id !== upgrade.id)
      if (!v.upgrades.length) v.mastery = null
      if (upgrade.id === VILLAINOUS_VEHICLE) {
        setAttached(v, 'vehicle', undefined)
        // Offered first if the upgrade is checked again (unless it's deleted).
        if (vehicleId) v.detachedVehicle = vehicleId
      }
      if (upgrade.id === MOOK_SQUAD) setAttached(v, 'signature', undefined)
    }
    const askDelete = async () => {
      if (!vehicleId || !stores) return
      const found = await stores.lieutenants.get(vehicleId)
      if (found.status !== 'found') return
      confirm({
        title: 'Delete the vehicle too?',
        body: `Delete ${found.doc.name.trim() || 'the vehicle'} from your library as well?`,
        confirm: 'Delete',
        cancel: 'Keep',
        onConfirm: () => void stores.lieutenants.remove(vehicleId),
      })
    }
    const removeThenAsk = () => {
      update(remove)
      void askDelete()
    }
    const last = villain.upgrades.every((c) => c.id === upgrade.id)
    if (last && villain.mastery) {
      confirm({
        title: 'Remove the last upgrade?',
        body: `${villainDisplayName(villain)} becomes a minor villain and loses ${villain.mastery.name}.`,
        confirm: 'Remove it',
        onConfirm: removeThenAsk,
      })
    } else {
      removeThenAsk()
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
      <Section title="Choose upgrades" section="choose" aside={<SuggestButton step="upgrades" suggest={suggest} all={villainUpgrades} picked={checked} />}>
        <SuggestBar step="upgrades" suggest={suggest} all={villainUpgrades} picked={checked} />
        <SectionIssues section="choose" />
        <div className="vw-upgrades">
          {(suggest.ids('upgrades') ? suggestedView(villainUpgrades, suggest.ids('upgrades')!, checked).map((v) => v.item) : villainUpgrades).map((u) => (
            <UpgradeRow key={u.id} villain={villain} update={update} upgrade={u} dice={diceUpgrades.find((d) => d.upgradeId === u.id)} onUncheck={() => uncheck(u)} />
          ))}
        </div>
      </Section>
    </div>
  )
}
