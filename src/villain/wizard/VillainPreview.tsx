/**
 * The villain sheet in a compact size, for the wizard's preview (the villain wizard spec,
 * section 2): the identity line, powers and qualities, the status rule in short form, Health
 * "for 4 heroes", and abilities grouped by where they came from: the approach, the archetype,
 * each upgrade, then the mastery. Parts not filled in yet name their step in muted italics.
 */
import { AbilityIcons } from '../../components/icons'
import { HealthBlock, Placeholder, TraitList } from '../../components/SheetPreview'
import { ABILITY_TYPE_LABEL } from '../../hero/labels'
import type { Villain } from '../model'
import { buildVillainSheet, villainIdentity, type VillainSheetAbility } from '../sheet'
import { statusSummary } from '../status'
import type { AttachedInfo } from './useAttached'

function Group({ title, abilities, empty }: { title: string; abilities: readonly VillainSheetAbility[]; empty?: string }) {
  return (
    <section className="band band--out" aria-label={`${title} abilities`}>
      <h4 className="band__head">{title}</h4>
      {abilities.length ? (
        <ul>
          {abilities.map((a, i) => (
            <li key={`${a.source}:${a.baseName}:${i}`} className="band__row">
              <span>
                <AbilityIcons actions={a.effects} />
                {a.name}
              </span>
              <span className="band__type">{ABILITY_TYPE_LABEL[a.type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="band__row">
          <Placeholder step={empty ?? ''} />
        </p>
      )}
    </section>
  )
}

export function VillainPreview({ villain, comesWith }: { villain: Villain; comesWith?: readonly AttachedInfo[] | null }) {
  const sheet = buildVillainSheet(villain)
  const named = Boolean(villain.details.name.trim() || villain.details.alias.trim())
  const isFrom = (...sources: VillainSheetAbility['source'][]) => sheet.abilities.filter((a) => sources.includes(a.source) && !a.upgrade)
  const upgrades = sheet.upgrades.map((u) => ({ name: u.name, abilities: [...sheet.abilities, ...(sheet.vehicle?.abilities ?? [])].filter((a) => a.upgrade === u.name) })).filter((u) => u.abilities.length)
  const h = sheet.health
  return (
    <article className="sheet-preview" aria-label={`${sheet.name} sheet`}>
      <header>
        <h4 className={named ? 'sheet-preview__name' : 'sheet-preview__name placeholder'}>{sheet.name}</h4>
        <p className="sheet-preview__sub">{villainIdentity(sheet)}</p>
      </header>
      <div className="sheet-preview__traits">
        <TraitList title="Powers" traits={sheet.powers} empty="Step 2" />
        <TraitList title="Qualities" traits={sheet.qualities} empty="Step 2" />
      </div>
      <div className="sheet-preview__part" data-part="status">
        <h4>Status die</h4>
        <p>{sheet.status ? statusSummary(sheet.status) : <Placeholder step="Step 3" />}</p>
      </div>
      <div className="sheet-preview__part" data-part="health">
        <h4>Health</h4>
        {h ? (
          <HealthBlock max={h.max} ranges={h.ranges} note={`for ${h.heroCount} ${h.heroCount === 1 ? 'hero' : 'heroes'}`} />
        ) : (
          <p>
            <Placeholder step="Steps 2 and 3" />
          </p>
        )}
      </div>
      <section className="sheet-preview__abilities" aria-label="Abilities">
        <h4>Abilities</h4>
        <Group title={sheet.approach ?? 'Approach'} abilities={isFrom('approach')} empty="Step 2" />
        <Group title={sheet.archetype ?? 'Archetype'} abilities={isFrom('archetype', 'archetype.fixed')} empty="Step 3" />
        {upgrades.map((u) => (
          <Group key={u.name} title={u.name} abilities={u.abilities} />
        ))}
        {sheet.mastery && <Group title="Mastery" abilities={[sheet.mastery]} />}
      </section>
      {comesWith && comesWith.length > 0 && (
        <section className="sheet-preview__part" aria-label="Comes with">
          <h4>Comes with</h4>
          <ul className="vw-comes-with">
            {comesWith.map((a) => (
              <li key={`${a.attachment.role}:${a.attachment.templateId}`} className={a.missing ? 'placeholder' : undefined}>
                <strong>{a.name}</strong> <span className="hint">{a.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
