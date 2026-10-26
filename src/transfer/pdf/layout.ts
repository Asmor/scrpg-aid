/**
 * Lays out the hero sheet for the PDF export, in the style of the official sheet: cream
 * pages, peach panels with a black border and offset shadow, orange-red bold italic
 * headings, abilities in Green/Yellow/Red bands with the Out ability last, and die icons
 * beside each die. Content flows down the page and onto new pages. A block that doesn't
 * fit moves to the next page whole; only one too tall for a page of its own is split
 * (long text, line by line, under a "(continued)" title). Ability bands break between
 * rows, repeating the band's title on the new page.
 *
 * Layout only measures and draws through the Canvas interface (top-left coordinates, in
 * points), so it's pure and testable; ./render.ts draws it with pdf-lib.
 */
import { diceTableRows, type DiceTableRow } from '../../creation/dice-table'
import { buildSheet, type HeroSheet } from '../../creation/sheet'
import type { HeroTrait } from '../../creation/traits'
import { modeLimits } from '../../creation/format'
import { DETAIL_LABEL, ZONE_LABEL } from '../../hero/labels'
import { DETAIL_FIELDS, heroDisplayName, type Hero } from '../../hero/model'
import type { AbilityType, Die, Zone } from '../../rules/types'
import type { IconName } from '../../components/icon-source'
import { abilityEffects, ACTIONS, effectMentions, type Action } from '../../creation/effects'
import { DICE } from '../../rules/dice'

export type FontId = 'regular' | 'bold' | 'boldItalic'

export interface Box {
  fill?: string
  stroke?: string
  lineWidth?: number
}

export interface Canvas {
  readonly width: number
  readonly height: number
  /** The width of `text` in points. */
  measure(text: string, font: FontId, size: number): number
  /** Starts a new page and draws on it. */
  addPage(): void
  /** Draws on an earlier page (for the footers). */
  setPage(index: number): void
  readonly pageCount: number
  /** Text with its top at `y`. */
  text(text: string, x: number, y: number, font: FontId, size: number, color: string): void
  rect(x: number, y: number, width: number, height: number, box: Box): void
  /** A die or action icon, `size` points square. */
  icon(name: IconName, x: number, y: number, size: number): void
}

/** The light theme's colours (src/index.css). */
export const COLORS = {
  page: '#fbf7ef',
  panel: '#fde7d3',
  border: '#2b2118',
  heading: '#c2361b',
  text: '#1a1a1a',
  muted: '#555555',
  zone: { green: '#dff3d6', yellow: '#fdf3c4', red: '#fbd9d6', out: '#e4e4e4' },
  zoneStrong: { green: '#276b2a', yellow: '#735b00', red: '#b42318' },
} as const

const MARGIN = 36
const GAP = 10
const PAD = 8
const BODY = 9.5
const LINE = BODY * 1.3
const SMALL = 8
const ZONES = ['green', 'yellow', 'red'] as const

/** One piece of the page: measured for a width, then drawn into a space at least that tall. */
interface Block {
  height(width: number): number
  draw(x: number, y: number, width: number, height: number): void
  /**
   * Splits the block so its first part fits in `room` points, for content that can run
   * onto the next page (long text). Undefined when it can't split usefully there.
   */
  split?(width: number, room: number): [Block, Block] | undefined
  /** Blocks side by side, which go one under another when together they're taller than a page. */
  parts?: readonly Block[]
}

/** Splits text into lines that fit `width`, keeping the author's line breaks; over-long words are broken. */
export function wrap(canvas: Canvas, text: string, font: FontId, size: number, width: number, measure: Canvas['measure'] = (t, f, sz) => canvas.measure(t, f, sz)): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate, font, size) <= width) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = word
      // A word wider than the line is broken wherever it has to be.
      while (measure(line, font, size) > width && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && measure(line.slice(0, cut), font, size) > width) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line)
  }
  // Drop trailing blank lines, keep blank lines between paragraphs.
  while (lines.length > 1 && lines.at(-1) === '') lines.pop()
  return lines
}

// ---- Ability text with action and die icons ----

/** Private-use characters standing for icons in laid-out text: actions from U+E000, dice from U+E010. */
const marker = (action: Action) => String.fromCharCode(0xe000 + ACTIONS.indexOf(action))
const dieMarker = (die: Die) => String.fromCharCode(0xe010 + DICE.indexOf(die))
const MARKER = /[\ue000-\ue01f]/g
const iconSize = (size: number) => size * 1.1
const ICON_GAP = 1.5

