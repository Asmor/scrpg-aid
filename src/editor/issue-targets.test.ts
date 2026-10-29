import { describe, expect, it } from 'vitest'
import { focusIssue, issueSection } from './issue-targets'

describe('issue targets', () => {
  it('sends each kind of issue to its part of the step', () => {
    expect(issueSection('dice-mismatch')).toBe('assign')
    expect(issueSection('principle-missing')).toBe('principle')
    expect(issueSection('secondary-principle')).toBe('principle')
    expect(issueSection('bonus-count')).toBe('bonus')
    expect(issueSection('slot-empty')).toBe('abilities')
    expect(issueSection('ability-count')).toBe('abilities')
    expect(issueSection('split-always')).toBe('parts')
    expect(issueSection('not-rolled')).toBe('choose')
    expect(issueSection('something-new')).toBe('choose')
  })

  it('focuses the first control of the matching section, or the first section', () => {
    document.body.innerHTML = `
      <div id="step">
        <div data-section="choose"><input id="radio" type="radio"></div>
        <fieldset data-section="assign"><select id="first"></select><select></select></fieldset>
        <div data-section="principle"><p>No controls</p></div>
      </div>`
    const step = document.getElementById('step')!
    focusIssue(step, 'dice-mismatch')
    expect(document.activeElement?.id).toBe('first')
    focusIssue(step, 'principle-missing')
    expect(document.activeElement).toBe(step.querySelector('[data-section="principle"]'))
    focusIssue(step, 'bonus-count')
    expect(document.activeElement?.id).toBe('radio')
  })
})
