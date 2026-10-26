/** The die and action icons (public/icons), loaded from the IconSource context (./icon-source.ts). */
import { useContext, type ReactNode } from 'react'
import { ACTION_LABEL, effectMentions, type Action } from '../creation/effects'
import type { Die } from '../rules/types'
import { IconSource } from './icon-source'

/** A die's icon. Decorative when the die's size is written beside it. */
export function DieIcon({ die, decorative = true }: { die: Die; decorative?: boolean }) {
  const src = useContext(IconSource)(`die/${die}`)
  return <img className="die-icon" src={src} alt={decorative ? '' : die} aria-hidden={decorative || undefined} />
}

/** A die's icon followed by its size, e.g. "[icon] d8". */
export function DieLabel({ die }: { die: Die }) {
  return (
    <span className="die-label">
      <DieIcon die={die} />
      {die}
    </span>
  )
}

/** "d10 and d10", each with its icon. */
export function DiceList({ dice }: { dice: readonly Die[] }) {
  return (
    <>
      {dice.map((d, i) => (
        <span key={i}>
          {i > 0 && (i === dice.length - 1 ? ' and ' : ', ')}
          <DieLabel die={d} />
        </span>
      ))}
    </>
  )
}

/** An action's icon. Decorative when the action's name is written beside it. */
export function ActionIcon({ action, decorative = false }: { action: Action; decorative?: boolean }) {
  const src = useContext(IconSource)(`action/${action}`)
  const label = ACTION_LABEL[action]
  return <img className="action-icon" src={src} alt={decorative ? '' : label} title={decorative ? undefined : label} aria-hidden={decorative || undefined} />
}

/** Ability text with an icon before each action word that's one of its effects (../creation/effects.ts). */
export function AbilityText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let at = 0
  for (const m of effectMentions(text)) {
    parts.push(text.slice(at, m.start))
    parts.push(
      <span key={m.start} className="effect-word">
        <ActionIcon action={m.action} decorative />
        {text.slice(m.start, m.end)}
      </span>,
    )
    at = m.end
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}
