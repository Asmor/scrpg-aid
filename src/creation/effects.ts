/**
 * Which actions an ability's effects are, for its icons. Abilities from the rules data list
 * their effects (data/README.md, "Ability effects"); a player-written ability (a custom
 * principle's) falls back to the preliminary text rule below.
 *
 * The text rule: the effects an ability produces, worked out from its text (the user's rule, 2026-10-26):
 * an action word is an effect when its clause goes on to say what it's rolled with,
 * "<Action> [...] using <power, quality, or dice>", e.g. Inflict's "Attack using Fire.
 * Hinder that same target using your Min die." gives Attack and Hinder. Other ways the
 * text names the dice count the same: "with your Min die", "equal to your Min die", "by
 * rolling your single [power] die", "with that roll", and the principles' "and use your
 * Max die" (or a following sentence that starts "Use your"). Words joined by "or" or
 * "and" (in a list, with commas) share a clause ("Boost or Hinder using [power]"). Not effects: triggers and
 * nouns ("When you are Attacked", "hit with an Attack", "Attack and Overcome actions"),
 * and choices still in brackets ("[Boost or Hinder]") until they're filled in.
 */

import type { AbilityPick } from '../hero/model'
import type { AbilityEffect, Action } from '../rules/types'

export type { Action }

export const ACTIONS: readonly Action[] = ['attack', 'boost', 'defend', 'hinder', 'overcome', 'recover']

export const ACTION_LABEL: Record<Action, string> = {
  attack: 'Attack',
  boost: 'Boost',
  defend: 'Defend',
  hinder: 'Hinder',
  overcome: 'Overcome',
  recover: 'Recover',
}

/** One action word in the text that's an effect. */
export interface EffectMention {
  action: Action
  /** Where the word starts and ends in the text. */
  start: number
  end: number
}

