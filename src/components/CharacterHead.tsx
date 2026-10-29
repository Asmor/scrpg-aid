/**
 * Parts of a character page's header shared by heroes and villains
 * (docs/design/hero-sheet/spec.md, "Header"): the Sheet/Play switch and the rule-issues banner.
 */
import { DiceText } from './icons'

export type CharacterMode = 'sheet' | 'play'

/** The Sheet/Play switch: two buttons, the current one pressed. */
export function ModeSwitch({ mode, onChange }: { mode: CharacterMode; onChange: (mode: CharacterMode) => void }) {
  return (
    <div className="segmented segmented--big" role="group" aria-label="Mode">
      {(
        [
          ['sheet', 'Sheet'],
          ['play', 'Play'],
        ] as const
      ).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={mode === value} onClick={() => mode !== value && onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** "N rule issues", the first one's text, and a link to fix them; nothing when there are none. */
export function IssueBanner({ issues, href }: { issues: readonly { message: string }[]; href: string }) {
  if (!issues.length) return null
  return (
    <div className="issue-banner" role="note">
      <strong>{issues.length === 1 ? '1 rule issue' : `${issues.length} rule issues`}</strong>
      <span className="issue-banner__first">
        <DiceText text={issues[0]!.message} />
      </span>
      <a href={href}>Open in edit</a>
    </div>
  )
}