/**
 * The text with an icon marker before each action word that's an effect
 * (../../creation/effects.ts), and each die size ("d8") replaced by its die's marker.
 */
export function markEffects(raw: string): string {
  // The player's own text can't bring its own markers.
  const text = raw.replace(MARKER, '')
  let out = ''
  let at = 0
  for (const m of effectMentions(text)) {
    out += text.slice(at, m.start) + marker(m.action)
    at = m.start
  }
  return (out + text.slice(at)).replace(/\bd(4|6|8|10|12)\b/g, (die) => dieMarker(die as Die))
}

/** Measures text that may hold icon markers. */
const richMeasure =
  (canvas: Canvas): Canvas['measure'] =>
  (text, font, size) =>
    canvas.measure(text.replace(MARKER, ''), font, size) + (text.match(MARKER)?.length ?? 0) * (iconSize(size) + ICON_GAP)

/** Draws a line that may hold icon markers: text runs with the icons between them. */
function drawRich(canvas: Canvas, line: string, x: number, y: number, font: FontId, size: number, color: string) {
  let cx = x
  for (const part of line.split(/([\ue000-\ue01f])/)) {
    if (!part) continue
    const code = part.charCodeAt(0) - 0xe000
    const isMarker = part.length === 1 && code >= 0 && code < 0x20
    const icon: IconName | undefined = !isMarker ? undefined : code < ACTIONS.length ? `action/${ACTIONS[code]!}` : code >= 0x10 && code - 0x10 < DICE.length ? `die/${DICE[code - 0x10]!}` : undefined
    if (icon) {
      canvas.icon(icon, cx, y - size * 0.1, iconSize(size))
      cx += iconSize(size) + ICON_GAP
    } else if (isMarker) {
      // A marker with no icon (none should occur) takes no space.
    } else {
      canvas.text(part, cx, y, font, size, color)
      cx += canvas.measure(part, font, size)
    }
  }
}

class Layout {
  /** Where the next block goes on the current page. */
  private y = MARGIN
  /** Where the current page's content starts: below a repeated band title, if it has one. */
  private top = MARGIN
  readonly canvas: Canvas
  readonly contentWidth: number
  private readonly bottom: number

  constructor(canvas: Canvas) {
    this.canvas = canvas
    this.contentWidth = canvas.width - 2 * MARGIN
    this.bottom = canvas.height - MARGIN - 14 // room for the footer
    this.page()
  }

  private page() {
    this.canvas.addPage()
    this.canvas.rect(0, 0, this.canvas.width, this.canvas.height, { fill: COLORS.page })
    this.y = MARGIN
    this.top = MARGIN
  }

  /**
   * Places a block below the last. One that doesn't fit goes to a new page; one too tall
   * for any page splits (or, for columns, goes a column at a time). `continuation` is
   * drawn first on any new page this starts, e.g. a band's title bar.
   */
  place(block: Block, gapAfter = GAP, continuation?: Block) {
    const w = this.contentWidth
    const newPage = () => {
      this.page()
      if (continuation) {
        const ch = continuation.height(w)
        continuation.draw(MARGIN, this.y, w, ch)
        this.y += ch
        this.top = this.y
      }
    }
    let next: Block | undefined = block
    while (next) {
      const b: Block = next
      next = undefined
      const h = b.height(w)
      if (this.y + h <= this.bottom) {
        b.draw(MARGIN, this.y, w, h)
        this.y += h + gapAfter
      } else if (h <= this.bottom - this.top && this.y > this.top) {
        // It fits on a page of its own, so it moves there whole.
        newPage()
        next = b
      } else if (b.parts) {
        // Too tall even for a page of its own: its columns go one after another.
        b.parts.filter((p) => p.height(w) > 0).forEach((p) => this.place(p, gapAfter, continuation))
      } else {
        const split = b.split?.(w, this.bottom - this.y)
        if (split) {
          const first = split[0].height(w)
          split[0].draw(MARGIN, this.y, w, first)
          newPage()
          next = split[1]
        } else if (this.y > this.top) {
          newPage()
          next = b
        } else {
          // Taller than a page and can't split: draw it anyway rather than lose it.
          b.draw(MARGIN, this.y, w, h)
          this.y += h + gapAfter
        }
      }
    }
  }

