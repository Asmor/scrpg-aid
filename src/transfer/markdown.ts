/**
 * The hero sheet as Markdown: headings, lists and tables only, laid out to read well as
 * plain text and rendered. It ends with the hero's JSON in an HTML comment (the one HTML
 * allowed), so the file can be imported back. Rule warnings are left out.
 */
import { buildSheet, type HeroSheet, type SheetAbility } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import { modeLimits } from '../creation/format'
import { ABILITY_TYPE_LABEL, DETAIL_LABEL, ZONE_LABEL } from '../hero/labels'
import { DETAIL_FIELDS, heroDisplayName, type Hero } from '../hero/model'
import type { AbilityType, Die, Zone } from '../rules/types'
import { markdownPayload } from './embed'

const ZONES = ['green', 'yellow', 'red'] as const

/** Escapes characters that Markdown would read as formatting, keeping the text readable. */
function escapeInline(text: string): string {
  return text.replace(/[\\`*_~[\]<>|&]/g, '\\$&')
}

/** Heading text: escaped, with a trailing run of "#" kept (CommonMark would drop it as a closing sequence). */
const heading = (level: number, value: string) => `${'#'.repeat(level)} ${escapeInline(value).replace(/(^|\s)(#+)\s*$/, '$1\\$2')}`

/** Block markers that would change a line's meaning at its start: headings, quotes, lists, rules. */
const LINE_START = /^(#|>|[-+=~])|^(\d+)([.)])/

const escapeLineStart = (line: string) => line.replace(LINE_START, (_, mark: string | undefined, digits: string, dot: string) => (mark ? `\\${mark}` : `${digits}\\${dot}`))

/**
 * Player-written text, which may run over several lines and paragraphs: each line is
 * escaped and ends in a backslash hard break, paragraphs are kept apart by a blank line,
 * and later lines are indented to stay inside a list item. Lines after the first start a
 * line of their own, so a list or heading marker there is escaped too.
 */
function text(value: string, indent = ''): string {
  const paragraphs = value
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .filter((p) => p.length > 0)
  return paragraphs
    .map((lines, p) => lines.map((line, i) => (p === 0 && i === 0 ? escapeInline(line) : `${indent}${escapeLineStart(escapeInline(line))}`)).join('\\\n'))
    .join('\n\n')
}

/** A pipe table with its columns padded, so it lines up as plain text too. Cells come escaped. */
function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const cells = [header, ...rows]
  const widths = header.map((_, i) => Math.max(3, ...cells.map((row) => row[i]!.length)))
  const line = (row: readonly string[]) => `| ${row.map((c, i) => c.padEnd(widths[i]!)).join(' | ')} |`
  return [line(cells[0]!), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`, ...cells.slice(1).map(line)].join('\n')
}

function traitTable(kind: string, traits: readonly HeroTrait[]): string {
  if (traits.length === 0) return `No ${kind === 'Quality' ? 'qualities' : `${kind.toLowerCase()}s`} yet.`
  return table([kind, 'Die'], traits.map((t) => [escapeInline(t.name), t.die]))
}

function statusTable(dice: Record<Zone, Die>): string {
  return table(
    ZONES.map((z) => ZONE_LABEL[z]),
    [ZONES.map((z) => dice[z])],
  )
}

function abilityItem(a: { name: string; type: AbilityType; text: string }): string {
  return `- **${escapeInline(a.name)}** (${ABILITY_TYPE_LABEL[a.type]}): ${text(a.text, '  ')}`
}

const field = (label: string, value: string) => `- **${label}:**${value.trim() ? ` ${text(value, '  ')}` : ''}`

function abilities(sheet: HeroSheet): string[] {
  const out = ['## Abilities']
  for (const zone of ZONES) {
    // Principle abilities end the Green list, as on the printed sheet.
    const list = sheet.abilities
      .filter((a) => a.zone === zone)
      .sort((a: SheetAbility, b: SheetAbility) => Number(a.source === 'principle') - Number(b.source === 'principle'))
    out.push(`### ${ZONE_LABEL[zone]}`, list.length ? list.map(abilityItem).join('\n') : 'None yet.')
  }
  out.push('### Out', sheet.outAbility ? text(sheet.outAbility) : 'Choose a personality.')
  return out
}

function auxiliary(sheet: HeroSheet): string[] {
  const { forms, modes, powerlessMode, minionForms, divided } = sheet
  const out = ['## Auxiliary sheet']
  // Divided with nothing of its own to show (no heroic personality, traits or split) gets no section.
  if (divided && (divided.heroicPersonality || sheet.heroicStatusDice || divided.heroicTraits || divided.split)) {
    out.push('### Divided')
    if (divided.heroicPersonality) out.push(field('Heroic form personality', divided.heroicPersonality))
    if (sheet.heroicStatusDice) out.push('Heroic form status dice:', statusTable(sheet.heroicStatusDice))
    if (divided.heroicTraits) out.push('Heroic form powers and qualities:', traitTable('Trait', divided.heroicTraits))
    if (divided.split) {
      const list = (names: readonly string[]) => (names.length ? names.map(escapeInline).join(', ') : '—')
      out.push([`- **Always:** ${list(divided.split.always)}`, `- **Civilian form:** ${list(divided.split.civilian)}`, `- **Heroic form:** ${list(divided.split.heroic)}`].join('\n'))
    }
  }
  for (const form of forms) {
    out.push(`${heading(3, form.name)} (${ZONE_LABEL[form.zone]} form)`, traitTable('Trait', form.traits))
    if (form.ability) out.push(abilityItem(form.ability))
  }
  for (const mode of modes) {
    out.push(`${heading(3, mode.name)} (${ZONE_LABEL[mode.zone]} mode)`, traitTable('Trait', mode.traits))
    if (mode.cannot.length > 0 || mode.immobile) out.push(modeLimits(mode.cannot, mode.immobile))
    if (mode.ability) out.push(abilityItem(mode.ability))
  }
  if (powerlessMode) out.push('### Powerless mode', traitTable('Trait', powerlessMode))
  if (minionForms.length) {
    out.push('### Minion forms', minionForms.map((f) => `- **${escapeInline(f.name)} (+${f.minBonus}):** ${text(f.effect, '  ')}`).join('\n'))
  }
  return out.length > 1 ? out : []
}

function advancement(sheet: HeroSheet): string[] {
  const adv = sheet.advancement
  if (!adv || (adv.collections.length === 0 && adv.changes.length === 0 && adv.backIssues === 0)) return []
  const out = ['## Advancement', `Back issues: ${adv.backIssues}`]
  if (adv.collections.length) {
    out.push(
      adv.collections
        .map((c, i) => {
          const name = `${i + 1}. **${c.name.trim() ? escapeInline(c.name.trim()) : `Collection ${i + 1}`}**`
          return c.notes?.trim() ? `${name}\\\n   ${text(c.notes, '   ')}` : name
        })
        .join('\n'),
    )
  }
  if (adv.changes.length) out.push(adv.changes.map((c) => `- ${text(c, '  ')}`).join('\n'))
  return out
}

/** The hero as a Markdown document. */
export function heroMarkdown(hero: Hero): string {
  const sheet = buildSheet(hero)
  const c = sheet.characteristics
  const blocks: string[] = [heading(1, heroDisplayName(hero))]
  if (hero.details.alias.trim() && hero.details.name.trim()) blocks.push(`**Alias:** ${text(hero.details.alias)}`)

  blocks.push(
    '## Characteristics',
    [field('Background', c.background ?? '—'), field('Power source', c.powerSource ?? '—'), field('Archetype', c.archetype ?? '—'), field('Personality', c.personality ?? '—')].join('\n'),
  )
  const details = DETAIL_FIELDS.filter((f) => f !== 'name' && f !== 'alias' && hero.details[f].trim())
  if (details.length) blocks.push('## Details', details.map((f) => field(DETAIL_LABEL[f], hero.details[f])).join('\n'))

  blocks.push('## Powers', traitTable('Power', sheet.powers), '## Qualities', traitTable('Quality', sheet.qualities))
  blocks.push('## Status dice', sheet.statusDice ? statusTable(sheet.statusDice) : 'Choose a personality.')
  blocks.push('## Health')
  if (sheet.maxHealth !== undefined) {
    blocks.push(`**Max Health:** ${sheet.maxHealth}`)
    const ranges = sheet.healthRanges
    if (ranges) blocks.push(ZONES.map((z) => `- **${ZONE_LABEL[z]}:** ${ranges[z][0]}–${ranges[z][1]}`).join('\n'))
  } else {
    blocks.push('Not worked out yet.')
  }

  blocks.push('## Principles')
  if (sheet.principles.length) {
    for (const p of sheet.principles) {
      blocks.push(heading(3, p.name), [field('During roleplaying', p.roleplaying), field('Minor twist', p.minorTwist), field('Major twist', p.majorTwist)].join('\n'))
    }
  } else {
    blocks.push('No principles yet.')
  }

  blocks.push(...abilities(sheet), ...auxiliary(sheet), ...advancement(sheet), markdownPayload(hero))
  return `${blocks.join('\n\n')}\n`
}
