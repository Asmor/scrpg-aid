/**
 * The hero's JSON carried inside a readable export, so the file can be imported back: in an
 * HTML comment at the end of a Markdown file, or in a JSON script tag in an HTML file.
 */
import type { Hero } from '../hero/model'
import { toSaved } from '../hero/serialize'

export const EMBED_MARKER = 'scrpg-hero'

/**
 * The hero's JSON, safe to put inside an HTML comment or script tag: "--", "<", ">" and "&"
 * only ever appear inside JSON strings, where their \u escapes read back the same. A sheet
 * export carries the hero without their game-aid play state (the JSON backup keeps it).
 */
export function embeddableJson(hero: Hero): string {
  const { play: _, ...sheetHero } = hero
  return JSON.stringify(toSaved(sheetHero))
    .replace(/-(?=-)/g, '\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

/** The comment that ends a Markdown export. */
export function markdownPayload(hero: Hero): string {
  return `<!-- ${EMBED_MARKER}\n${embeddableJson(hero)}\n-->`
}

const OPEN = `<!-- ${EMBED_MARKER}`

/** An HTML export's script tag (see ./html.tsx). */
export const SCRIPT_OPEN = `<script type="application/json" id="${EMBED_MARKER}">`

/**
 * The JSON embedded in an exported file, if it has some: a Markdown export's comment, or an
 * HTML export's script tag. Either comes last, so the last opening is the real one: the
 * player's own text may contain the same characters (escaped as Markdown or HTML, but
 * still there to a plain search). The embedded JSON itself can't hold an opening or a close.
 */
export function extractEmbedded(text: string): string | undefined {
  // Whichever kind of opening comes last is the file's own.
  const [open, close] = text.lastIndexOf(SCRIPT_OPEN) > text.lastIndexOf(OPEN) ? [SCRIPT_OPEN, '</script>'] : [OPEN, '-->']
  const start = text.lastIndexOf(open)
  if (start < 0) return undefined
  const end = text.indexOf(close, start + open.length)
  return end < 0 ? undefined : text.slice(start + open.length, end)
}