  /** "Name · page 1 of 2" on every page. */
  footers(name: string) {
    const total = this.canvas.pageCount
    for (let i = 0; i < total; i++) {
      this.canvas.setPage(i)
      const label = `${name} · page ${i + 1} of ${total}`
      const w = this.canvas.measure(label, 'regular', SMALL)
      this.canvas.text(label, this.canvas.width - MARGIN - w, this.canvas.height - MARGIN, 'regular', SMALL, COLORS.muted)
    }
  }
}

// ---- Building blocks ----

const spacer = (h: number): Block => ({ height: () => h, draw: () => {} })

/** Lines of wrapped text in one font. */
function paragraph(canvas: Canvas, text: string, opts: { font?: FontId; size?: number; color?: string } = {}): Block {
  const font = opts.font ?? 'regular'
  const size = opts.size ?? BODY
  const lineHeight = size * 1.3
  return {
    height: (w) => wrap(canvas, text, font, size, w).length * lineHeight,
    draw: (x, y, w) => wrap(canvas, text, font, size, w).forEach((line, i) => canvas.text(line, x, y + i * lineHeight, font, size, opts.color ?? COLORS.text)),
  }
}

/** Blocks stacked with a gap between them. */
function stack(blocks: readonly Block[], gap = 4): Block {
  const heights = (w: number) => blocks.map((b) => b.height(w))
  return {
    height: (w) => {
      const hs = heights(w)
      return hs.reduce((a, b) => a + b, 0) + gap * Math.max(0, hs.length - 1)
    },
    draw: (x, y, w) => {
      let top = y
      for (const b of blocks) {
        const h = b.height(w)
        b.draw(x, top, w, h)
        top += h + gap
      }
    },
    // Breaks between blocks, or inside the first block that doesn't fit if it can split.
    split: (w, room) => {
      let used = 0
      for (let i = 0; i < blocks.length; i++) {
        const h = blocks[i]!.height(w)
        if (used + h <= room) {
          used += h + gap
          continue
        }
        const inner = blocks[i]!.split?.(w, room - used)
        if (inner) return [stack([...blocks.slice(0, i), inner[0]], gap), stack([inner[1], ...blocks.slice(i + 1)], gap)]
        return i > 0 ? [stack(blocks.slice(0, i), gap), stack(blocks.slice(i), gap)] : undefined
      }
      return undefined
    },
  }
}

/** Blocks side by side in equal columns, all as tall as the tallest. */
function columns(blocks: readonly Block[], gap = GAP): Block {
  const colWidth = (w: number) => (w - gap * (blocks.length - 1)) / blocks.length
  return {
    height: (w) => Math.max(...blocks.map((b) => b.height(colWidth(w)))),
    draw: (x, y, w, h) => blocks.forEach((b, i) => b.draw(x + i * (colWidth(w) + gap), y, colWidth(w), h)),
    parts: blocks,
  }
}

/** Rows of up to `perRow` columns. */
function grid(blocks: readonly Block[], perRow: number): Block[] {
  const rows: Block[] = []
  for (let i = 0; i < blocks.length; i += perRow) {
    const row = blocks.slice(i, i + perRow)
    // Pad a short last row so its columns keep the same width.
    while (row.length < perRow) row.push(spacer(0))
    rows.push(columns(row))
  }
  return rows
}

/** A peach panel with a heading and a black border with an offset shadow. Splits when its content does. */
function panel(canvas: Canvas, title: string, content: Block, fill: string = COLORS.panel): Block {
  const titleSize = 11
  const titleBlock = paragraph(canvas, title, { font: 'boldItalic', size: titleSize, color: COLORS.heading })
  const inner = (w: number) => w - 2 * PAD - 2
  const chrome = (w: number) => 2 * PAD + titleBlock.height(inner(w)) + 4
  return {
    height: (w) => chrome(w) + content.height(inner(w)),
    draw: (x, y, w, h) => {
      canvas.rect(x + 2.5, y + 2.5, w - 2, h - 2, { fill: COLORS.border })
      canvas.rect(x, y, w - 2, h - 2, { fill, stroke: COLORS.border, lineWidth: 1.5 })
      const th = titleBlock.height(inner(w))
      titleBlock.draw(x + PAD, y + PAD, inner(w), th)
      content.draw(x + PAD, y + PAD + th + 4, inner(w), content.height(inner(w)))
    },
    split: (w, room) => {
      const parts = content.split?.(inner(w), room - chrome(w))
      return parts && [panel(canvas, title, parts[0], fill), panel(canvas, title.endsWith(' (continued)') ? title : `${title} (continued)`, parts[1], fill)]
    },
  }
}

