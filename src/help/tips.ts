/**
 * The "?" popovers (scrpg-aid-designs/help/spec.md, section 3): each names a help section, whose first
 * paragraph is what the popover says, and how its button is read out.
 */
import { blockText } from './markdown'
import { helpSection } from './topics'

export interface HelpTipRef {
  topic: string
  section: string
  /** The button's accessible name: "About the status die". */
  label: string
}

export const HELP_TIPS = {
  statusDie: { topic: 'running-a-game', section: 'status-die', label: 'About the status die' },
  danger: { topic: 'running-a-game', section: 'make-the-scene-more-dangerous', label: 'About making the scene more dangerous' },
  villainTwists: { topic: 'running-a-game', section: 'villain-twists', label: 'About villain twists' },
  sceneTracker: { topic: 'running-a-game', section: 'scene-tracker', label: 'About the scene tracker' },
  challenges: { topic: 'running-a-game', section: 'challenges-and-overcome', label: 'About challenges' },
  setAside: { topic: 'running-a-game', section: 'set-aside', label: 'About set aside' },
  hidden: { topic: 'running-a-game', section: 'hidden', label: 'About hidden' },
  heroPoints: { topic: 'between-issues', section: 'hero-points', label: 'About hero points' },
  backIssues: { topic: 'between-issues', section: 'back-issues', label: 'About back issues' },
  dicePad: { topic: 'playing-a-hero', section: 'dice-pad', label: 'About the dice pad' },
  mods: { topic: 'playing-a-hero', section: 'bonuses-and-penalties', label: 'About persistent and exclusive' },
} as const satisfies Record<string, HelpTipRef>

export type HelpTipName = keyof typeof HELP_TIPS

/** A popover's title and text: its section's heading and first paragraph. */
export function tipContent(name: HelpTipName): { title: string; text: string } {
  const ref = HELP_TIPS[name]
  const section = helpSection(ref.topic, ref.section)
  if (!section) throw new Error(`No help section ${ref.topic}/${ref.section}`)
  const first = section.blocks[0]
  return { title: section.title, text: first ? blockText([first]) : '' }
}
