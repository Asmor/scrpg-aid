/**
 * Draws the PDF export's layout (./layout.ts) with pdf-lib. The fonts and icons come in
 * as bytes, so this works the same in the browser and in tests. The fonts are embedded as
 * subsets (only the characters used), keeping the file small; a character the font
 * doesn't have is written as "?".
 */
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { heroDisplayName, type Hero } from '../../hero/model'
import type { IconName } from '../../components/icon-source'
import { layoutHero, type Box, type Canvas, type FontId } from './layout'
import { PAGE_SIZES, type PageSize } from './page-size'

export interface PdfAssets {
  fonts: Record<FontId, Uint8Array>
  icons: Record<IconName, Uint8Array>
}

const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)

class PdfCanvas implements Canvas {
  private pages: PDFPage[] = []
  private page: PDFPage | undefined
  private readonly charsets: Record<FontId, Set<number>>
  readonly width: number
  readonly height: number
  private readonly doc: PDFDocument
  private readonly fonts: Record<FontId, PDFFont>
  private readonly icons: Record<IconName, PDFImage>

  constructor(doc: PDFDocument, size: { width: number; height: number }, fonts: Record<FontId, PDFFont>, icons: Record<IconName, PDFImage>) {
    this.doc = doc
    this.fonts = fonts
    this.icons = icons
    this.width = size.width
    this.height = size.height
    this.charsets = { regular: new Set(fonts.regular.getCharacterSet()), bold: new Set(fonts.bold.getCharacterSet()), boldItalic: new Set(fonts.boldItalic.getCharacterSet()) }
  }

  /** Text the font can draw: other characters become "?", and whitespace a plain space. */
  private clean(text: string, font: FontId): string {
    const set = this.charsets[font]
    return Array.from(text.replace(/\s/g, ' '), (ch) => (set.has(ch.codePointAt(0)!) ? ch : '?')).join('')
  }

  get pageCount() {
    return this.pages.length
  }

  measure(text: string, font: FontId, size: number): number {
    return this.fonts[font].widthOfTextAtSize(this.clean(text, font), size)
  }

  addPage() {
    this.page = this.doc.addPage([this.width, this.height])
    this.pages.push(this.page)
  }

  setPage(index: number) {
    this.page = this.pages[index]
  }

  private current(): PDFPage {
    if (!this.page) throw new Error('no page to draw on')
    return this.page
  }

  text(text: string, x: number, y: number, font: FontId, size: number, hex: string) {
    if (!text) return
    const f = this.fonts[font]
    // Layout gives the top of the text; PDF wants the baseline, measured from the bottom.
    const baseline = this.height - y - f.heightAtSize(size, { descender: false })
    this.current().drawText(this.clean(text, font), { x, y: baseline, size, font: f, color: color(hex) })
  }

  rect(x: number, y: number, width: number, height: number, box: Box) {
    this.current().drawRectangle({
      x,
      y: this.height - y - height,
      width,
      height,
      ...(box.fill ? { color: color(box.fill) } : {}),
      ...(box.stroke ? { borderColor: color(box.stroke), borderWidth: box.lineWidth ?? 1 } : { borderWidth: 0 }),
    })
  }

  icon(name: IconName, x: number, y: number, size: number) {
    this.current().drawImage(this.icons[name], { x, y: this.height - y - size, width: size, height: size })
  }
}

/** The hero's sheet as PDF bytes. `now` is injectable for tests. */
export async function heroPdf(hero: Hero, pageSize: PageSize, assets: PdfAssets, now: Date = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts = {
    regular: await doc.embedFont(assets.fonts.regular, { subset: true }),
    bold: await doc.embedFont(assets.fonts.bold, { subset: true }),
    boldItalic: await doc.embedFont(assets.fonts.boldItalic, { subset: true }),
  }
  const icons = Object.fromEntries(await Promise.all(Object.entries(assets.icons).map(async ([name, bytes]) => [name, await doc.embedPng(bytes)] as const))) as Record<IconName, PDFImage>
  doc.setTitle(heroDisplayName(hero))
  doc.setSubject('Sentinel Comics RPG hero sheet')
  doc.setCreator('SCRPG Builder')
  doc.setCreationDate(now)
  doc.setModificationDate(now)
  layoutHero(new PdfCanvas(doc, PAGE_SIZES[pageSize], fonts, icons), hero)
  return doc.save()
}