/** One line of a fields block: the label's line (if any) beside the value's line. */
interface FieldLine {
  label: string
  value: string
}

/** Lines laid out by `fields`, drawn a line at a time so they can split between pages. */
function fieldLines(canvas: Canvas, lines: readonly FieldLine[], labelWidth: number): Block {
  return {
    height: () => lines.length * LINE,
    draw: (x, y) =>
      lines.forEach((line, i) => {
        if (line.label) canvas.text(line.label, x, y + i * LINE, 'bold', BODY, COLORS.text)
        if (line.value) canvas.text(line.value, x + labelWidth, y + i * LINE, 'regular', BODY, COLORS.text)
      }),
    split: (_w, room) => {
      const fit = Math.floor(room / LINE)
      // At least two lines on each side of the break, so nothing is left on its own.
      if (fit < 2 || lines.length - fit < 2) return undefined
      return [fieldLines(canvas, lines.slice(0, fit), labelWidth), fieldLines(canvas, lines.slice(fit), labelWidth)]
    },
  }
}

/** "Label: value" rows, the label in bold; a long label wraps in its column, and long values can run onto the next page. */
function fields(canvas: Canvas, rows: readonly (readonly [string, string])[]): Block {
  const labelWidth = (w: number) => Math.min(w * 0.38, Math.max(...rows.map(([l]) => canvas.measure(`${l}:`, 'bold', BODY))) + 6)
  const lines = (w: number): FieldLine[] =>
    rows.flatMap(([label, value]) => {
      const ls = wrap(canvas, `${label}:`, 'bold', BODY, labelWidth(w) - 6)
      const vs = wrap(canvas, value, 'regular', BODY, w - labelWidth(w))
      return Array.from({ length: Math.max(ls.length, vs.length) }, (_, i) => ({ label: ls[i] ?? '', value: vs[i] ?? '' }))
    })
  return {
    height: (w) => lines(w).length * LINE,
    draw: (x, y, w, h) => fieldLines(canvas, lines(w), labelWidth(w)).draw(x, y, w, h),
    split: (w, room) => fieldLines(canvas, lines(w), labelWidth(w)).split!(w, room),
  }
}

const ICON = 15
const ROW = 18

/** A die, shown as its icon alone, right-aligned at `right`. */
function drawDie(canvas: Canvas, die: Die, right: number, y: number) {
  canvas.icon(`die/${die}`, right - ICON, y - 1.5, ICON)
}

/** Name and die rows, as on the sheet's Powers and Qualities tables. */
function traitTable(canvas: Canvas, traits: readonly HeroTrait[], empty: string): Block {
  if (traits.length === 0) return paragraph(canvas, empty, { color: COLORS.muted })
  const dieWidth = ICON + 6
  const nameLines = (w: number, t: HeroTrait) => wrap(canvas, t.name, 'regular', BODY, w - dieWidth)
  const rowHeight = (w: number, t: HeroTrait) => Math.max(ROW, nameLines(w, t).length * LINE + 6)
  return {
    height: (w) => traits.reduce((sum, t) => sum + rowHeight(w, t), 0),
    draw: (x, y, w) => {
      let top = y
      traits.forEach((t, i) => {
        const h = rowHeight(w, t)
        if (i > 0) canvas.rect(x, top, w, 0.5, { fill: COLORS.border })
        nameLines(w, t).forEach((line, j) => canvas.text(line, x, top + 4 + j * LINE, 'regular', BODY, COLORS.text))
        drawDie(canvas, t.die, x + w, top + 2.5)
        top += h
      })
    },
  }
}

/**
 * Powers, qualities, and status dice in one six-column table (../../creation/dice-table.ts):
 * a name and its die for each, with the status rows in their zone colours.
 */
