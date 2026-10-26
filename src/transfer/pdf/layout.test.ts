import { describe, expect, it } from 'vitest'
import { exampleHero } from '../../hero/example'
import { createHero } from '../../hero/model'
import { dividedHero, formChangerHero, minionMakerHero, modularHero } from '../../test/heroes'
import type { IconName } from '../../components/icon-source'
import { layoutHero, markEffects, wrap, type Box, type Canvas, type FontId } from './layout'
import { PAGE_SIZES } from './page-size'

interface TextOp {
  page: number
  text: string
  x: number
  y: number
  font: FontId
  size: number
  width: number
}

/** Records what's drawn, measuring text as half its size per character. */
class RecordingCanvas implements Canvas {
  texts: TextOp[] = []
  rects: { page: number; x: number; y: number; width: number; height: number; box: Box }[] = []
  icons: { page: number; name: IconName; x: number; y: number }[] = []
  private page = -1
  pageCount = 0
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  measure(text: string, _font: FontId, size: number) {
    return text.length * size * 0.5
  }
  addPage() {
    this.page = this.pageCount++
  }
  setPage(index: number) {
    this.page = index
  }
  text(text: string, x: number, y: number, font: FontId, size: number) {
    this.texts.push({ page: this.page, text, x, y, font, size, width: this.measure(text, font, size) })
  }
  rect(x: number, y: number, width: number, height: number, box: Box) {
    this.rects.push({ page: this.page, x, y, width, height, box })
  }
  icon(name: IconName, x: number, y: number) {
    this.icons.push({ page: this.page, name, x, y })
  }
}

const laidOut = (hero = exampleHero({ id: 'x' }), size: keyof typeof PAGE_SIZES = 'letter') => {
  const canvas = new RecordingCanvas(PAGE_SIZES[size].width, PAGE_SIZES[size].height)
  layoutHero(canvas, hero)
  return canvas
}
const allText = (c: RecordingCanvas) => c.texts.map((t) => t.text).join('\n')

