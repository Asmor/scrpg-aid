import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { createHero } from '../hero/model'
import { formChangerHero } from '../test/heroes'
import { readImport } from './files'
import { heroHtml as renderHtml, villainHtml } from './html'
import { adaptiveBruiser } from '../test/villains'
import { TEST_ICONS } from '../test/icons'
import type { Hero } from '../hero/model'
import { heroMarkdown } from './markdown'

const heroHtml = (hero: Hero) => renderHtml(hero, TEST_ICONS)

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('heroHtml', () => {
  it('puts the name in the printed footer, safely', () => {
    const hero = exampleHero({ id: 'x' })
    hero.details.name = 'Evil</style><script>x()</script>'
    const doc = parse(heroHtml(hero))
    expect(doc.querySelector('head style')!.textContent).toContain('@page { @bottom-left { content: "Evil\\3c /style>\\3c script>x()\\3c /script>"; } }')
    expect(doc.querySelectorAll('script:not([type="application/json"])')).toHaveLength(0)
  })

  it('is a standalone page with the sheet, its styles, and the light theme', () => {
    const html = heroHtml(exampleHero({ id: 'x' }))
    expect(html.startsWith('<!doctype html>\n<html lang="en" data-theme="light">')).toBe(true)
    const doc = parse(html)
    expect(doc.title).toBe('Maya Reyes')
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull()
    expect(doc.querySelector('head style')).not.toBeNull()
    const sheet = doc.querySelector('main .hero-sheet')!
    // The name, alias and identity line come first, as on the page.
    expect(doc.querySelector('main h2')!.textContent).toBe('Maya Reyes')
    expect(doc.querySelector('main .character-head')!.textContent).toContain('Upper Class · Accident · Speedster · Lone Wolf')
    expect(sheet.textContent).toContain('Paragon Feat')
    // The icons are embedded, nothing loads from elsewhere, and nothing runs.
    const imgs = [...doc.querySelectorAll('img')]
    expect(imgs.length).toBeGreaterThan(0)
    for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(sheet.querySelector('img[alt="Attack"]')).not.toBeNull()
    expect(sheet.querySelector('img[alt="d12"]')).not.toBeNull()
    expect(doc.querySelectorAll('link, iframe, script:not([type="application/json"])')).toHaveLength(0)
    // With no script, nothing hides behind a button: the twists show at every width.
    expect(sheet.querySelectorAll('button')).toHaveLength(0)
    expect(sheet.querySelector('.principle-card__twists--folded')).toBeNull()
  })

  it('leaves out rule warnings', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.background = { id: 'upper-class', qualities: [] }
    expect(parse(heroHtml(hero)).querySelector('.sheet-warnings')).toBeNull()
  })

  it('imports back to the same hero', () => {
    const hero = { ...formChangerHero(), id: 'f1' }
    expect(readImport(heroHtml(hero))).toEqual({ ok: true, heroes: [hero], villains: [], games: [], savedSearches: [], templates: { minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] }, skipped: [] })
  })

  it('keeps the player’s text as text, and the real payload findable', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'X </script><script type="application/json" id="scrpg-hero">{} <!-- scrpg-hero -->'
    hero.details.costume = '<img src=x onerror=alert(1)>'
    const html = heroHtml(hero)
    const doc = parse(html)
    expect(doc.title).toBe(hero.details.name)
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect(doc.querySelectorAll('img[onerror], img[src="x"]')).toHaveLength(0)
    expect(readImport(html)).toEqual({ ok: true, heroes: [hero], villains: [], games: [], savedSearches: [], templates: { minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] }, skipped: [] })
    // A Markdown export with the same text still finds its own comment.
    expect(readImport(heroMarkdown(hero))).toEqual({ ok: true, heroes: [hero], villains: [], games: [], savedSearches: [], templates: { minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] }, skipped: [] })
  })
})

describe('villainHtml', () => {
  it('is a standalone villain sheet, without rule issues, that imports back', () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'mook-squad', abilities: [] }]
    const html = villainHtml(v, TEST_ICONS)
    const doc = parse(html)
    expect(doc.title).toBe('Ironclad')
    expect(doc.querySelector('[aria-label="Ironclad villain sheet"]')).not.toBeNull()
    // It needs a mastery, but exports leave rule issues out.
    expect(doc.querySelector('.sheet-warnings')).toBeNull()
    expect(readImport(html)).toEqual({ ok: true, heroes: [], villains: [v], games: [], savedSearches: [], templates: { minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] }, skipped: [] })
  })
})
