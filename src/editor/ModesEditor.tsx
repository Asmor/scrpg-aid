/**
 * Modular's modes (p. 96–98), recorded on the auxiliary sheet: one more Green mode, two
 * Yellow modes, and one Red mode beyond the default, plus the optional Powerless mode. Each
 * mode picks default-mode powers, adjusts their dice, and grants its ability. The checks in
 * ../creation/modular.ts warn about anything that doesn't fit.
 */
import { useId } from 'react'
import { getTrait, parseTraitKey, traitKey } from '../rules/catalog'
import type { Archetype, Die, ModularMode, Zone } from '../rules/types'
import type { Hero, ModeChoice, ModularChoice } from '../hero/model'
import { modeLimits } from '../creation/format'
import { describeAdjustment, findMode, modeDieOptions, modeSlots, modeTraits, setModeSlot, strayModes } from '../creation/modular'
import { traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { DiceAssigner } from './DiceAssigner'
import { DiceText } from '../components/icons'
import { SectionIssues } from './inline-issues'

const ZONE_NAME: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

interface PowerRowProps {
  hero: Hero
  label: string
  powers: readonly HeroTrait[]
  mode: ModularMode | undefined
  value: ModeChoice['powers'][number] | undefined
  /** Until the rows before it are filled. */
  disabled: boolean
  onChange: (value: ModeChoice['powers'][number] | undefined) => void
}

/** One power a mode uses: which default-mode power, and the die the mode gives it. */
function PowerRow({ hero, label, powers, mode, value, disabled, onChange }: PowerRowProps) {
  const id = useId()
  const from = value && powers.find((p) => traitKey(p.trait) === traitKey(value.trait))?.die
  const dice = mode && from ? modeDieOptions(mode, from) : []
  const offList = value && !from
  return (
    <div className="mode-card__power">
      <label className="field" htmlFor={`${id}-power`}>
        <span>{label}</span>
        <select
          id={`${id}-power`}
          disabled={disabled}
          value={value ? traitKey(value.trait) : ''}
          onChange={(e) => {
            if (!e.target.value) return onChange(undefined)
            const trait = parseTraitKey(e.target.value)
            const die = powers.find((p) => traitKey(p.trait) === e.target.value)!.die
            const options = mode ? modeDieOptions(mode, die) : [die]
            // Start with the same die if the mode allows it, otherwise the first it allows.
            onChange({ trait, die: options.includes(die) ? die : (options[0] ?? die) })
          }}
        >
          <option value="">Choose…</option>
          {offList && <option value={traitKey(value.trait)}>{traitLabel(hero, value.trait)} (not a default-mode power)</option>}
          {powers.map((p) => (
            <option key={traitKey(p.trait)} value={traitKey(p.trait)}>
              {p.name} ({p.die})
            </option>
          ))}
        </select>
      </label>
      {value && (
        <label className="field" htmlFor={`${id}-die`}>
          <span>Die in this mode</span>
          <select id={`${id}-die`} value={value.die} onChange={(e) => onChange({ ...value, die: e.target.value as Die })}>
            {!dice.includes(value.die) && <option value={value.die}>{value.die} (doesn't fit)</option>}
            {dice.map((d) => (
              <option key={d} value={d}>
                {from ? `${from} → ${d}` : d}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

interface ModeCardProps {
  hero: Hero
  traits: readonly HeroTrait[]
  zone: Zone
  options: readonly ModularMode[]
  /** The mode as recorded; undefined for an empty slot. */
  mode: ModeChoice | undefined
  label: string
  /** Modes recorded in other slots: each mode must be different (the user's ruling). */
  taken: readonly string[]
  onChange: (mode: ModeChoice | undefined) => void
  /** Only for modes beyond the number the zone asks for, or unknown ones. */
  onRemove?: () => void
}

function ModeCard({ hero, traits, zone, options, mode, label, taken, onChange, onRemove }: ModeCardProps) {
  const id = useId()
  const entry = mode && findMode(hero, mode.id)?.mode
  const powers = traits.filter((t) => t.trait.kind === 'power')
  const title = mode?.name?.trim() || entry?.name || label
  const rows = Math.max(entry?.pickPowers ?? 0, mode?.powers.length ?? 0)
  const setPower = (i: number, value: ModeChoice['powers'][number] | undefined) => {
    const list = [...mode!.powers]
    if (value) list[i] = value
    else list.splice(i, 1)
    onChange({ ...mode!, powers: list })
  }
  return (
    <fieldset className="mode-card">
      <legend>{title}</legend>
      <label className="field" htmlFor={`${id}-mode`}>
        <span>{ZONE_NAME[zone]} mode</span>
        <select
          id={`${id}-mode`}
          value={mode?.id ?? ''}
          onChange={(e) => {
            const next = options.find((m) => m.id === e.target.value)
            if (!next) return onChange(undefined)
            // Keep the powers and name when switching (the checks flag what doesn't fit), but
            // record the new mode's ability: one with no blanks has nothing else to save it.
            const kept = mode?.ability?.name === next.ability.name ? mode.ability : { source: 'archetype.mode' as const, name: next.ability.name }
            onChange({ powers: [], ...mode, id: next.id, ability: kept })
          }}
        >
          <option value="">Choose…</option>
          {mode && !entry && <option value={mode.id}>{mode.id} (unknown mode)</option>}
          {options
            .filter((m) => m.id === mode?.id || !taken.includes(m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      {mode && entry && (
        <>
          <p className="hint">
            {describeAdjustment(entry)} {modeLimits(entry.cannot, Boolean(entry.immobile))}
          </p>
          <label className="field" htmlFor={`${id}-name`}>
            <span>Mode name (optional)</span>
            <input
              id={`${id}-name`}
              type="text"
              value={mode.name ?? ''}
              onChange={(e) => {
                const { name: _, ...rest } = mode
                onChange(e.target.value ? { ...rest, name: e.target.value } : rest)
              }}
            />
          </label>
          {Array.from({ length: rows }, (_, i) => (
            <PowerRow
              key={i}
              hero={hero}
              label={`Power ${i + 1}`}
              powers={powers.filter((p) => !mode.powers.some((a, j) => j !== i && traitKey(a.trait) === traitKey(p.trait)))}
              mode={entry}
              value={mode.powers[i]}
              disabled={i > mode.powers.length}
              onChange={(value) => setPower(i, value)}
            />
          ))}
          <AbilityPicker
            hero={hero}
            traits={modeTraits(hero, traits, mode.powers)}
            legend={`${title} ability`}
            options={[entry.ability]}
            source="archetype.mode"
            step="archetype"
            picks={mode.ability ? [mode.ability] : []}
            onChange={(picks) => {
              const { ability: _, ...rest } = mode
              const ability = picks.at(-1)
              onChange(ability ? { ...rest, ability } : rest)
            }}
            fixed
          />
        </>
      )}
      {onRemove && (
        <button type="button" className="button" aria-label={`Remove ${title}`} onClick={onRemove}>
          Remove this mode
        </button>
      )}
    </fieldset>
  )
}

/**
 * The modes and the Powerless mode, or with `part` ("mode:yellow:1", "powerless", from
 * ../hero/archetype-parts.ts) just that one. A color's last part also shows any extra modes of
 * that color, and the first part modes that match no list, so they can be removed.
 */
export function ModesEditor({ hero, ar, traits, modular, onChange, part }: { hero: Hero; ar: Archetype; traits: readonly HeroTrait[]; modular: ModularChoice | undefined; onChange: (modular: ModularChoice) => void; part?: string }) {
  const spec = ar.modes!
  const modes = modular?.modes ?? []
  const set = (next: Partial<ModularChoice>) => onChange({ modes, ...(modular?.powerless ? { powerless: modular.powerless } : {}), ...next })
  const defaultPowers = traits.filter((t) => t.trait.kind === 'power')
  const [, partZone, partIndex] = part?.split(':') ?? []
  const shows = (zone: string, i: number, count: number) => !part || (zone === partZone && (i === Number(partIndex) || (i >= count && Number(partIndex) === count - 1)))
  const first = !part || part === 'mode:green:0'
  return (
    <div className="modes-editor" data-section="parts">
      {!part && <h4>Modes</h4>}
      <SectionIssues section="parts" />
      {first && (
        <p className="hint">
          <DiceText text={`${spec.summary} Your default ${ZONE_NAME[spec.default.zone]} mode: ${spec.default.summary}`} />
        </p>
      )}
      {(['green', 'yellow', 'red'] as const).map((zone) =>
        modeSlots(hero, modes, zone, spec[zone].count).map((slot, i) => !shows(zone, i, spec[zone].count) ? null : (
          <ModeCard
            key={`${zone}-${i}`}
            hero={hero}
            traits={traits}
            zone={zone}
            options={spec[zone].options}
            mode={slot.mode}
            label={`${ZONE_NAME[zone]} mode ${i + 1}`}
            taken={modes.map((m) => m.id)}
            onChange={(next) => set({ modes: setModeSlot(modes, slot, next) })}
            onRemove={i >= spec[zone].count ? () => set({ modes: setModeSlot(modes, slot, undefined) }) : undefined}
          />
        )),
      )}
      {first && strayModes(hero, modes).map(({ mode, index }) => (
        <ModeCard
          key={`stray-${index}`}
          hero={hero}
          traits={traits}
          zone="green"
          options={[]}
          mode={mode}
          label={mode.id}
          taken={[]}
          onChange={(next) => set({ modes: setModeSlot(modes, { index }, next) })}
          onRemove={() => set({ modes: setModeSlot(modes, { index }, undefined) })}
        />
      ))}

      {(!part || part === 'powerless') && (
      <fieldset className="mode-card">
        <legend>Powerless mode</legend>
        <p className="hint">
          <DiceText text={spec.powerless.summary} />
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(modular?.powerless)}
            onChange={(e) => {
              if (e.target.checked) set({ powerless: [] })
              else onChange({ modes })
            }}
          />
          Take a Powerless mode
        </label>
        {modular?.powerless && (
          <DiceAssigner
            label={(t) => traitLabel(hero, t)}
            legend="Powerless mode powers"
            dice={spec.powerless.dice}
            assignments={modular.powerless}
            options={defaultPowers.flatMap((t) => getTrait(t.trait) ?? [])}
            earlier={[]}
            onChange={(powerless) => set({ powerless })}
          />
        )}
      </fieldset>
      )}
    </div>
  )
}