function diceTable(canvas: Canvas, sheet: HeroSheet): Block {
  const rows = diceTableRows(sheet)
  const dieW = ICON + 8
  const statusW = 44
  const nameW = (w: number) => (w - 3 * dieW - statusW) / 2
  const lines = (w: number, t: HeroTrait | undefined) => (t ? wrap(canvas, t.name, 'regular', BODY, nameW(w) - 4) : [])
  const rowHeight = (w: number, r: DiceTableRow) => Math.max(ROW + 2, Math.max(lines(w, r.power).length, lines(w, r.quality).length) * LINE + 8)
  const HEAD = 16
  return {
    height: (w) => HEAD + rows.reduce((sum, r) => sum + rowHeight(w, r), 0),
    draw: (x, y, w, h) => {
      const qx = x + nameW(w) + dieW
      const sx = qx + nameW(w) + dieW
      canvas.text('Power', x, y + 2, 'bold', BODY, COLORS.text)
      canvas.text('Quality', qx + 4, y + 2, 'bold', BODY, COLORS.text)
      canvas.text('Status', sx + 4, y + 2, 'bold', BODY, COLORS.text)
      let top = y + HEAD
      rows.forEach((r) => {
        const rh = rowHeight(w, r)
        canvas.rect(x, top, w, 0.5, { fill: COLORS.border })
        if (r.status) {
          canvas.rect(sx, top, statusW + dieW, rh, { fill: COLORS.zone[r.status.zone] })
          canvas.text(ZONE_LABEL[r.status.zone], sx + 4, top + 5, 'bold', BODY, COLORS.zoneStrong[r.status.zone])
          if (r.status.die) drawDie(canvas, r.status.die, sx + statusW + dieW - 4, top + 4)
          else canvas.text('—', sx + statusW + 4, top + 5, 'regular', BODY, COLORS.muted)
        }
        lines(w, r.power).forEach((line, j) => canvas.text(line, x, top + 5 + j * LINE, 'regular', BODY, COLORS.text))
        if (r.power) drawDie(canvas, r.power.die, x + nameW(w) + dieW - 4, top + 4)
        lines(w, r.quality).forEach((line, j) => canvas.text(line, qx + 4, top + 5 + j * LINE, 'regular', BODY, COLORS.text))
        if (r.quality) drawDie(canvas, r.quality.die, qx + nameW(w) + dieW - 4, top + 4)
        top += rh
      })
      // Rules between the three pairs of columns.
      canvas.rect(qx, y, 0.5, h, { fill: COLORS.border })
      canvas.rect(sx, y, 0.5, h, { fill: COLORS.border })
    },
  }
}

/** The three status dice in their zone colours. */
function statusDice(canvas: Canvas, dice: Record<Zone, Die>): Block {
  const h = 40
  return {
    height: () => h,
    draw: (x, y, w) => {
      const boxW = (w - 2 * 6) / 3
      ZONES.forEach((zone, i) => {
        const bx = x + i * (boxW + 6)
        canvas.rect(bx, y, boxW, h, { fill: COLORS.zone[zone], stroke: COLORS.border, lineWidth: 1 })
        const label = ZONE_LABEL[zone]
        canvas.text(label, bx + (boxW - canvas.measure(label, 'bold', SMALL)) / 2, y + 4, 'bold', SMALL, COLORS.zoneStrong[zone])
        drawDie(canvas, dice[zone], bx + (boxW + ICON) / 2, y + 17)
      })
    },
  }
}

function health(canvas: Canvas, sheet: HeroSheet): Block {
  if (sheet.maxHealth === undefined) return paragraph(canvas, 'Not worked out yet.', { color: COLORS.muted })
  const ranges = sheet.healthRanges
  const max = paragraph(canvas, `Max Health ${sheet.maxHealth}`, { font: 'bold', size: 12 })
  if (!ranges) return max
  const chips: Block = {
    height: () => 22,
    draw: (x, y, w) => {
      const chipW = (w - 2 * 6) / 3
      ZONES.forEach((zone, i) => {
        const cx = x + i * (chipW + 6)
        canvas.rect(cx, y, chipW, 22, { fill: COLORS.zone[zone], stroke: COLORS.border, lineWidth: 1 })
        const label = `${ZONE_LABEL[zone]} ${ranges[zone][0]}–${ranges[zone][1]}`
        canvas.text(label, cx + (chipW - canvas.measure(label, 'bold', SMALL)) / 2, y + 7, 'bold', SMALL, COLORS.zoneStrong[zone])
      })
    },
  }
  return stack([max, chips], 6)
}

