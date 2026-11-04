/**
 * The pieces every target picker shares (docs/design/npcs/spec.md, "Choosing targets"): a
 * select's options (the likely side, the other side as a labeled group, the sections always
 * shown, then No target), and the one "Show allies too" or "Show opponents too" checkbox per
 * dialog. Who is listed comes from ../game/target-options.ts.
 */
import type { TargetList } from '../game/target-options'

/** A target select's options. "No target" (value `noTargetValue`, by default "") ends the list unless `noTarget` is false. */
export function TargetOptions({ list, noTarget = true, noTargetValue = '' }: { list: TargetList; noTarget?: boolean; noTargetValue?: string }) {
  return (
    <>
      {list.likely.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      {list.other && (
        <optgroup label={list.other.label}>
          {list.other.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      )}
      {list.always?.map((section) => (
        <optgroup key={section.label} label={section.label}>
          {section.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
      {noTarget && <option value={noTargetValue}>No target</option>}
    </>
  )
}

/** "Show allies too": adds the other side to every target list in the dialog. */
export function ShowOtherSide({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
