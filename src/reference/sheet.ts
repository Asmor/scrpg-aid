/**
 * The pure parts of drawing and printing a reference sheet (scrpg-aid-designs/reference-sheets/spec.md,
 * sections 5 to 7): what the arrangement keeps, the print's page rules and footers, and the
 * preview's layout.
 */
import { cssString } from '../transfer/print'
import { cardPlace, estimateCardHeight, pageBox, paginate, TITLE_HEIGHT, type Layout } from './layout'
import { CARD_TYPE_PLURAL, CARD_TYPES, joinAnd, sheetRefKey, type HiddenMark, type PageItem, type SheetArrangement, type SheetCard, type SheetContents, type SheetOptions } from './model'

export const hiddenText = (mark: HiddenMark) => (mark === 'starts' ? 'Starts hidden' : 'Hidden')

/** The die boxes' label: "4 members" for a group in play, "Group of 4" for a template (the spec's mockups). */
export const membersText = (card: Pick<SheetCard, 'ref'> & { members: readonly unknown[] }) => {
  const n = card.members.length
  return card.ref.kind === 'group' ? `${n} ${n === 1 ? 'member' : 'members'}` : `Group of ${n}`
}

/** The print's own pieces, in order: what the arrangement keeps, looked up in the contents. */
export function arranged(contents: SheetContents, arrangement: SheetArrangement) {
  const pageByKey = new Map(contents.pages.map((p) => [sheetRefKey(p.ref), p]))
  const cardByKey = new Map(contents.cards.map((c) => [sheetRefKey(c.ref), c]))
  return {
    pages: arrangement.pages.flatMap((r) => pageByKey.get(sheetRefKey(r)) ?? []),
    cards: arrangement.cards.flatMap((c) => {
      const card = cardByKey.get(sheetRefKey(c.ref))
      return card ? [{ card, breakBefore: c.breakBefore }] : []
    }),
  }
}

export type ArrangedCard = {
  card: SheetCard
  breakBefore?: 'column' | 'page' | undefined
}

/** The card pages' footer: "Reference sheet", or "Scene 3: The Foundry". */
export const cardFooter = (contents: Pick<SheetContents, 'scene'>) => (contents.scene ? `Scene ${contents.scene.number}: ${contents.scene.name}` : 'Reference sheet')

/** The @page rules for one print: the paper, and each named page's footer name. */
export function printRules(pages: readonly PageItem[], contents: Pick<SheetContents, 'scene'>, paper: SheetOptions['paper']): string {
  const named = (name: string, text: string) => `@page ${name} { @bottom-left { content: ${cssString(text)}; } }`
  return [`@page { size: ${paper === 'a4' ? 'A4' : 'letter'}; }`, named('ref-cards', cardFooter(contents)), ...pages.map((p, i) => named(`ref-page-${i}`, p.name))].join('\n')
}

/** "Gravelord (villain) is on the next pages." */
export function followingLine(pages: readonly PageItem[]): string {
  const names = pages.map((p) => `${p.name} (${p.kind})`)
  return `${joinAnd(names)} ${names.length === 1 ? 'is' : 'are'} on the next pages.`
}

/** Splits the cards at page breaks: each run is its own block of columns. */
export function pageRuns(cards: readonly ArrangedCard[]): ArrangedCard[][] {
  const runs: ArrangedCard[][] = [[]]
  for (const c of cards) {
    if (c.breakBefore === 'page' && runs.at(-1)!.length) runs.push([])
    runs.at(-1)!.push(c)
  }
  return runs.filter((r, i) => r.length || i === 0)
}

/** The space a scene block takes at the top of page 1, roughly: names, tracker and notes. */
export function firstTop(contents: Pick<SheetContents, 'scene'>, options: Pick<SheetOptions, 'includeNotes'>): number {
  if (!contents.scene) return TITLE_HEIGHT
  const notes = options.includeNotes && contents.scene.notes.trim() ? 40 + Math.ceil(contents.scene.notes.length / 100) * 17 : 0
  return 150 + notes
}

/** The layout from each card's height: measured where it's been drawn (`heights`), estimated otherwise. */
export function layoutCards(cards: readonly ArrangedCard[], contents: Pick<SheetContents, 'scene'>, options: SheetOptions, heights?: ReadonlyMap<string, number>, keyOf?: (c: ArrangedCard) => string): Layout {
  const box = pageBox(options.paper, options.columns)
  return paginate(
    cards.map((c) => ({
      height: (keyOf && heights?.get(keyOf(c))) || estimateCardHeight(c.card, box.columnWidth, options.writeIns),
      ...(c.breakBefore ? { breakBefore: c.breakBefore } : {}),
    })),
    options.columns,
    box.columnHeight,
    firstTop(contents, options),
  )
}

/** "Environments 1 · Challenges 1 · Minions 2". */
export function cardCountsText(cards: readonly SheetCard[]): string {
  return CARD_TYPES.flatMap((t) => {
    const n = cards.filter((c) => c.type === t).length
    return n ? [`${CARD_TYPE_PLURAL[t]} ${n}`] : []
  }).join(' · ')
}

/** "Foundry Thugs, page 2, column 1, position 3 of 4." */
export function placeText(name: string, layout: Layout, index: number): string {
  const at = cardPlace(layout, index)
  return at ? `${name}, page ${at.page}, column ${at.column}, position ${at.position} of ${at.of}.` : name
}