/** One ability row: type badge with the effects' icons under it, name, and game text with inline action icons, on the zone's colour. Very long text splits by line. */
function abilityRow(canvas: Canvas, a: { name: string; type: AbilityType; text: string }, fill: string): Block {
  const typeW = 32
  const EFFECT = 12
  const effects = abilityEffects(a.text)
  // The badge on top, then the effects two to a row.
  const firstCellHeight = LINE + 1 + (effects.length ? 2 + Math.ceil(effects.length / 2) * (EFFECT + 2) : 0)
  const nameW = (w: number) => Math.min(120, w * 0.28)
  const textW = (w: number) => w - typeW - nameW(w) - 2 * PAD - 8
  const measure = richMeasure(canvas)
  const marked = markEffects(a.text)
  const lines = (w: number) => ({ name: wrap(canvas, a.name, 'bold', BODY, nameW(w)), text: wrap(canvas, marked, 'regular', BODY, textW(w), measure) })
  /** The row from its lines; a continuation (`first` false) has neither badge, effects nor name. */
  const row = (get: (w: number) => { name: string[]; text: string[] }, first: boolean): Block => ({
    height: (w) => Math.max(Math.max(get(w).name.length, get(w).text.length) * LINE, first ? firstCellHeight : 0) + 8,
    draw: (x, y, w, h) => {
      canvas.rect(x, y, w, h, { fill, stroke: COLORS.border, lineWidth: 0.5 })
      if (first) {
        // The type's letter, as on the printed sheet (A, R, I, or A/I).
        const bx = x + PAD / 2
        const bw = typeW - 6
        canvas.rect(bx, y + 3, bw, LINE + 1, { fill: '#ffffff', stroke: COLORS.border, lineWidth: 0.5 })
        canvas.text(a.type, bx + (bw - canvas.measure(a.type, 'bold', SMALL)) / 2, y + 3 + (LINE + 1 - SMALL) / 2, 'bold', SMALL, COLORS.text)
        effects.forEach((effect, i) => canvas.icon(`action/${effect}`, bx + (i % 2) * (EFFECT + 2), y + 3 + LINE + 3 + Math.floor(i / 2) * (EFFECT + 2), EFFECT))
      }
      const { name, text } = get(w)
      name.forEach((line, i) => canvas.text(line, x + typeW + PAD / 2, y + 4 + i * LINE, 'bold', BODY, COLORS.text))
      text.forEach((line, i) => drawRich(canvas, line, x + typeW + nameW(w) + PAD, y + 4 + i * LINE, 'regular', BODY, COLORS.text))
    },
    split: (w, room) => {
      const { name, text } = get(w)
      const fit = Math.floor((room - 8) / LINE)
      if (fit < 2 || Math.max(name.length, text.length) - fit < 2 || (first && fit * LINE < firstCellHeight)) return undefined
      return [row(() => ({ name: name.slice(0, fit), text: text.slice(0, fit) }), first), row(() => ({ name: name.slice(fit), text: text.slice(fit) }), false)]
    },
  })
  return row(lines, true)
}

/** A zone's title bar. */
function zoneBar(canvas: Canvas, title: string, color: string, fill: string): Block {
  return {
    height: () => 16,
    draw: (x, y, w) => {
      canvas.rect(x, y, w, 16, { fill, stroke: COLORS.border, lineWidth: 1 })
      canvas.text(title, x + PAD / 2, y + 3.5, 'boldItalic', 10, color)
    },
  }
}

/** Keeps a block on the same page as the one after it. */
function keepTogether(first: Block, second: Block): Block {
  return {
    height: (w) => first.height(w) + second.height(w),
    draw: (x, y, w) => {
      const h1 = first.height(w)
      first.draw(x, y, w, h1)
      second.draw(x, y + h1, w, second.height(w))
    },
    // The first block stays whole; a long second one can split below it.
    split: (w, room) => {
      const parts = second.split?.(w, room - first.height(w))
      return parts && [keepTogether(first, parts[0]), parts[1]]
    },
  }
}

const sectionHeading = (canvas: Canvas, title: string) => paragraph(canvas, title, { font: 'boldItalic', size: 14, color: COLORS.heading })

