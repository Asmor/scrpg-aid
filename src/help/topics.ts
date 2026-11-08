/** The Help page's topics, in the order the page lists them (scrpg-aid-designs/help/spec.md, section 2). */
import gettingStarted from './getting-started.md?raw'
import buildingHeroes from './building-heroes.md?raw'
import villainsAndNpcs from './villains-and-npcs.md?raw'
import runningAGame from './running-a-game.md?raw'
import playingAHero from './playing-a-hero.md?raw'
import betweenIssues from './between-issues.md?raw'
import settingsAndData from './settings-and-data.md?raw'
import glossary from './glossary.md?raw'
import { parseTopic, type HelpSection, type HelpTopic } from './markdown'

export const GLOSSARY_ID = 'glossary'

export const HELP_TOPICS: readonly HelpTopic[] = [
  parseTopic('getting-started', gettingStarted),
  parseTopic('building-heroes', buildingHeroes),
  parseTopic('villains-and-npcs', villainsAndNpcs),
  parseTopic('running-a-game', runningAGame),
  parseTopic('playing-a-hero', playingAHero),
  parseTopic('between-issues', betweenIssues),
  parseTopic('settings-and-data', settingsAndData),
  parseTopic(GLOSSARY_ID, glossary),
]

export function helpTopic(id: string, topics: readonly HelpTopic[] = HELP_TOPICS): HelpTopic | undefined {
  return topics.find((t) => t.id === id)
}

export function helpSection(topicId: string, sectionId: string, topics: readonly HelpTopic[] = HELP_TOPICS): HelpSection | undefined {
  return helpTopic(topicId, topics)?.sections.find((s) => s.id === sectionId)
}
