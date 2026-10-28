/**
 * A villain in the game aid (Phase 5): its Health for this scene's heroes, its zone, and its
 * status die by its archetype's rule (p. 220–234). Pure; changes return the new state with a
 * history entry, like ../play/state.ts (whose Health, mod, twist, and reaction helpers apply to
 * villains too).
 */
import { stepDie } from '../rules/dice'
import type { Die, HealthRange } from '../rules/types'
import type { VillainStatusRule } from '../rules/villain-types'
import { currentHealth, healthZone, type Clock, type PlayZone } from '../play/state'
import type { SceneVillain } from '../session/types'
import { villainDisplayName, type Villain, type VillainPlayState } from './model'
import { buildVillainSheet } from './sheet'

export function emptyVillainPlay(): VillainPlayState {
  return { reactionUsed: false, mods: [], twists: [], history: [] }
}

/** The villain's max Health and zone ranges for the heroes in this scene. */
export function villainHealth(villain: Villain, play: Pick<VillainPlayState, 'heroCount'> | undefined): { maxHealth?: number; healthRanges?: HealthRange } {
  const health = buildVillainSheet({ ...villain, heroCount: play?.heroCount ?? villain.heroCount }).health
  return { ...(health ? { maxHealth: health.max } : {}), ...(health?.ranges ? { healthRanges: health.ranges } : {}) }
}

/** Its current zone: by Health on its chart row; 0 or less is Out (defeated). */
export function villainZone(sheet: { maxHealth?: number; healthRanges?: HealthRange }, play: Pick<VillainPlayState, 'health'>): PlayZone | undefined {
  const health = play.health ?? sheet.maxHealth
  return health === undefined ? undefined : healthZone(sheet, health)
}

/** What a status rule needs from play. */
export type StatusInput = Pick<VillainPlayState, 'statusCount' | 'weaknessTier' | 'challengeParts'> & { zone?: PlayZone }

/**
 * The status die now, by the rule. Health-zone villains use their zone's die (none when Out);
 * count rules use the tier the count falls in; weakness rules the chosen tier (the last, best
 * one until chosen); the Titan starts at its die and drops one size per completed challenge part.
 */
export function villainStatusDie(rule: VillainStatusRule, input: StatusInput): Die | undefined {
  switch (rule.basis) {
    case 'healthZone':
      return input.zone && input.zone !== 'out' ? rule.zones[input.zone] : undefined
    case 'count': {
      const n = Math.max(0, input.statusCount ?? 0)
      return rule.tiers.find((t) => n >= t.min && (t.max === undefined || n <= t.max))?.die
    }
    case 'fixed':
      return rule.die
    case 'weakness':
      return (rule.tiers[input.weaknessTier ?? rule.tiers.length - 1] ?? rule.tiers.at(-1))?.die
    case 'challenge':
      return stepDie(rule.startingDie, -Math.min(input.challengeParts ?? 0, rule.challenge.length), { min: 'd4' })
  }
}

const entry = (clock: Clock, text: string) => ({ id: clock.newId(), at: clock.now.toISOString(), text })
const noted = (play: VillainPlayState, clock: Clock, text: string): VillainPlayState => ({ ...play, history: [...play.history, entry(clock, text)] })

/** Sets the heroes in this scene (unset: the number it's built for). */
export function setSceneHeroes(play: VillainPlayState, count: number | undefined, clock: Clock): VillainPlayState {
  if (count === play.heroCount) return play
  const { heroCount: _, ...rest } = play
  return noted(count === undefined ? rest : { ...rest, heroCount: count }, clock, count === undefined ? 'Back to the heroes it was built for.' : `${count} ${count === 1 ? 'hero' : 'heroes'} in this scene.`)
}

export function setStatusCount(play: VillainPlayState, count: number, clock: Clock): VillainPlayState {
  const n = Math.max(0, Math.round(count))
  return n === (play.statusCount ?? 0) ? play : noted({ ...play, statusCount: n }, clock, `Status count is now ${n}.`)
}

export function setWeaknessTier(play: VillainPlayState, tier: number, condition: string, clock: Clock): VillainPlayState {
  return tier === play.weaknessTier ? play : noted({ ...play, weaknessTier: tier }, clock, `Weakness: ${condition}.`)
}

export function setChallengeParts(play: VillainPlayState, parts: number, clock: Clock): VillainPlayState {
  const n = Math.max(0, Math.round(parts))
  return n === (play.challengeParts ?? 0) ? play : noted({ ...play, challengeParts: n }, clock, `Challenge parts complete: ${n}.`)
}

/** The once-per-scene Overcome that advances the scene tracker (p. 154). */
export function advanceScene(play: VillainPlayState, clock: Clock): VillainPlayState {
  return play.sceneAdvanced ? play : noted({ ...play, sceneAdvanced: true }, clock, 'Used its Overcome to advance the scene tracker (once per scene).')
}

/** A new scene: the reaction and the scene advance are ready again; Health, mods, and twists stay. */
export function newScene(play: VillainPlayState, clock: Clock): VillainPlayState {
  const { sceneAdvanced: _, ...rest } = play
  return noted({ ...rest, reactionUsed: false }, clock, 'New scene: its reaction and scene advance are ready again.')
}

/** Starts over: full Health, no mods, twists, or counts; the history keeps a marker. */
export function resetVillain(play: VillainPlayState, clock: Clock): VillainPlayState {
  return noted({ ...emptyVillainPlay(), history: play.history }, clock, 'Started over: Health restored; mods, twists, and counts cleared.')
}

/** What a game session's table sees of the villain (Phase 5): its Health, zone, status die, mods, and twists. */
export function villainSummary(villain: Villain): Omit<SceneVillain, 'sharedUpTo'> {
  const play = villain.play ?? emptyVillainPlay()
  const health = villainHealth(villain, play)
  const current = currentHealth(health, play)
  const zone = villainZone(health, play)
  const rule = buildVillainSheet(villain).status
  const statusDie = rule ? villainStatusDie(rule, { ...play, zone }) : undefined
  return {
    id: villain.id,
    name: villainDisplayName(villain),
    ...(current !== undefined ? { health: current } : {}),
    ...(health.maxHealth !== undefined ? { maxHealth: health.maxHealth } : {}),
    ...(zone ? { zone } : {}),
    ...(statusDie ? { statusDie } : {}),
    mods: play.mods,
    twists: play.twists,
  }
}
