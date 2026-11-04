/**
 * Rule issues shown where they happen (the hero wizard spec, Step anatomy, item 6). A step, and
 * each archetype part card, is an IssueScope over its issues. Inside it, each section and field
 * that can show issues claims them as it renders: a field takes the issues that name it, a
 * section takes the rest of its kind, and anything nothing claimed (a section this archetype
 * doesn't have) shows at the top of the scope. So every issue appears once, in the place
 * closest to what it's about. Outside a scope nothing shows.
 */
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { DiceText } from '../components/icons'
import { fieldKey, issueKey, placeIssues, sectionKey, type Claim, type IssueRef, type IssueSection } from './issue-targets'

/** Any rule issue: a hero's (../creation/warnings.ts) or a villain's (../villain/sheet.ts). */
type RuleWarning = IssueRef

interface Scope {
  /** Each owner's issues: a field's or section's id, or "" for the top of the scope. */
  placed: ReadonlyMap<string, readonly RuleWarning[]>
  claim: (key: string, owner: string) => () => void
}

const ScopeContext = createContext<Scope | null>(null)

/** A small circle with an exclamation mark. */
function AlertIcon() {
  return (
    <svg className="inline-issues__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  )
}

/** Issues in --ui-danger, each with an alert icon. Renders nothing when there are none. */
export function InlineIssues({ issues, id }: { issues: readonly RuleWarning[]; id?: string }) {
  if (!issues.length) return null
  return (
    <ul className="inline-issues" id={id}>
      {issues.map((w, i) => (
        <li key={`${w.code}:${i}`} data-issue={issueKey(w)}>
          <AlertIcon />
          <span>
            <DiceText text={w.message} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A step's or a part's issues, placed at their fields and sections, with the unplaced ones first. */
export function IssueScope({ issues, children }: { issues: readonly RuleWarning[]; children: ReactNode }) {
  const [claims, setClaims] = useState<readonly Claim[]>([])
  const claim = useCallback((key: string, owner: string) => {
    setClaims((c) => [...c, { key, owner }])
    return () => setClaims((c) => c.filter((x) => !(x.key === key && x.owner === owner)))
  }, [])
  const placed = useMemo(() => placeIssues(issues, claims), [issues, claims])
  const scope = useMemo(() => ({ placed, claim }), [placed, claim])
  return (
    <ScopeContext.Provider value={scope}>
      <InlineIssues issues={placed.get('') ?? []} />
      {children}
    </ScopeContext.Provider>
  )
}

/** Claims `key` for this component while it's on the page; returns the issues placed with it. */
function useClaim(key: string | undefined): { id: string; issues: readonly RuleWarning[] } {
  const id = useId()
  const scope = useContext(ScopeContext)
  const claim = scope?.claim
  useLayoutEffect(() => (claim && key ? claim(key, id) : undefined), [claim, key, id])
  return { id, issues: (key && scope?.placed.get(id)) || [] }
}

/** A section's issues, shown at its top, under its heading. */
export function SectionIssues({ section }: { section: IssueSection }) {
  const { issues } = useClaim(sectionKey(section))
  return <InlineIssues issues={issues} />
}

/** What a field with issues needs: its control's attributes, the list to show under it, and whether to outline it. */
export interface FieldIssueProps {
  invalid: boolean
  /** For the field's control: aria-invalid and aria-describedby pointing at the list. */
  control: { 'aria-invalid'?: true; 'aria-describedby'?: string }
  list: ReactNode
}

/** A field's issues (`field` as the warnings name it). */
function useFieldIssues(field: string | undefined): FieldIssueProps {
  const { id, issues } = useClaim(field && fieldKey(field))
  const listId = `${id}-issues`
  if (!issues.length) return { invalid: false, control: {}, list: null }
  return { invalid: true, control: { 'aria-invalid': true, 'aria-describedby': listId }, list: <InlineIssues issues={issues} id={listId} /> }
}

/** A field's issues, for its render function: works in loops, where a hook can't go. */
export function IssueField({ field, children }: { field: string | undefined; children: (f: FieldIssueProps) => ReactNode }) {
  return <>{children(useFieldIssues(field))}</>
}
