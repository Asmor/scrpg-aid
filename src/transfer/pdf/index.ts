/**
 * The PDF export as the app loads it: pdf-lib, the fonts and the die icons are only
 * fetched when a PDF is made (they're precached, so this works offline).
 */
// DejaVu Sans Condensed: Latin, Greek and Cyrillic; its licence ships in public/fonts.
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf?url'
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf?url'
import boldItalicUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed-BoldOblique.ttf?url'
import type { Hero } from '../../hero/model'
import type { Die } from '../../rules/types'
import type { PageSize } from './page-size'
import { heroPdf, type PdfAssets } from './render'

const DICE: readonly Die[] = ['d4', 'd6', 'd8', 'd10', 'd12']

async function bytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`couldn't load ${url} (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

async function loadAssets(): Promise<PdfAssets> {
  const [regular, bold, boldItalic, ...dice] = await Promise.all([regularUrl, boldUrl, boldItalicUrl, ...DICE.map((d) => `${import.meta.env.BASE_URL}icons/die/${d}.png`)].map(bytes))
  return { fonts: { regular: regular!, bold: bold!, boldItalic: boldItalic! }, dice: Object.fromEntries(DICE.map((d, i) => [d, dice[i]!])) as Record<Die, Uint8Array> }
}

export async function exportPdf(hero: Hero, pageSize: PageSize): Promise<Uint8Array<ArrayBuffer>> {
  return (await heroPdf(hero, pageSize, await loadAssets())) as Uint8Array<ArrayBuffer>
}