// A capitalised action word on its own (not "Attacked", "Attacks", or inside another word).
const ACTION_WORD = /\b(Attack|Boost|Defend|Hinder|Overcome|Recover)\b(?![\w’'])/g
// The word is a noun when an article or quantifier comes before it ("an Attack", "each Attack").
const NOUN_BEFORE = /\b(an?|the|this|that|any|all|each|basic|same)\s+$/i
// ...or when "action(s)" follows it or the words joined to it ("Attack and Overcome actions").
const NOUN_AFTER = /^((\s*(,|or|and|, or|, and)\s*(Attack|Boost|Defend|Hinder|Overcome|Recover))*)\s+actions?\b/
// Only joiners between two action words: they share a clause.
const JOINER = /^\s*(,|or|and|, or|, and)\s*$/
// The clause names what it's rolled with.
const DICE = /\busing\b|\bwith (your|that|the)\b[^.;]*?\b(die|dice|roll)\b|\bequal to (your|the)\b|\bby rolling\b|\buse (your|you)\b/i

/** The parts of the text outside [bracketed choices], as [start, end) ranges. */
function outsideBrackets(text: string): [number, number][] {
  const ranges: [number, number][] = []
  let start = 0
  for (const m of text.matchAll(/\[[^\]]*\]/g)) {
    ranges.push([start, m.index])
    start = m.index + m[0].length
  }
  ranges.push([start, text.length])
  return ranges
}

/** Where the sentence holding `from` ends, taking in a following sentence that starts "Use your" (the principles' "… . Use your Max die."). */
function clauseLimit(text: string, from: number): number {
  let end = from
  for (;;) {
    const rest = text.slice(end).search(/[.;!?](\s|$)/)
    if (rest < 0) return text.length
    end += rest
    if (!/^[.;!?]\s+Use (your|you)\b/.test(text.slice(end))) return end
    end += 1
  }
}

/** The action words in the text that are effects, in order. */
export function effectMentions(text: string): EffectMention[] {
  const outside = outsideBrackets(text)
  const inChoice = (i: number) => !outside.some(([s, e]) => i >= s && i < e)
  const words = [...text.matchAll(ACTION_WORD)].filter(
    (m) => !inChoice(m.index) && !NOUN_BEFORE.test(text.slice(Math.max(0, m.index - 12), m.index)) && !NOUN_AFTER.test(text.slice(m.index + m[0].length)),
  )
  // Words joined only by "or", "and" or commas form one group that shares a clause. Commas
  // alone don't make a list ("…a surprise Attack, Defend by rolling…" ends a trigger): a
  // group joined only by commas is split back into single words.
  const joined: { words: typeof words; list: boolean }[] = []
  for (const m of words) {
    const last = joined.at(-1)
    const prev = last?.words.at(-1)
    const between = prev ? text.slice(prev.index + prev[0].length, m.index) : ''
    if (last && JOINER.test(between)) {
      last.words.push(m)
      if (/\b(or|and)\b/.test(between)) last.list = true
    } else joined.push({ words: [m], list: false })
  }
  const groups = joined.flatMap((g) => (g.list ? [g.words] : g.words.map((w) => [w])))
  const mentions: EffectMention[] = []
  groups.forEach((group, i) => {
    const lastWord = group.at(-1)!
    const from = lastWord.index + lastWord[0].length
    // The clause runs to the end of its sentence, or the next action word, whichever comes first.
    const end = Math.min(clauseLimit(text, from), groups[i + 1]?.[0]!.index ?? text.length)
    if (!DICE.test(text.slice(from, end))) return
    for (const m of group) mentions.push({ action: m[1]!.toLowerCase() as Action, start: m.index, end: m.index + m[0].length })
  })
  return mentions
}

/** A player-written ability's effects worked out from its text: each effect word, using the Max die as nearly every principle does. */
export function textEffects(text: string): AbilityEffect[] {
  return abilityEffects(text).map((action) => ({ actions: [action], use: 'max' }))
}

/** Each effect the ability produces, once, in the order the text first gives them. */
export function abilityEffects(text: string): Action[] {
  return [...new Set(effectMentions(text).map((m) => m.action))]
}

/**
 * The actions an ability's effects are, once each, in order. An effect whose actions come
 * from a [blank] ("[Boost or Hinder]") is narrowed to the player's choice there, if made.
 */
export function effectActions(effects: readonly AbilityEffect[], blanks: AbilityPick['blanks'] = {}): Action[] {
  return [...new Set(effects.flatMap((e) => narrowEffect(e, blanks).actions))]
}

/** An effect whose actions come from a [blank], narrowed to the player's choice there (if it names one of them). */
export function narrowEffect(effect: AbilityEffect, blanks: AbilityPick['blanks'] = {}): AbilityEffect {
  const chosen = effect.fromBlank ? blanks?.[effect.fromBlank] : undefined
  const picked = typeof chosen === 'string' && chosen.trim() ? effect.actions.filter((a) => ACTION_LABEL[a] === chosen.trim()) : []
  return picked.length ? { ...effect, actions: picked } : effect
}

/**
 * The action words in the text that name one of `actions` (an ability's effects), for the
 * inline icons: every one that isn't a noun or trigger ("an Attack", "Attacked") or inside a
 * [bracketed choice].
 */
export function actionMentions(text: string, actions: readonly Action[]): EffectMention[] {
  const outside = outsideBrackets(text)
  const inChoice = (i: number) => !outside.some(([s, e]) => i >= s && i < e)
  return [...text.matchAll(ACTION_WORD)]
    .filter((m) => !inChoice(m.index) && !NOUN_BEFORE.test(text.slice(Math.max(0, m.index - 12), m.index)) && !NOUN_AFTER.test(text.slice(m.index + m[0].length)))
    .map((m) => ({ action: m[1]!.toLowerCase() as Action, start: m.index, end: m.index + m[0].length }))
    .filter((m) => actions.includes(m.action))
}
