/** Character colors on a card's top edge, or a small swatch before a name (scrpg-aid-designs/character-colors/spec.md, section 4). */
import { fillCss, type Appearance } from '../colors/palette'

/** A 6 px band across the top of a card: the card needs `position: relative`. */
export function CardBand({ appearance }: { appearance: Appearance }) {
  return <span className="char-card-band" style={{ background: fillCss(appearance) }} aria-hidden="true" />
}

/** A 14 px round swatch before a name. Colors never appear in accessible names. */
export function CharSwatch({ appearance }: { appearance: Appearance }) {
  return <span className="char-swatch" style={{ background: fillCss(appearance) }} aria-hidden="true" />
}
