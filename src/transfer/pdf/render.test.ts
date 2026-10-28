/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { exampleHero } from '../../hero/example'
import type { IconName } from '../../components/icon-source'
import { ICON_NAMES } from '../icons'
import { defaultPageSize, PAGE_SIZES } from './page-size'
import { adaptiveBruiser } from '../../test/villains'
import { heroPdf, villainPdf, type PdfAssets } from './render'

const file = (path: string) => new Uint8Array(readFileSync(path))
const fonts = 'node_modules/dejavu-fonts-ttf/ttf/'
const assets: PdfAssets = {
  fonts: { regular: file(`${fonts}DejaVuSansCondensed.ttf`), bold: file(`${fonts}DejaVuSansCondensed-Bold.ttf`), boldItalic: file(`${fonts}DejaVuSansCondensed-BoldOblique.ttf`) },
  icons: Object.fromEntries(ICON_NAMES.map((name) => [name, file(`public/icons/${name}.png`)])) as Record<IconName, Uint8Array>,
}

describe('heroPdf', () => {
  it('makes a PDF of the chosen page size, titled with the hero’s name', async () => {
    for (const size of ['letter', 'a4'] as const) {
      const bytes = await heroPdf(exampleHero({ id: 'x' }), size, assets, new Date('2026-10-26T12:00:00Z'))
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
      const { width, height } = doc.getPage(0).getSize()
      expect(width).toBeCloseTo(PAGE_SIZES[size].width)
      expect(height).toBeCloseTo(PAGE_SIZES[size].height)
      expect(doc.getTitle()).toBe('Maya Reyes')
      // The fonts are embedded as subsets, so the file stays small.
      expect(bytes.length).toBeLessThan(200_000)
    }
  }, 30_000)

  it('writes characters the font lacks as "?" instead of failing', async () => {
    const hero = exampleHero({ id: 'x' })
    hero.details.name = 'Ωμέγα Жук 漢字 🦸'
    const doc = await PDFDocument.load(await heroPdf(hero, 'letter', assets))
    expect(doc.getTitle()).toBe('Ωμέγα Жук 漢字 🦸')
  }, 30_000)
})

describe('defaultPageSize', () => {
  it('uses Letter where it’s the norm and A4 elsewhere', () => {
    expect(defaultPageSize('en-US')).toBe('letter')
    expect(defaultPageSize('fr-CA')).toBe('letter')
    expect(defaultPageSize('en')).toBe('letter')
    expect(defaultPageSize('en-GB')).toBe('a4')
    expect(defaultPageSize('de')).toBe('a4')
    expect(defaultPageSize(undefined)).toBe('letter')
    expect(defaultPageSize('not a locale!')).toBe('letter')
  })
})

describe('villainPdf', () => {
  it('makes a villain sheet PDF titled with its name', async () => {
    const doc = await PDFDocument.load(await villainPdf(adaptiveBruiser(), 'letter', assets, new Date('2026-10-27T12:00:00Z')))
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(doc.getTitle()).toBe('Ironclad')
    expect(doc.getSubject()).toBe('Sentinel Comics RPG villain sheet')
  }, 30_000)
})
