/**
 * Character colors (scrpg-aid-designs/character-colors/spec.md): the 13-color palette from
 * data/colors.json, what each thing's colors are, and which ink reads on them. Pure.
 *
 * These never stand for a game zone: `--game-*` still means only that.
 */
import colorsJson from '../../data/colors.json'
import type { Theme } from '../theme/theme'

export const CHAR_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'pink', 'brown', 'grey', 'offblack', 'offwhite'] as const
export type CharColor = (typeof CHAR_COLORS)[number]

export const GRADIENTS = ['vertical', 'horizontal', 'diagonalRight', 'diagonalLeft', 'radial'] as const
export type Gradient = (typeof GRADIENTS)[number]

export interface Appearance {
  primary: CharColor
  secondary?: CharColor
  gradient?: Gradient
  invert?: boolean
}

export interface PaletteColor {
  id: CharColor
  name: string
  light: { fill: string; ink: string }
  dark: { fill: string; ink: string }
}

export const PALETTE = colorsJson.colors as PaletteColor[]

export const colorOf = (id: CharColor): PaletteColor => PALETTE.find((c) => c.id === id)!
export const colorName = (id: CharColor) => colorOf(id).name

export const GRADIENT_NAME: Record<Gradient, string> = { vertical: 'Vertical', horizontal: 'Horizontal', diagonalRight: 'Diagonal right', diagonalLeft: 'Diagonal left', radial: 'Radial' }

// ---- Sides, and what each thing's colors are ----

export type Side = 'gm' | 'heroes' | 'environment'

/** Each side's color: the ring on its chips, and the "By side" default. */
export const SIDE_COLOR: Record<Side, CharColor> = { gm: 'red', heroes: 'blue', environment: 'green' }

export type ColoredItem =
  | { kind: 'hero'; appearance?: Appearance | undefined }
  | { kind: 'villain'; appearance?: Appearance | undefined }
  /** A group or challenge: `environment` when the environment owns it. */
  | { kind: 'group' | 'challenge'; environment?: boolean; color?: CharColor | undefined }
  | { kind: 'environment'; color?: CharColor | undefined }
  /** A hero's own minion: its color, or the hero's primary. */
  | { kind: 'heroMinion'; color?: CharColor | undefined; heroPrimary: CharColor }

export function side(item: ColoredItem): Side {
  switch (item.kind) {
    case 'hero':
    case 'heroMinion':
      return 'heroes'
    case 'villain':
      return 'gm'
    case 'environment':
      return 'environment'
    default:
      return item.environment ? 'environment' : 'gm'
  }
}

/** The colors to draw: defaults and "by side" resolved. */
export function appearanceOf(item: ColoredItem): Appearance {
  switch (item.kind) {
    case 'hero':
      return item.appearance ?? { primary: 'blue' }
    case 'villain':
      return item.appearance ?? { primary: 'red' }
    case 'heroMinion':
      return { primary: item.color ?? item.heroPrimary }
    default:
      return { primary: item.color ?? SIDE_COLOR[side(item)] }
  }
}

// ---- Drawing them ----

/** The fill's two ends, in order. */
function ends(a: Appearance): [CharColor, CharColor] {
  const second = a.secondary ?? a.primary
  return a.invert ? [second, a.primary] : [a.primary, second]
}

/** A fill in the given color's terms: `paint` is a token or a hex. */
function fillWith(a: Appearance, paint: (c: CharColor) => string): string {
  if (!a.secondary) return paint(a.primary)
  const [from, to] = ends(a)
  const stops = `${paint(from)}, ${paint(to)}`
  switch (a.gradient ?? 'vertical') {
    case 'horizontal':
      return `linear-gradient(to right, ${stops})`
    case 'diagonalRight':
      return `linear-gradient(to bottom right, ${stops})`
    case 'diagonalLeft':
      return `linear-gradient(to bottom left, ${stops})`
    case 'radial':
      return `radial-gradient(circle at center, ${stops})`
    default:
      return `linear-gradient(to bottom, ${stops})`
  }
}

/** The CSS for a fill, in tokens, so it follows the theme. */
export const fillCss = (a: Appearance) => fillWith(a, (c) => `var(--char-${c})`)

const DARK_INK = '#1A1D2B'
const WHITE_INK = '#FFFFFF'

const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The WCAG contrast ratio between two colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The text on a fill: whichever ink has the better worst-case contrast against its colors, and the other as its outline. */
export function colorText(a: Appearance, theme: Theme): { ink: string; outline: string } {
  const fills = [a.primary, ...(a.secondary ? [a.secondary] : [])].map((c) => colorOf(c)[theme].fill)
  const worst = (ink: string) => Math.min(...fills.map((f) => contrast(ink, f)))
  return worst(WHITE_INK) > worst(DARK_INK) ? { ink: WHITE_INK, outline: DARK_INK } : { ink: DARK_INK, outline: WHITE_INK }
}

/**
 * The inline style for something filled with these colors (`.char-fill` in src/index.css): the fill
 * in tokens, and both themes' inks for the stylesheet to choose between.
 */
export function fillStyle(a: Appearance): Record<string, string> {
  const light = colorText(a, 'light')
  const dark = colorText(a, 'dark')
  return { background: fillCss(a), '--char-text-light': light.ink, '--char-line-light': light.outline, '--char-text-dark': dark.ink, '--char-line-dark': dark.outline }
}

/** "Blue and Cyan, diagonal right.", for the history. */
export function appearanceText(a: Appearance): string {
  if (!a.secondary) return `${colorName(a.primary)}.`
  const [from, to] = ends(a)
  return `${colorName(from)} and ${colorName(to)}, ${GRADIENT_NAME[a.gradient ?? 'vertical'].toLowerCase()}.`
}

/** Colors tidied for saving: a gradient only goes with a secondary. */
export function cleanAppearance(a: Appearance): Appearance {
  if (!a.secondary) return { primary: a.primary }
  return { primary: a.primary, secondary: a.secondary, ...(a.gradient && a.gradient !== 'vertical' ? { gradient: a.gradient } : {}), ...(a.invert ? { invert: true } : {}) }
}

export const sameAppearance = (a: Appearance, b: Appearance) => JSON.stringify(cleanAppearance(a)) === JSON.stringify(cleanAppearance(b))
