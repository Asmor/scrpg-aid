/**
 * Major rewrite (docs/design/advancement/spec.md, section 3; Core Rules p. 143): the hero is
 * rebuilt with the constructed method, keeping history and collections. Pure.
 *
 * Starting builds the swaps in, so the wizard shows the hero as they are now and nothing is applied
 * twice. The entry goes in straight away with the build as it was, and stays `open` until Done
 * editing says what changed. Leaving the wizard half way leaves it open, to carry on from.
 */
import { advancedHero } from '../creation/advancement'
import { sheetDiff } from '../game/sheet-diff'
import type { AdvancementEntry, Hero, HeroBuild } from '../hero/model'
import type { Clock } from '../play/state'
import { followed, historyEntry } from './records'

/** The rewrite still going on in the wizard, if there is one. */
export const openRewrite = (hero: Pick<Hero, 'advancement'>): AdvancementEntry | undefined => hero.advancement.find((e) => e.kind === 'rewrite' && e.open)

function buildOf(hero: Hero): HeroBuild {
  const { method, rollMode, details, traitNames, background, powerSource, archetype, personality, redAbilities, retcon, health } = hero
  return structuredClone({ method, ...(rollMode ? { rollMode } : {}), details, traitNames, background, powerSource, archetype, personality, redAbilities, retcon, health })
}

/** Opens a rewrite: the current build is kept for Undo, and the method becomes Constructed. */
export function startRewrite(hero: Hero, clock: Clock): Hero {
  if (openRewrite(hero)) return hero
  const { rollMode: _, ...built } = advancedHero(hero)
  const by = followed(hero)
  const entry = historyEntry(clock, 'rewrite', 'Rebuilding with the constructed method.', { before: buildOf(hero), open: true, ...(by ? { after: by } : {}) })
  return { ...built, method: 'constructed', advancement: [...hero.advancement, entry] }
}

/** The most changes the history sentence names. */
const NAMED_CHANGES = 6

/** Done editing: the entry says what changed, from the edit summary's diff, and is closed. */
export function finishRewrite(hero: Hero, clock: Clock): Hero {
  const entry = openRewrite(hero)
  if (!entry?.before) return hero
  const earlier = hero.advancement.slice(0, hero.advancement.indexOf(entry))
  const was: Hero = { ...hero, ...entry.before, advancement: earlier }
  const changes = sheetDiff(was, { ...hero, advancement: [] }).flatMap((s) => s.changes)
  const named = changes.slice(0, NAMED_CHANGES).join('; ')
  const more = changes.length > NAMED_CHANGES ? `; and ${changes.length - NAMED_CHANGES} more` : ''
  const text = `Rebuilt with the constructed method. ${changes.length ? `${named}${more}.` : 'Nothing changed.'}`
  const { open: _, ...closed } = entry
  return { ...hero, advancement: hero.advancement.map((e) => (e === entry ? { ...closed, at: clock.now.toISOString(), text } : e)) }
}
