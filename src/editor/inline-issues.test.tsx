import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { RuleWarning } from '../creation/warnings'
import { IssueField, IssueScope, SectionIssues } from './inline-issues'

const w = (code: RuleWarning['code'], message: string, field?: string): RuleWarning => ({ step: 'powerSource', code, message, ...(field ? { field } : {}) })

function Field({ field, label }: { field: string; label: string }) {
  return (
    <IssueField field={field}>
      {(f) => (
        <div>
          <label>
            {label}
            <select {...f.control} />
          </label>
          {f.list}
        </div>
      )}
    </IssueField>
  )
}

describe('inline issues', () => {
  it('shows an issue under its field, linked to it, and the rest at the top of their section', () => {
    render(
      <IssueScope issues={[w('assigned-twice', 'Agility twice.', 'trait:power:agility'), w('dice-mismatch', 'Dice don’t match.')]}>
        <fieldset>
          <legend>Powers</legend>
          <SectionIssues section="assign" />
          <Field field="trait:power:agility" label="Agility row" />
          <Field field="trait:power:speed" label="Speed row" />
        </fieldset>
      </IssueScope>,
    )
    const agility = screen.getByRole('combobox', { name: 'Agility row' })
    expect(agility).toHaveAttribute('aria-invalid', 'true')
    expect(agility).toHaveAccessibleDescription('Agility twice.')
    const speed = screen.getByRole('combobox', { name: 'Speed row' })
    expect(speed).not.toHaveAttribute('aria-invalid')
    expect(speed).not.toHaveAttribute('aria-describedby')
    // The section's issue sits under its legend, before the rows.
    const lists = document.querySelectorAll('.inline-issues')
    expect([...lists].map((l) => l.textContent)).toEqual(['Dice don’t match.', 'Agility twice.'])
  })

  it('shows an issue whose field and section aren’t on the page at the top of the scope', () => {
    render(
      <IssueScope issues={[w('principle-missing', 'Choose a principle.'), w('slot-empty', 'Fill in [power] for Gone.', 'ability:Gone')]}>
        <p>Step body</p>
        <SectionIssues section="assign" />
      </IssueScope>,
    )
    const top = document.querySelector('.inline-issues')!
    expect(top.nextElementSibling).toHaveTextContent('Step body')
    expect(top).toHaveTextContent('Choose a principle.')
    expect(top).toHaveTextContent('Fill in [power] for Gone.')
  })

  it('moves an issue as its field comes and goes', async () => {
    function Toggle() {
      const [shown, setShown] = useState(false)
      return (
        <IssueScope issues={[w('slot-empty', 'Fill in [power] for Inflict.', 'ability:Inflict')]}>
          <button type="button" onClick={() => setShown(!shown)}>
            Toggle
          </button>
          <SectionIssues section="abilities" />
          {shown && <Field field="ability:Inflict" label="Inflict" />}
        </IssueScope>
      )
    }
    render(<Toggle />)
    expect(screen.getByText('Fill in [power] for Inflict.').closest('ul')!.nextElementSibling).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(await screen.findByRole('combobox', { name: 'Inflict' })).toHaveAccessibleDescription('Fill in [power] for Inflict.')
    expect(screen.getAllByText('Fill in [power] for Inflict.')).toHaveLength(1)
  })

  it('shows nothing outside a scope (the villain editor)', () => {
    render(<Field field="ability:Inflict" label="Inflict" />)
    expect(screen.getByRole('combobox', { name: 'Inflict' })).not.toHaveAttribute('aria-invalid')
  })
})