describe('wrap', () => {
  const canvas = new RecordingCanvas(612, 792)
  it('fits lines to the width, keeping the author’s line breaks', () => {
    // Each character is 5 points wide at size 10.
    expect(wrap(canvas, 'aaa bbb ccc', 'regular', 10, 40)).toEqual(['aaa bbb', 'ccc'])
    expect(wrap(canvas, 'one\ntwo\n\nthree', 'regular', 10, 200)).toEqual(['one', 'two', '', 'three'])
  })

  it('breaks a word too long for the line', () => {
    expect(wrap(canvas, 'abcdefghij', 'regular', 10, 20)).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('markEffects', () => {
  it('puts an icon marker before each effect word', () => {
    expect(markEffects('Attack using Fire. Hinder that same target using your Min die.')).toBe('\ue000Attack using Fire. \ue003Hinder that same target using your Min die.')
    expect(markEffects('When you are hit with an Attack, change forms.')).toBe('When you are hit with an Attack, change forms.')
    // Die sizes become die markers.
    expect(markEffects('Gain a d8 minion; roll a d12.')).toBe('Gain a \ue012 minion; roll a \ue014.')
  })

  it('wraps marked text with room for the icons', () => {
    const canvas = new RecordingCanvas(612, 792)
    // Without the icon, "Attack using" (12 characters, 60 points) would fit in 62.
    expect(wrap(canvas, markEffects('Attack using Fire'), 'regular', 10, 62)).toHaveLength(2)
  })
})

describe('layoutHero', () => {
  it('draws the whole sheet: header, panels, dice, principles, and ability bands', () => {
    const c = laidOut()
    const text = allText(c)
    for (const s of ['Maya Reyes', 'Afterimage', 'Characteristics', 'Upper Class', 'Powers, qualities, and status', 'Power', 'Speed', 'Quality', 'Old Money', 'Status', 'Green', 'Yellow', 'Red', 'Max Health 30', 'Green 30–23', 'Principle of Business', 'Abilities', 'Paragon Feat', 'Out']) {
      expect(text).toContain(s)
    }
    // A die icon beside every power and quality, and each status die.
    expect(c.icons.filter((i) => i.name.startsWith('die/'))).toHaveLength(5 + 3 + 3)
    // The Out ability ("Boost an ally by rolling your single Fitness die.") shows its Boost icon
    // inline only, with no effects column before it.
    const out = c.texts.find((t) => t.text.includes('an ally by rolling your single Fitness die'))!
    const outBoosts = c.icons.filter((i) => i.name === 'action/boost' && i.page === out.page && Math.abs(i.y - out.y) < 6)
    expect(outBoosts).toHaveLength(1)
    expect(outBoosts[0]!.x).toBeLessThan(out.x)
    expect(outBoosts[0]!.x).toBeGreaterThan(out.x - 14)
    // Dice are icons alone: no die size is written out.
    expect(text).not.toMatch(/\bd(4|6|8|10|12)\b/)
    // Inflict ("Attack using Fire. Hinder that same target using your Min die.") shows its
    // effects under its badge and before each effect word.
    const actions = c.icons.filter((i) => i.name.startsWith('action/')).map((i) => i.name)
    expect(actions.filter((n) => n === 'action/hinder').length).toBeGreaterThanOrEqual(2)
    expect(actions).toContain('action/attack')
    // Warnings are never part of the export.
    expect(text).not.toMatch(/issue/i)
  })

  it('keeps everything inside the page margins, with a footer on every page', () => {
    for (const hero of [exampleHero({ id: 'x' }), modularHero(), formChangerHero(), minionMakerHero(), dividedHero()]) {
      for (const size of ['letter', 'a4'] as const) {
        const c = laidOut(hero, size)
        const { width, height } = PAGE_SIZES[size]
        for (const t of c.texts) {
          expect(t.x).toBeGreaterThanOrEqual(36 - 0.01)
          expect(t.x + t.width).toBeLessThanOrEqual(width - 36 + 0.01)
          expect(t.y).toBeGreaterThanOrEqual(36 - 0.01)
          expect(t.y + t.size).toBeLessThanOrEqual(height - 36 + t.size + 0.01)
        }
        for (let p = 0; p < c.pageCount; p++) {
          expect(c.texts.some((t) => t.page === p && t.text.endsWith(`page ${p + 1} of ${c.pageCount}`))).toBe(true)
        }
      }
    }
  })

  it('runs long content onto more pages, never past the bottom margin', () => {
    const hero = exampleHero({ id: 'x' })
    hero.details.costume = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a very long costume description.`).join('\n')
    const c = laidOut(hero)
    expect(c.pageCount).toBeGreaterThan(laidOut().pageCount)
    const bodyBottom = 792 - 36 - 14
    for (const t of c.texts.filter((t) => !t.text.includes(' · page '))) expect(t.y + t.size).toBeLessThanOrEqual(bodyBottom + 0.01)
  })

  it('shows the auxiliary sheet for modes and forms, and says what a new hero lacks', () => {
    expect(allText(laidOut(modularHero()))).toContain('Powerless mode')
    expect(allText(laidOut(formChangerHero()))).toMatch(/\((Green|Yellow) form\)/)
    expect(allText(laidOut(minionMakerHero()))).toContain('Minion forms')
    const blank = allText(laidOut(createHero('guided', { id: 'h1' })))
    for (const s of ['Unnamed hero', 'Powers, qualities, and status', '—', 'Choose a personality.', 'Not worked out yet.', 'No principles yet.', 'None yet.']) expect(blank).toContain(s)
    expect(blank).not.toContain('Auxiliary sheet')
  })

  it('moves a short panel to the next page whole instead of splitting it', () => {
    for (const hero of [exampleHero({ id: 'x' }), modularHero(), formChangerHero(), minionMakerHero(), dividedHero()]) {
      for (const size of ['letter', 'a4'] as const) expect(allText(laidOut(hero, size))).not.toMatch(/\((Green|Yellow|Red) (form|mode)\) \(continued\)|Principle of .* \(continued\)/)
    }
  })

  it('repeats a band’s title when its rows run onto the next page', () => {
    // Lengthen the details until a band breaks across pages.
    const isBandContinued = (t: TextOp) => /^(Green|Yellow|Red) \(continued\)$/.test(t.text)
    let c: RecordingCanvas | undefined
    for (let n = 1; n < 60 && !c?.texts.some(isBandContinued); n++) {
      const hero = exampleHero({ id: 'x' })
      hero.details.costume = Array.from({ length: n }, (_, i) => `Line ${i + 1}.`).join('\n')
      c = laidOut(hero)
    }
    const continued = c!.texts.find(isBandContinued)
    expect(continued).toBeDefined()
    // It heads its page.
    expect(Math.min(...c!.texts.filter((t) => t.page === continued!.page).map((t) => t.y))).toBe(continued!.y)
  })

  it('shows a Divided hero’s heroic form', () => {
    const hero = dividedHero()
    hero.archetype!.divided!.heroicPersonality = { id: 'natural-leader', bonus: [] }
    const text = allText(laidOut(hero))
    expect(text).toContain('Divided')
    expect(text).toContain('Heroic form personality:')
    expect(text).toContain('Natural Leader')
    expect(text).toContain('Heroic form status dice')
  })

  it('finishes, within the margins, when a band’s later ability is taller than a page', () => {
    const hero = exampleHero({ id: 'x' })
    const text = Array.from({ length: 90 }, (_, i) => `Part ${i + 1} of a very long ability.`).join('\n')
    hero.background!.principle = { id: 'custom', custom: { category: 'identity', name: 'Big', roleplaying: 'r', minorTwist: 'm', majorTwist: 'M', greenAbility: { name: 'Big', text } } }
    const c = laidOut(hero)
    expect(c.pageCount).toBeLessThan(10)
    expect(allText(c)).toContain('Part 90 of a very long ability.')
    expect(allText(c)).toContain('Green (continued)')
    for (const t of c.texts.filter((t) => !t.text.includes(' · page '))) expect(t.y + t.size).toBeLessThanOrEqual(792 - 36 - 14 + 0.01)

    // The same ability as the band's first row (a new hero has no other Green abilities).
    const fresh = createHero('guided', { id: 'h1' })
    fresh.background = { id: 'upper-class', qualities: [], principle: hero.background!.principle! }
    const f = laidOut(fresh)
    expect(f.pageCount).toBeLessThan(10)
    expect(allText(f)).toContain('Part 90 of a very long ability.')
    for (const t of f.texts.filter((t) => !t.text.includes(' · page '))) expect(t.y + t.size).toBeLessThanOrEqual(792 - 36 - 14 + 0.01)
  })

  it('continues long text in a panel on the next page', () => {
    const hero = exampleHero({ id: 'x' })
    hero.details.costume = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}.`).join('\n')
    hero.advancement = { backIssues: 0, collections: [{ name: 'Long', notes: Array.from({ length: 90 }, (_, i) => `Note ${i + 1}.`).join('\n') }], changes: [] }
    const c = laidOut(hero)
    const text = allText(c)
    expect(text).toContain('Details (continued)')
    expect(text).toContain('Advancement (continued)')
    expect(text).toContain('Line 120.')
    expect(text).toContain('Note 90.')
    for (const t of c.texts.filter((t) => !t.text.includes(' · page '))) expect(t.y + t.size).toBeLessThanOrEqual(792 - 36 - 14 + 0.01)
  })

  it('draws punctuation next to a die icon as text', () => {
    const hero = exampleHero({ id: 'x' })
    hero.background!.principle = { id: 'custom', custom: { category: 'identity', name: 'Dice', roleplaying: 'r', minorTwist: 'm', majorTwist: 'M', greenAbility: { name: 'Dice', text: 'Overcome using your Max die. Then roll a d6.' } } }
    const c = laidOut(hero)
    expect(c.icons.map((i) => i.name).filter((n) => n.includes('undefined'))).toEqual([])
    // The "." after the die is drawn on its own, just after the die icon on the same line.
    const dot = c.texts.find((t) => t.text === '.')!
    expect(c.icons.some((i) => i.name === 'die/d6' && i.page === dot.page && Math.abs(i.y - dot.y) < 6 && i.x < dot.x)).toBe(true)
  })

  it('draws die sizes in ability text as die icons', () => {
    const hero = exampleHero({ id: 'x' })
    hero.background!.principle = { id: 'custom', custom: { category: 'identity', name: 'Dice', roleplaying: 'r', minorTwist: 'm', majorTwist: 'M', greenAbility: { name: 'Dice', text: 'Overcome using your Max die. Then roll a d6 and a d12.' } } }
    const c = laidOut(hero)
    expect(allText(c)).not.toMatch(/\bd(4|6|8|10|12)\b/)
    expect(allText(c)).toContain('Then roll a')
    expect(c.icons.filter((i) => i.name === 'die/d6' || i.name === 'die/d12').length).toBeGreaterThanOrEqual(2)
  })

  it('puts Health beside Characteristics and Details, above the dice table', () => {
    const find = (c: RecordingCanvas, text: string) => c.texts.find((t) => t.text === text)!
    const chip = (c: RecordingCanvas, zone: string) => c.texts.find((t) => t.text.startsWith(`${zone} `) && /\d+–\d+$/.test(t.text))!
    // With details: three columns, and in that narrow column the health ranges stack.
    const c = laidOut()
    const [characteristics, details, health] = ['Characteristics', 'Details', 'Health'].map((t) => find(c, t))
    expect(details!.y).toBe(characteristics!.y)
    expect(health!.y).toBe(characteristics!.y)
    expect(characteristics!.x).toBeLessThan(details!.x)
    expect(details!.x).toBeLessThan(health!.x)
    expect(health!.y).toBeLessThan(find(c, 'Powers, qualities, and status').y)
    const [g, y, r] = ['Green', 'Yellow', 'Red'].map((z) => chip(c, z))
    expect(g!.y).toBeLessThan(y!.y)
    expect(y!.y).toBeLessThan(r!.y)
    // Without details: two columns, and the ranges sit three across.
    const hero = exampleHero({ id: 'x' })
    for (const f of ['age', 'build', 'costume'] as const) hero.details[f] = ''
    const two = laidOut(hero)
    expect(find(two, 'Health').y).toBe(find(two, 'Characteristics').y)
    const across = ['Green', 'Yellow', 'Red'].map((z) => chip(two, z))
    expect(new Set(across.map((t) => t.y)).size).toBe(1)
    expect(across[0]!.x).toBeLessThan(across[1]!.x)
  })

  it('includes advancement', () => {
    const hero = exampleHero({ id: 'x' })
    hero.advancement = { backIssues: 3, collections: [{ name: 'Origins', notes: 'First arc' }], changes: [] }
    const text = allText(laidOut(hero))
    expect(text).toContain('Advancement')
    expect(text).toContain('Origins')
    expect(text).toContain('First arc')
  })
})