/** Places the ability bands, a row at a time so a long list can run onto the next page. */
function placeAbilities(layout: Layout, sheet: HeroSheet) {
  const { canvas } = layout
  const heading = sectionHeading(canvas, 'Abilities')
  ZONES.forEach((zone, z) => {
    // Principle abilities end the Green band, as on the printed sheet.
    const list = sheet.abilities.filter((a) => a.zone === zone).sort((a, b) => Number(a.source === 'principle') - Number(b.source === 'principle'))
    const bar = zoneBar(canvas, ZONE_LABEL[zone], COLORS.zoneStrong[zone], COLORS.zone[zone])
    const rows = list.length ? list.map((a) => abilityRow(canvas, a, COLORS.zone[zone])) : [abilityRowText(canvas, 'None yet.', COLORS.zone[zone])]
    // The section heading stays with the first band's title and first row.
    const first = keepTogether(bar, rows[0]!)
    layout.place(z === 0 ? keepTogether(stack([heading, spacer(0)], 4), first) : first, 0)
    const continued = zoneBar(canvas, `${ZONE_LABEL[zone]} (continued)`, COLORS.zoneStrong[zone], COLORS.zone[zone])
    rows.slice(1).forEach((r) => layout.place(r, 0, continued))
    layout.place(spacer(4), 0)
  })
  layout.place(keepTogether(zoneBar(canvas, 'Out', COLORS.text, COLORS.zone.out), sheet.outAbility ? outRow(canvas, sheet.outAbility) : abilityRowText(canvas, 'Choose a personality.', COLORS.zone.out)))
}

/** The Out ability's row: its text, with an icon before each effect word. */
function outRow(canvas: Canvas, text: string): Block {
  const measure = richMeasure(canvas)
  const lines = (w: number) => wrap(canvas, markEffects(text), 'regular', BODY, w - 2 * PAD, measure)
  return {
    height: (w) => lines(w).length * LINE + 8,
    draw: (x, y, w, h) => {
      canvas.rect(x, y, w, h, { fill: COLORS.zone.out, stroke: COLORS.border, lineWidth: 0.5 })
      lines(w).forEach((line, i) => drawRich(canvas, line, x + PAD, y + 4 + i * LINE, 'regular', BODY, COLORS.text))
    },
  }
}

/** A plain text row in a band, for empty bands and an Out ability not chosen yet. */
function abilityRowText(canvas: Canvas, text: string, fill: string): Block {
  const lines = (w: number) => wrap(canvas, text, 'regular', BODY, w - 2 * PAD)
  return {
    height: (w) => lines(w).length * LINE + 8,
    draw: (x, y, w, h) => {
      canvas.rect(x, y, w, h, { fill, stroke: COLORS.border, lineWidth: 0.5 })
      lines(w).forEach((line, i) => canvas.text(line, x + PAD, y + 4 + i * LINE, 'regular', BODY, COLORS.text))
    },
  }
}

function auxiliaryBlocks(canvas: Canvas, sheet: HeroSheet): Block[] {
  const blocks: Block[] = []
  const { divided } = sheet
  if (divided && (divided.heroicPersonality || sheet.heroicStatusDice || divided.heroicTraits || divided.split)) {
    const parts: Block[] = []
    if (divided.heroicPersonality) parts.push(fields(canvas, [['Heroic form personality', divided.heroicPersonality]]))
    if (sheet.heroicStatusDice) parts.push(paragraph(canvas, 'Heroic form status dice', { font: 'bold' }), statusDice(canvas, sheet.heroicStatusDice))
    if (divided.heroicTraits) parts.push(paragraph(canvas, 'Heroic form powers and qualities', { font: 'bold' }), traitTable(canvas, divided.heroicTraits, 'None yet.'))
    if (divided.split) {
      const list = (names: readonly string[]) => names.join(', ') || '—'
      parts.push(fields(canvas, [['Always', list(divided.split.always)], ['Civilian form', list(divided.split.civilian)], ['Heroic form', list(divided.split.heroic)]]))
    }
    blocks.push(panel(canvas, 'Divided', stack(parts)))
  }
  for (const form of sheet.forms) {
    const parts = [traitTable(canvas, form.traits, 'No traits yet.')]
    if (form.ability) parts.push(abilityRow(canvas, form.ability, COLORS.zone[form.zone]))
    blocks.push(panel(canvas, `${form.name} (${ZONE_LABEL[form.zone]} form)`, stack(parts, 6)))
  }
  for (const mode of sheet.modes) {
    const parts = [traitTable(canvas, mode.traits, 'No traits yet.')]
    if (mode.cannot.length > 0 || mode.immobile) parts.push(paragraph(canvas, modeLimits(mode.cannot, mode.immobile), { font: 'bold' }))
    if (mode.ability) parts.push(abilityRow(canvas, mode.ability, COLORS.zone[mode.zone]))
    blocks.push(panel(canvas, `${mode.name} (${ZONE_LABEL[mode.zone]} mode)`, stack(parts, 6)))
  }
  if (sheet.powerlessMode) blocks.push(panel(canvas, 'Powerless mode', traitTable(canvas, sheet.powerlessMode, 'No traits yet.')))
  if (sheet.minionForms.length) {
    blocks.push(panel(canvas, 'Minion forms', fields(canvas, sheet.minionForms.map((f) => [`${f.name} (+${f.minBonus})`, f.effect] as const))))
  }
  return blocks
}

