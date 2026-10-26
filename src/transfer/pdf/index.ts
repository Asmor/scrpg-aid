/**
 * The PDF export as the app loads it: pdf-lib and the fonts are only downloaded when a PDF
 * is made (then cached for offline use); the icons are part of the app.
 */
// DejaVu Sans Condensed: Latin, Greek and Cyrillic; its licence ships in public/fonts.
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf?url'
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf?url'
import boldItalicUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed-BoldOblique.ttf?url'
import type { Hero } from '../../hero/model'
import { fetchBytes } from '../fetch-bytes'
import { loadIconBytes } from '../icons'
import type { PageSize } from './page-size'
import { heroPdf, type PdfAssets } from './render'

async function loadAssets(): Promise<PdfAssets> {
  const [regular, bold, boldItalic, icons] = await Promise.all([fetchBytes(regularUrl), fetchBytes(boldUrl), fetchBytes(boldItalicUrl), loadIconBytes()])
  return { fonts: { regular, bold, boldItalic }, icons }
}

export async function exportPdf(hero: Hero, pageSize: PageSize): Promise<Uint8Array<ArrayBuffer>> {
  return (await heroPdf(hero, pageSize, await loadAssets())) as Uint8Array<ArrayBuffer>
}
