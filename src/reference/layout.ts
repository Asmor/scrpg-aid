/**
 * Laying cards out on pages (scrpg-aid-designs/reference-sheets/spec.md, sections 4 and 7), for
 * Arrange's preview and the page counts. The print itself flows the same cards through CSS
 * columns; where a browser's print layout differs from this, the print wins. Pure.
 */
import type { SheetCard, SheetOptions } from './model'

/** Paper at 96 px to the inch: Letter is 816 × 1056, A4 794 × 1123. */
export const PAPER: Record<SheetOptions['paper'], { width: number; height: number }> = { letter: { width: 816, height: 1056 }, a4: { width: 794, height: 1123 } }

/** The print margins (../index.css's @page): half an inch, three quarters at the bottom for the footer. */
export const MARGIN = { side: 48, top: 48, bottom: 72 }
export const COLUMN_GAP = 16
/** The space between cards in a column. */
export const CARD_GAP = 14
/** The card pages' title line ("Reference sheet") at the top of the first card page. */
export const TITLE_HEIGHT = 40

export function pageBox(paper: SheetOptions['paper'], columns: SheetOptions['columns']) {
  const { width, height } = PAPER[paper]
  const inner = width - MARGIN.side * 2
  return {
    width,
    height,
    inner,
    columnHeight: height - MARGIN.top - MARGIN.bottom,
    columnWidth: (inner - COLUMN_GAP * (columns - 1)) / columns,
  }
}

/** One card placed on a page: its index in print order, and, for a card taller than a column, which part. */
export interface Placed {
  index: number
  /** Set on a too-tall card's second and later parts ("Molten Foundry, continued"). */
  continued?: true
}

export interface LaidOutPage {
  columns: Placed[][]
}

export interface Layout {
  pages: LaidOutPage[]
  /** The cards taller than a column, by index: they continue in the next column. */
  tooTall: Set<number>
}

/**
 * Flows cards into columns and pages, in order. A card that doesn't fit the rest of a column
 * starts the next; one taller than a whole column breaks across columns. `firstTop` is the
 * space already used at the top of the first page (its title, or a scene's block).
 */
export function paginate(cards: readonly { height: number; breakBefore?: 'column' | 'page' }[], columns: number, columnHeight: number, firstTop = 0): Layout {
  const pages: LaidOutPage[] = []
  const tooTall = new Set<number>()
  let page: LaidOutPage = { columns: [[]] }
  pages.push(page)
  let used = Math.min(firstTop, columnHeight)
  // The first page's top block spans every column.
  let top = used
  const newPage = () => {
    page = { columns: [[]] }
    pages.push(page)
    top = 0
    used = 0
  }
  const newColumn = () => {
    if (page.columns.length >= columns) newPage()
    else {
      page.columns.push([])
      used = top
    }
  }
  const column = () => page.columns.at(-1)!
  cards.forEach((card, index) => {
    const empty = column().length === 0
    if (card.breakBefore === 'page' && !(empty && page.columns.length === 1)) newPage()
    else if (card.breakBefore === 'column' && !empty) newColumn()
    const gap = column().length ? CARD_GAP : 0
    if (column().length && used + gap + card.height > columnHeight) newColumn()
    const room = columnHeight - top
    if (card.height <= room) {
      used += (column().length ? CARD_GAP : 0) + card.height
      column().push({ index })
      return
    }
    // Too tall: it fills this column and carries on in the next ones.
    tooTall.add(index)
    let left = card.height
    let first = true
    for (;;) {
      const space = columnHeight - used
      column().push(first ? { index } : { index, continued: true })
      first = false
      if (left <= space) {
        used += left
        return
      }
      left -= space
      newColumn()
    }
  })
  return { pages, tooTall }
}

/** A rough height for a card before it's been drawn, at 12 px text: enough for a page count. */
export function estimateCardHeight(card: SheetCard, columnWidth: number, writeIns: boolean): number {
  const LINE = 17
  const perLine = Math.max(10, Math.floor(columnWidth / 6.4))
  const lines = (text: string) => (text.trim() ? text.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0) : 0)
  // The band, the type line and the name.
  let h = 4 + 6 + 16 + 30
  switch (card.type) {
    case 'minion':
    case 'lieutenant':
      // The large starting die makes the name line taller.
      if (card.die) h += 6
      h += LINE + lines(card.notes) * LINE
      for (const a of card.abilities) h += 8 + LINE + lines(a.text) * LINE
      if (writeIns) h += 36 * Math.ceil(card.members.length / Math.max(1, Math.floor((columnWidth - 90) / 42)))
      break
    case 'challenge':
      h += lines(card.description) * LINE + card.steps.reduce((n, s) => n + lines(s.label || 'Step') * LINE, 0)
      if (card.whenDone.trim()) h += LINE + lines(card.whenDone) * LINE
      break
    case 'environment':
      h += lines(card.description) * LINE + LINE + card.aspects.length * 26
      if (card.twists.length) h += LINE + card.twists.reduce((n, t) => n + 4 + Math.max(1, lines(`${t.name ? `${t.name}: ` : ''}${t.text}`) + (columnWidth < 300 ? 1 : 0)) * LINE, 0)
      if (card.brings.length) h += LINE
      break
  }
  if (card.hidden) h += LINE
  return h
}

