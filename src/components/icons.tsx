/** The die and action icons (public/icons), loaded from the IconSource context (./icon-source.ts). */
import { useContext, type ReactNode } from 'react'
import { ACTION_LABEL, actionMentions, effectMentions, type Action } from '../creation/effects'
import type { Die } from '../rules/types'
import { useSettings } from '../settings/context'
import { IconSource } from './icon-source'

/** How big a die is drawn: 44px beside a villain's status; 24px in dice rows, slots and tables; 18px in compact lists; 16px inline in a sentence. */
export type DieSize = 'large' | 'normal' | 'compact' | 'inline'

/**
 * A die, shown as its icon alone, with its size ("d8") as the alt text, or as the text "d8" in the
 * same box with the "Show dice as" setting. Otherwise the size is only written out where an image
 * can't go (dropdown options, aria-labels, Markdown).
 */
export function DieIcon({ die, size = 'normal' }: { die: Die; size?: DieSize }) {
  const src = useContext(IconSource)(`die/${die}`)
  const box = size === 'normal' ? 'die-icon' : `die-icon die-icon--${size}`
  const { diceDisplay } = useSettings().settings
  if (diceDisplay === 'text') {
    return (
      <span className={`${box} die-text`} role="img" aria-label={die} title={die}>
        {die}
      </span>
    )
  }
  return <img className={box} src={src} alt={die} title={die} />
}

/** "[d10] and [d10]": the dice as icons, joined like words. */
export function DiceList({ dice, size = 'inline' }: { dice: readonly Die[]; size?: DieSize }) {
  return (
    <>
      {dice.map((d, i) => (
        <span key={i}>
          {i > 0 && (i === dice.length - 1 ? ' and ' : ', ')}
          <DieIcon die={d} size={size} />
        </span>
      ))}
    </>
  )
}

/** Text with each die size in it ("d4" to "d12") shown as the die's icon instead, e.g. a rule message. */
export function DiceText({ text, size = 'inline' }: { text: string; size?: DieSize }) {
  return (
    <>
      {text.split(/\b(d(?:4|6|8|10|12))\b/).map((part, i) => (i % 2 === 1 ? <DieIcon key={i} die={part as Die} size={size} /> : part))}
    </>
  )
}

/** An action's icon. Decorative when the action's name is written beside it. */
export function ActionIcon({ action, decorative = false }: { action: Action; decorative?: boolean }) {
  const src = useContext(IconSource)(`action/${action}`)
  const label = ACTION_LABEL[action]
  return <img className="action-icon" src={src} alt={decorative ? '' : label} title={decorative ? undefined : label} aria-hidden={decorative || undefined} />
}

/**
 * The action icons of an ability listed by name, in the order its effects appear, to go
 * before the name. Each is named (alt and title), since the name alone doesn't say what the
 * ability does. An ability with no basic-action effect shows nothing.
 */
export function AbilityIcons({ actions }: { actions: readonly Action[] }) {
  if (actions.length === 0) return null
  return (
    <span className="ability-icons">
      {actions.map((a, i) => (
        <ActionIcon key={`${a}:${i}`} action={a} />
      ))}
    </span>
  )
}

/**
 * Ability text with an icon before each action word that's one of its effects, and each die
 * size shown as its icon. Pass the ability's effects' `actions` (../creation/effects.ts);
 * without them, the preliminary text rule finds the effect words.
 */
export function AbilityText({ text, actions }: { text: string; actions?: readonly Action[] }) {
  const parts: ReactNode[] = []
  let at = 0
  const plain = (s: string, key: number) => <DiceText key={`t${key}`} text={s} />
  for (const m of actions ? actionMentions(text, actions) : effectMentions(text)) {
    parts.push(plain(text.slice(at, m.start), at))
    parts.push(
      <span key={m.start} className="effect-word">
        <ActionIcon action={m.action} decorative />
        {text.slice(m.start, m.end)}
      </span>,
    )
    at = m.end
  }
  parts.push(plain(text.slice(at), at))
  return <>{parts}</>
}