/** Lays the hero's sheet out on the canvas, adding pages as needed. */
export function layoutHero(canvas: Canvas, hero: Hero): void {
  const sheet = buildSheet(hero)
  const layout = new Layout(canvas)
  const name = heroDisplayName(hero)
  const c = sheet.characteristics

  // Name, alias and player across the top.
  const header: Block[] = [paragraph(canvas, name, { font: 'boldItalic', size: 22, color: COLORS.heading })]
  const sub = [hero.details.alias.trim() && hero.details.name.trim() ? hero.details.alias.trim() : '', hero.details.player.trim() ? `Player: ${hero.details.player.trim()}` : '']
    .filter(Boolean)
    .join('  ·  ')
  if (sub) header.push(paragraph(canvas, sub, { color: COLORS.muted }))
  layout.place(stack(header, 2))

  const characteristics = panel(canvas, 'Characteristics', fields(canvas, [
    ['Background', c.background ?? '—'],
    ['Power source', c.powerSource ?? '—'],
    ['Archetype', c.archetype ?? '—'],
    ['Personality', c.personality ?? '—'],
  ]))
  const details = DETAIL_FIELDS.filter((f) => f !== 'name' && f !== 'alias' && f !== 'player' && hero.details[f].trim())
  layout.place(details.length ? columns([characteristics, panel(canvas, 'Details', fields(canvas, details.map((f) => [DETAIL_LABEL[f], hero.details[f].trim()] as const)))]) : characteristics)

  layout.place(panel(canvas, 'Powers, qualities, and status', diceTable(canvas, sheet)))
  layout.place(panel(canvas, 'Health', health(canvas, sheet)))

  const principles = sheet.principles.map((p) =>
    panel(canvas, p.name, fields(canvas, [
      ['During roleplaying', p.roleplaying],
      ['Minor twist', p.minorTwist],
      ['Major twist', p.majorTwist],
    ])),
  )
  if (principles.length) grid(principles, 2).forEach((row) => layout.place(row))
  else layout.place(panel(canvas, 'Principles', paragraph(canvas, 'No principles yet.', { color: COLORS.muted })))

  placeAbilities(layout, sheet)

  const aux = auxiliaryBlocks(canvas, sheet)
  if (aux.length) {
    layout.place(keepTogether(stack([sectionHeading(canvas, 'Auxiliary sheet'), spacer(0)], 4), aux[0]!))
    aux.slice(1).forEach((b) => layout.place(b))
  }

  const adv = sheet.advancement
  if (adv && (adv.collections.length > 0 || adv.changes.length > 0 || adv.backIssues > 0)) {
    const parts: Block[] = [fields(canvas, [['Back issues', String(adv.backIssues)]])]
    adv.collections.forEach((col, i) => parts.push(fields(canvas, [[`Collection ${i + 1}`, [col.name.trim() || '—', col.notes?.trim()].filter(Boolean).join('\n')]])))
    adv.changes.forEach((change) => parts.push(paragraph(canvas, `• ${change}`)))
    layout.place(panel(canvas, 'Advancement', stack(parts)))
  }

  layout.footers(name)
}