/** How many pages a hero or villain sheet takes: page 1, and abilities starting page 2. */
export const FULL_PAGE_COUNT = 2

/** "about 6 pages": the full pages, and the card pages as estimated. */
export function estimatePages(contents: { pages: readonly unknown[]; cards: readonly SheetCard[] }, options: Pick<SheetOptions, 'paper' | 'columns' | 'writeIns'>, firstTop = TITLE_HEIGHT): number {
  const box = pageBox(options.paper, options.columns)
  const cardPages =
    contents.cards.length || firstTop > TITLE_HEIGHT
      ? paginate(
          contents.cards.map((c) => ({
            height: estimateCardHeight(c, box.columnWidth, options.writeIns),
          })),
          options.columns,
          box.columnHeight,
          firstTop,
        ).pages.length
      : 0
  return contents.pages.length * FULL_PAGE_COUNT + cardPages
}

/** Where a card is: page, column and position (each from 1), and how many cards share its column. */
export interface CardPlace {
  page: number
  column: number
  position: number
  of: number
}

/** Where a card starts in a layout; undefined when it isn't in it. */
export function cardPlace(layout: Layout, index: number): CardPlace | undefined {
  for (const [p, page] of layout.pages.entries()) {
    for (const [c, column] of page.columns.entries()) {
      const firsts = column.filter((x) => !x.continued)
      const at = firsts.findIndex((x) => x.index === index)
      if (at >= 0) return { page: p + 1, column: c + 1, position: at + 1, of: firsts.length }
    }
  }
  return undefined
}

/**
 * Where a card dropped into one of a page's empty columns goes, as `moveCard`'s target: after the
 * last card that starts on that page (with a column break before it, which `moveToNewColumn`
 * adds). Only a sheet with no cards has a page without any, so then it goes first.
 */
export function emptyColumnTarget(layout: Layout, page: number, from: number): number {
  const firsts = (layout.pages[page]?.columns ?? []).flat().filter((x) => !x.continued)
  if (!firsts.length) return 0
  const last = Math.max(...firsts.map((x) => x.index))
  return from <= last ? last : last + 1
}

/** A keyboard move left or right: `moveCard`'s target, and whether it starts a new column (into an empty one). */
export interface ColumnMove {
  to: number
  newColumn?: true
}

/**
 * Where a keyboard move left or right takes a card: the same place in the previous or next column
 * (or the end of it), across pages. Moving right from a page's last filled column, when the page
 * has an empty column, starts that column (as a column break would). Its own index when there's
 * no column that way.
 */
export function columnMove(layout: Layout, index: number, dir: 1 | -1, count: number, columnsPerPage: number): ColumnMove {
  if (dir > 0) {
    const p = layout.pages.findIndex((page) => page.columns.some((c) => c.some((x) => x.index === index && !x.continued)))
    const page = layout.pages[p]
    if (page && page.columns.length < columnsPerPage && page.columns.at(-1)!.some((x) => x.index === index && !x.continued)) return { to: emptyColumnTarget(layout, p, index), newColumn: true }
  }
  return { to: columnMoveTarget(layout, index, dir, count) }
}

/**
 * Where a move left or right takes a card between filled columns, as `moveCard`'s target: the
 * same place in the previous or next column (or the end of it), across pages. Its own index when
 * there's no column that way.
 */
export function columnMoveTarget(layout: Layout, index: number, dir: 1 | -1, count: number): number {
  const columns = layout.pages.flatMap((p) => p.columns)
  const at = columns.findIndex((c) => c.some((x) => x.index === index && !x.continued))
  if (at < 0) return index
  const pos = columns[at]!.filter((x) => !x.continued).findIndex((x) => x.index === index)
  // An empty column after the last card counts as the end.
  const target = columns[at + dir]
  if (!target) return dir > 0 && at < columns.length - 1 ? count - 1 : index
  const others = target.filter((x) => !x.continued && x.index !== index).map((x) => x.index)
  const flat = pos < others.length ? others[pos]! : others.length ? others.at(-1)! + 1 : dir > 0 ? count : 0
  return flat > index ? flat - 1 : flat
}
