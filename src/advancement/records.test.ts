import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { parseSaved, toSaved } from '../hero/serialize'
import type { Clock } from '../play/state'
import { addBackIssue, addStartingCollection, backIssueOffer, collectionsText, editBackIssue, followed, recordCollection, removeBackIssue } from './records'

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
