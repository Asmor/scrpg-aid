import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { parseSaved, toSaved } from '../hero/serialize'
import type { Clock } from '../play/state'
import { addBackIssue, addOfferedIssue, addStartingCollection, backIssueOffer, dismissIssue, heroIssues, collectionsText, editBackIssue, followed, recordCollection, removeBackIssue } from './records'

const c: Clock = (() => {
  let n = 0
  return { now: new Date('2026-10-22T12:00:00Z'), newId: () => `id${++n}` }
})()

const game = { id: 'g', name: 'Thursday game' }
const withIssues = (count: number) => Array.from({ length: count }, (_, i) => `Issue ${i + 1}`).reduce((h, title) => addBackIssue(h, { title, game }, c), createHero('guided', { id: 'h' }))

describe('back issues', () => {
  it('adds with a title and an optional game, keeping its name', () => {
    let h = addBackIssue(createHero('guided'), { title: ' The Bank Job ', game }, c)
    expect(h.backIssues[0]).toMatchObject({ title: 'The Bank Job', gameId: 'g', gameName: 'Thursday game', at: '2026-10-22T12:00:00.000Z' })
    h = addBackIssue(h, { title: 'No game' }, c)
    expect(h.backIssues[1]).not.toHaveProperty('gameId')
  })

  it('needs a title, and stops at six', () => {
    const h = createHero('guided')
    expect(addBackIssue(h, { title: '  ' }, c)).toBe(h)
    const six = withIssues(6)
    expect(six.backIssues).toHaveLength(6)
    expect(addBackIssue(six, { title: 'Seventh' }, c)).toBe(six)
  })

  it('edits and removes, and removing one reopens room', () => {
    let h = withIssues(6)
    const id = h.backIssues[1]!.id
    const at = h.backIssues[1]!.at
    h = editBackIssue(h, id, { title: 'Renamed' })
    expect(h.backIssues[1]).toEqual({ id, title: 'Renamed', at })
    expect(editBackIssue(h, id, { title: ' ' })).toBe(h)
    h = removeBackIssue(h, id)
    expect(h.backIssues).toHaveLength(5)
    expect(addBackIssue(h, { title: 'Sixth again' }, c).backIssues).toHaveLength(6)
  })
})

describe('collections', () => {
  it('recording moves the six in, empties the list, and logs it', () => {
    const h = recordCollection(withIssues(6), ' The Gravelord Saga ', c)
    expect(h.backIssues).toEqual([])
    expect(h.collections[0]).toMatchObject({ name: 'The Gravelord Saga' })
    expect(h.collections[0]!.issues).toHaveLength(6)
    expect(h.collections[0]!.issues[0]).toEqual({ title: 'Issue 1', gameName: 'Thursday game', at: '2026-10-22T12:00:00.000Z' })
    expect(h.advancement).toMatchObject([{ kind: 'collection', text: 'Recorded the collection The Gravelord Saga (6 back issues).' }])
  })

  it('needs six issues and a name', () => {
    const five = withIssues(5)
    expect(recordCollection(five, 'x', c)).toBe(five)
    const six = withIssues(6)
    expect(recordCollection(six, ' ', c)).toBe(six)
  })

  it('a hero with none can start with one, marked and logged', () => {
    const h = addStartingCollection(createHero('guided'), 'Origins', c)
    expect(h.collections).toMatchObject([{ name: 'Origins', issues: [], starting: true }])
    expect(h.advancement).toMatchObject([{ kind: 'collection', text: 'Started with the collection Origins.' }])
    expect(addStartingCollection(h, 'Again', c)).toBe(h)
    const blank = createHero('guided')
    expect(addStartingCollection(blank, ' ', c)).toBe(blank)
  })

  it('says how many', () => {
    expect([collectionsText(0), collectionsText(1), collectionsText(2)]).toEqual(['0 collections', '1 collection', '2 collections'])
  })

  it('what a change followed: the last issue, else the last collection', () => {
    expect(followed(createHero('guided'))).toBeUndefined()
    const recorded = recordCollection(withIssues(6), 'Saga', c)
    expect(followed(recorded)).toBe('Saga')
    expect(followed(addBackIssue(recorded, { title: 'Next' }, c))).toBe('Next')
  })

  it('survive a save and read', () => {
    const h = recordCollection(withIssues(6), 'Saga', c)
    expect(parseSaved(JSON.parse(JSON.stringify(toSaved(addBackIssue(h, { title: 'Next' }, c)))))).toMatchObject({ ok: true, hero: { collections: [{ name: 'Saga' }], backIssues: [{ title: 'Next' }] } })
  })
})

