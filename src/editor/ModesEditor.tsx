/**
 * Modular's modes (p. 96–98), recorded on the auxiliary sheet: one more Green mode, two
 * Yellow modes, and one Red mode beyond the default, plus the optional Powerless mode. Each
 * mode picks default-mode powers, adjusts their dice, and grants its ability. The checks in
 * ../creation/modular.ts warn about anything that doesn't fit.
 */
import { useId } from 'react'
import { getTrait, parseTraitKey, traitKey, type TraitRef } from '../rules/catalog'
import type { Archetype, Die, ModularMode, Zone } from '../rules/types'
import type { Hero, ModeChoice, ModularChoice } from '../hero/model'
import { modeLimits } from '../creation/format'
import { changeDie, changeLabel, changeNote, defaultModeDice, describeAdjustment, findMode, modeRowField, modeRows, modeSlots, modeTraits, setModeRow, setModeSlot, strayModes, type ModeChange, type ModeRow } from '../creation/modular'
import { traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { DiceAssigner } from './DiceAssigner'
import { DiceText, DieIcon } from '../components/icons'
import { IssueField, SectionIssues } from './inline-issues'

const ZONE_NAME: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

interface RecipeRowProps {
  label: string
  row: ModeRow
  /** The default mode's powers, with their dice. */
  powers: readonly HeroTrait[]
  /** Powers other rows use. */
  used: ReadonlySet<string>
  field: string
  onChange: (trait: TraitRef | undefined) => void
}

/** "Cosmic d6 → d8", with why a die stays put at the end of the range. */
function changeText(name: string, change: ModeChange, from: Die): string {
  const note = changeNote(change, from)
  return `${name} ${from} → ${changeDie(change, from)}${note ? ` (${note})` : ''}`
}

/**
 * One change in a mode's recipe, and the default-mode power it applies to. A power another
 * row uses is shown but can't be picked. A power saved under the old editor that doesn't fit
 * stays chosen, marked, until another is picked.
 */
function RecipeRow({ label, row, powers, used, field, onChange }: RecipeRowProps) {
  const id = useId()
  const current = row.power && powers.find((p) => traitKey(p.trait) === traitKey(row.power!.trait))
  const misfit = row.power && !row.fits
  // A fitting choice is shown over the closed select; an unfitting one keeps the select's own text.
  const shown = current && row.power && row.fits ? current : undefined
  return (
    <IssueField field={field}>
      {(f) => (
        <div className="recipe-row">
          <label htmlFor={id} className="recipe-row__change">
            {label}
          </label>
          {/* The closed select shows only the power and the change as dice (the hero wizard spec): the
              text the options need would be cut off in a narrow column. The list keeps the full text. */}
          <span className={shown ? 'recipe-row__control recipe-row__control--shown' : 'recipe-row__control'}>
            <select id={id} {...f.control} value={row.power ? (misfit ? MISFIT : traitKey(row.power.trait)) : ''} onChange={(e) => onChange(e.target.value && e.target.value !== MISFIT ? parseTraitKey(e.target.value) : undefined)}>
              <option value="">Choose…</option>
              {misfit && <option value={MISFIT}>{current ? `${current.name} ${current.die} → ${row.power!.die}` : row.power!.trait.id} (saved, doesn't fit)</option>}
              {powers.map((p) => {
                const key = traitKey(p.trait)
                return (
                  <option key={key} value={key} disabled={used.has(key)}>
                    {changeText(p.name, row.change, p.die)}
                    {used.has(key) ? ' (in another row)' : ''}
                  </option>
                )
              })}
            </select>
            {shown && (
              <span className="recipe-row__shown" aria-hidden="true">
                <span className="recipe-row__name">{shown.name}</span>
                <DieIcon die={shown.die} size="compact" /> → <DieIcon die={row.power!.die} size="compact" />
              </span>
            )}
          </span>
          {f.list}
        </div>
      )}
    </IssueField>
  )
}

const MISFIT = 'misfit'

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
  const defaults = defaultModeDice(traits)
  const recipe = entry && mode ? modeRows(entry, mode.powers, defaults) : { rows: [], extra: [] }
  const unused = powers.filter((p) => !recipe.rows.some((r) => r.power && traitKey(r.power.trait) === traitKey(p.trait)))
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
          <div className="recipe-rows" role="group" aria-label={`${title} powers`}>
            {recipe.rows.map((row, i) => {
              const label = changeLabel(row.change)
              // Tells apart rows with the same change, e.g. two "Raise 1 size".
              const nth = recipe.rows.slice(0, i + 1).filter((r) => changeLabel(r.change) === label).length
              const twin = recipe.rows.filter((r) => changeLabel(r.change) === label).length > 1
              const others = new Set(recipe.rows.flatMap((r, j) => (j !== i && r.power ? [traitKey(r.power.trait)] : [])))
              return (
                <RecipeRow
                  key={i}
                  label={twin ? `${label} (${nth})` : label}
                  row={row}
                  powers={powers}
                  used={others}
                  field={modeRowField(mode.id, i)}
                  onChange={(trait) => onChange({ ...mode, powers: setModeRow(entry, mode.powers, defaults, i, trait) })}
                />
              )
            })}
            {/* More powers than the recipe has rows (an old save): each can be taken out. */}
            {recipe.extra.map((a) => (
              <p key={traitKey(a.trait)} className="recipe-rows__extra">
                <span>
                  Also saved: {traitLabel(hero, a.trait)} {a.die}
                </span>
                <button type="button" className="button button--small" onClick={() => onChange({ ...mode, powers: mode.powers.filter((x) => x !== a) })}>
                  Remove
                </button>
              </p>
            ))}
            {unused.length > 0 && <p className="recipe-rows__unused">Not in this mode: {unused.map((p) => p.name).join(', ')}</p>}
          </div>
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
        modeSlots(hero, modes, zone, spec[zone].count).map((slot, i) =>
          !shows(zone, i, spec[zone].count) ? null : (
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
          ),
        ),
      )}
      {first &&
        strayModes(hero, modes).map(({ mode, index }) => (
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
