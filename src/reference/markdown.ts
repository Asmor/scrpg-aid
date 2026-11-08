/**
 * A reference sheet as Markdown (scrpg-aid-designs/reference-sheets/spec.md, section 8): the same
 * contents in the same order. Full pages use their own Markdown without the import JSON (the
 * backup file is for importing); cards are `##` sections in the arranged order, ignoring breaks;
 * `---` goes between every full page and before the cards. Pure.
 */
import { aspectName } from '../game/environment'
import { actionsText } from '../game/npc'
import { escapeInline, heading, heroMarkdown, text, villainMarkdown } from '../transfer/markdown'
import { CARD_TYPE_NAME, type CardTwist, type PageItem, type ScenePage, type SheetArrangement, type SheetCard, type SheetContents, type SheetOptions } from './model'
import { arranged, hiddenText } from './sheet'

const ZONE_LETTER = { green: 'G', yellow: 'Y', red: 'R' } as const
const ABILITY_TYPE = { A: 'Action', R: 'Reaction', I: 'Inherent' } as const

/** "Tracker: ■■■■□□□□ · Standard 2 / 4 / 2 · Now: Yellow 2". */
export function trackerLine(scene: ScenePage): string {
  const { tracker } = scene
  const boxes = tracker.zones.map((_, i) => (i < tracker.filled ? '■' : '□')).join('')
  const counts = `${tracker.counts.green} / ${tracker.counts.yellow} / ${tracker.counts.red}`
  return `Tracker: ${boxes} · ${tracker.name} ${counts}${tracker.now ? ` · Now: ${tracker.now}` : ''}`
}

const box = (checked: boolean) => (checked ? '[x]' : '[ ]')

function twistLine(t: CardTwist, writeIns: boolean): string {
  const mark = writeIns || t.used ? `${box(t.used)} ` : ''
  return `- ${mark}**${ZONE_LETTER[t.zone]}** ${t.kind === 'major' ? 'Major' : 'Minor'}: ${t.name ? `**${escapeInline(t.name)}:** ` : ''}${text(t.text, '  ')}`
}

function cardMarkdown(card: SheetCard, writeIns: boolean): string {
  const blocks = [heading(2, card.name), `*${CARD_TYPE_NAME[card.type]}${card.from ? ` · from ${escapeInline(card.from)}` : ''}*`]
  if (card.hidden) blocks.push(hiddenText(card.hidden))
  switch (card.type) {
    case 'minion':
    case 'lieutenant': {
      blocks.push([card.die ? `**Die:** ${card.die}` : '', `**Actions:** ${actionsText(card)}`].filter(Boolean).join('\\\n'))
      if (card.abilities.length) blocks.push(card.abilities.map((a, i) => `- **${escapeInline(a.name.trim() || `Ability ${i + 1}`)}** (${ABILITY_TYPE[a.type]}): ${text(a.text, '  ')}`).join('\n'))
      if (card.notes.trim()) blocks.push(text(card.notes))
      if (writeIns && card.members.length) blocks.push(`Group of ${card.members.length}: ${card.members.map((m) => (m.out ? `[x] ${m.die} (out)` : `[ ] ${m.die}`)).join(' ')}`)
      break
    }
    case 'challenge':
      if (card.description.trim()) blocks.push(text(card.description))
      if (card.steps.length) blocks.push(card.steps.map((s, i) => `- ${writeIns || s.done ? `${box(s.done)} ` : ''}${escapeInline(s.label.trim() || `Step ${i + 1}`)}`).join('\n'))
      if (card.whenDone.trim()) blocks.push(`**When it's done:** ${text(card.whenDone)}`)
      break
    case 'environment':
      if (card.description.trim()) blocks.push(text(card.description))
      if (card.aspects.length) blocks.push('**Aspects**', card.aspects.map((a, i) => `- ${escapeInline(aspectName(a, i))}: ${a.die}`).join('\n'))
      if (card.twists.length) blocks.push('**Twists**', card.twists.map((t) => twistLine(t, writeIns)).join('\n'))
      if (card.brings.length) blocks.push(`Brings: ${escapeInline(card.brings.join(', '))}`)
      break
  }
  return blocks.join('\n\n')
}

function pageMarkdown(page: PageItem, writeIns: boolean): string {
  const options = { payload: false, healthLine: writeIns }
  return (page.kind === 'hero' ? heroMarkdown(page.hero, options) : villainMarkdown(page.villain, options)).trimEnd()
}

/** The cards' part: a scene's block, or a title, then the cards. Undefined when there's nothing to put there. */
function cardsMarkdown(contents: SheetContents, cards: readonly SheetCard[], options: Pick<SheetOptions, 'writeIns' | 'includeNotes'>): string | undefined {
  const { scene } = contents
  if (!scene && !cards.length) return undefined
  const blocks = scene ? [heading(1, scene.name), escapeInline(`${scene.gameName} · ${scene.where}`), trackerLine(scene)] : [heading(1, 'Reference sheet')]
  if (scene && options.includeNotes && scene.notes.trim()) blocks.push('**Scene notes**', text(scene.notes))
  blocks.push(...cards.map((c) => cardMarkdown(c, options.writeIns)))
  return blocks.join('\n\n')
}

export function sheetMarkdown(contents: SheetContents, arrangement: SheetArrangement, options: Pick<SheetOptions, 'writeIns' | 'includeNotes' | 'cardsFirst'>): string {
  const kept = arranged(contents, arrangement)
  const pages = kept.pages.map((p) => pageMarkdown(p, options.writeIns))
  const cards = cardsMarkdown(
    contents,
    kept.cards.map((c) => c.card),
    options,
  )
  const parts = cards === undefined ? pages : contents.scene || options.cardsFirst ? [cards, ...pages] : [...pages, cards]
  return `${parts.join('\n\n---\n\n')}\n`
}