describe('back issues from a finished issue', () => {
  const issue = { id: 'i1', number: 2 }
  const t = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `T${i}`, at: 'x' }))

  it('carries the issue, never twice', () => {
    const hero = createHero('guided', { id: 'h' })
    const once = addBackIssue(hero, { title: 'Saga', game: { id: 'g', name: 'Thursday' }, issue }, c)
    expect(once.backIssues[0]).toMatchObject({ title: 'Saga', gameId: 'g', issueId: 'i1', issueNumber: 2 })
    expect(addBackIssue(once, { title: 'Again', issue }, c)).toBe(once)
  })

  it('tells which situation applies', () => {
    const hero = createHero('guided', { id: 'h' })
    expect(backIssueOffer({ backIssues: t(4), collections: [] }, 'i1')).toEqual({ situation: 'adds', count: 4 })
    expect(backIssueOffer({ backIssues: t(5), collections: [] }, 'i1').situation).toBe('reachesSix')
    expect(backIssueOffer({ backIssues: t(6), collections: [] }, 'i1').situation).toBe('alreadySix')
    expect(backIssueOffer({ backIssues: [{ ...t(1)[0]!, issueId: 'i1' }], collections: [] }, 'i1').situation).toBe('recorded')
    expect(backIssueOffer({ ...hero, backIssues: [], collections: [{ id: 'c', name: 'C', at: 'x', issues: [{ title: 'T', issueId: 'i1', issueNumber: 1, at: 'x' }] }] }, 'i1').situation).toBe('recorded')
  })

  it('keeps the issue in a collection, and while an edit keeps the game', () => {
    const hero = { ...createHero('guided', { id: 'h' }), backIssues: [{ ...t(1)[0]!, gameId: 'g', gameName: 'G', issueId: 'i1', issueNumber: 1 }, ...t(6).slice(1)] }
    expect(recordCollection(hero, 'Saga', c).collections[0]!.issues[0]).toMatchObject({ issueId: 'i1', issueNumber: 1 })
    expect(editBackIssue(hero, 'b0', { title: 'New', game: { id: 'g', name: 'G' } }).backIssues[0]).toMatchObject({ title: 'New', issueId: 'i1' })
    expect(editBackIssue(hero, 'b0', { title: 'New' }).backIssues[0]).not.toHaveProperty('issueId')
  })
})

describe('adding an offered issue', () => {
  const offered = { id: 'i1', number: 1, title: 'Saga', game }
  const hero = (n: number) => {
    const h = withIssues(n)
    return { ...h, details: { ...h.details, name: 'Afterimage' } }
  }

  it('adds one', () => {
    const r = addOfferedIssue(hero(4), offered, undefined, c)
    expect(r.hero.backIssues).toHaveLength(5)
    expect(r.text).toBe('Added. Afterimage has 5 of 6 back issues.')
  })

  it('reaches six, with or without a collection', () => {
    expect(addOfferedIssue(hero(5), offered, undefined, c).text).toBe('Added. Afterimage has 6 of 6 back issues. Name a collection on the Advancement page.')
    const r = addOfferedIssue(hero(5), offered, 'Arc', c)
    expect(r.text).toBe('Added, and recorded the collection. Afterimage starts again at 0 of 6.')
    expect(r.hero.backIssues).toEqual([])
    expect(r.hero.collections[0]!.issues.at(-1)).toMatchObject({ issueId: 'i1' })
  })

  it('at six records first, and needs a name', () => {
    const six = hero(6)
    expect(addOfferedIssue(six, offered, ' ', c).hero).toBe(six)
    const r = addOfferedIssue(six, offered, 'Arc', c)
    expect(r.text).toBe('Recorded the collection and added Saga. Afterimage has 1 of 6.')
    expect(r.hero.backIssues).toMatchObject([{ issueId: 'i1' }])
  })

  it('never adds the same issue twice', () => {
    const once = addOfferedIssue(hero(1), offered, undefined, c).hero
    expect(addOfferedIssue(once, offered, undefined, c)).toEqual({ hero: once, text: 'Already recorded.' })
  })
})

describe("a hero's issues", () => {
  const source = (prompts = {}) => ({ game, joined: true, prompts, issues: [{ id: 'i1', number: 1, title: 'Saga', state: 'finished' as const, offeredTo: [{ sourceId: 'h' }] }, { id: 'i2', number: 2, state: 'finished' as const, offeredTo: [{ sourceId: 'other' }] }, { id: 'i3', number: 3, state: 'now' as const }] })

  it('are the finished ones offered to it', () => {
    const list = heroIssues({ id: 'h' }, [source()])
    expect(list).toMatchObject([{ id: 'i1', title: 'Saga', dismissed: false }])
  })

  it('know when they were dismissed, on the joined game or the hero', () => {
    expect(heroIssues({ id: 'h' }, [source({ i1: 'dismissed' })])[0]!.dismissed).toBe(true)
    expect(heroIssues({ id: 'h' }, [source({ i1: 'later' })])[0]!.dismissed).toBe(false)
    const hero = dismissIssue(withIssues(0), 'i1')
    expect(heroIssues(hero, [source()])[0]!.dismissed).toBe(true)
  })
})

