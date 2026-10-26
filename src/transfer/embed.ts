/**
 * The hero's JSON carried inside a readable export, so the file can be imported back: in an
 * HTML comment at the end of a Markdown file, or in a JSON script tag in an HTML file.
 */
import type { Hero } from '../hero/model'
import { toSaved } from '../hero/serialize'

export const EMBED_MARKER = 'scrpg-hero'

/**
 * The hero's JSON, safe to put inside an HTML comment or script tag: "--", "<", ">" and "&"
 * only ever appear inside JSON strings, where their \u escapes read back the same.
 */
export function embeddableJson(hero: Hero): string {
  return JSON.stringify(toSaved(hero))
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

/**
 * The JSON embedded in an exported file, if it has some. The comment comes last, so the last
 * opening is the real one: the player's own text may contain the same characters (escaped
 * as Markdown, but still there to a plain search).
 */
export function extractEmbedded(text: string): string | undefined {
  const start = text.lastIndexOf(OPEN)
  if (start < 0) return undefined
  const end = text.indexOf('-->', start)
  return end < 0 ? undefined : text.slice(start + OPEN.length, end)
}
