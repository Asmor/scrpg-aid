import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { ISSUE_CODES, type RuleWarning } from '../creation/warnings'
import { createHero } from '../hero/model'
import * as fixtures from '../test/heroes'
import { ISSUE_SECTION, focusIssue, issueKey, issueSection, placeIssues } from './issue-targets'

const w = (code: RuleWarning['code'], extra: Partial<RuleWarning> = {}): RuleWarning => ({ step: 'archetype', code, message: `${code} message`, ...extra })

describe('issue targets', () => {
  it('gives every kind of issue the checks produce a section to show in', () => {
    const sections = new Set(['choose', 'assign', 'abilities', 'bonus', 'principle', 'parts'])
    const missing = ISSUE_CODES.filter((code) => !sections.has(ISSUE_SECTION[code]))
    expect(missing).toEqual([])
    // And nothing mapped that the checks don't produce.
    expect(Object.keys(ISSUE_SECTION).sort()).toEqual([...ISSUE_CODES].sort())
  })

  it('covers the issues real heroes have, from an empty one to each special archetype', () => {
    const heroes = [createHero('guided'), createHero('constructed'), ...Object.values(fixtures).filter((f) => typeof f === 'function' && f.length === 0).map((f) => (f as () => unknown)())]
    for (const hero of heroes) {
      for (const issue of buildSheet(hero as ReturnType<typeof createHero>).warnings) expect(ISSUE_SECTION[issue.code], issue.code).toBeDefined()
    }
  })

  it('sends each kind of issue to its part of the step', () => {
    expect(issueSection('dice-mismatch')).toBe('assign')
    expect(issueSection('principle-missing')).toBe('principle')
    expect(issueSection('secondary-principle')).toBe('principle')
    expect(issueSection('bonus-count')).toBe('bonus')
    expect(issueSection('slot-empty')).toBe('abilities')
    expect(issueSection('ability-count')).toBe('abilities')
    expect(issueSection('split-always')).toBe('parts')
    expect(issueSection('not-rolled')).toBe('choose')
  })

  it('places an issue at its field, else its section, else the top of the scope', () => {
    const atField = w('slot-empty', { field: 'ability:Inflict' })
    const fieldGone = w('slot-empty', { field: 'ability:Gone' })
    const section = w('ability-count')
    const nowhere = w('principle-missing')
    const claims = [
      { key: 'section:abilities', owner: 'a' },
      { key: 'field:ability:Inflict', owner: 'f' },
      // A second Abilities section doesn't show them again.
      { key: 'section:abilities', owner: 'b' },
    ]
    const placed = placeIssues([atField, fieldGone, section, nowhere], claims)
    expect(placed.get('f')).toEqual([atField])
    expect(placed.get('a')).toEqual([fieldGone, section])
    expect(placed.get('b')).toBeUndefined()
    expect(placed.get('')).toEqual([nowhere])
  })

  it('focuses the field an issue is shown under, or the first control of its section', () => {
    const field = w('slot-empty', { field: 'ability:Inflict' })
    document.body.innerHTML = `
      <div id="step">
        <div data-section="choose"><input id="radio" type="radio"></div>
        <fieldset data-section="assign"><select id="first"></select><select></select></fieldset>
        <div data-section="abilities">
          <input id="other" type="checkbox">
          <input id="inflict" type="checkbox" aria-describedby="x-issues">
          <ul class="inline-issues" id="x-issues"><li data-issue="${issueKey(field).replace(/"/g, '&quot;')}">Fill in</li></ul>
        </div>
        <div data-section="principle"><p>No controls</p></div>
      </div>`
    const step = document.getElementById('step')!
    focusIssue(step, field)
    expect(document.activeElement?.id).toBe('inflict')
    focusIssue(step, w('dice-mismatch'))
    expect(document.activeElement?.id).toBe('first')
    focusIssue(step, w('principle-missing'))
    expect(document.activeElement).toBe(step.querySelector('[data-section="principle"]'))
    focusIssue(step, w('bonus-count'))
    expect(document.activeElement?.id).toBe('radio')
  })
})
