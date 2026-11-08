/**
 * What goes on a reference sheet (scrpg-aid-designs/reference-sheets/spec.md, sections 3 and 5):
 * a library selection's items, or a scene's, made into full pages and cards. Pure.
 */
import { appearanceOf } from '../colors/palette'
import { currentIssue, issueName, nextIssueNumber, sceneName, sceneNumber, trackerFromCounts, gameDisplayName, type Challenge, type EnvironmentOnTable, type Game, type NpcGroup, type VillainInGame } from '../game/model'
import { findItem } from '../game/scenes'
import { boxLabel } from '../game/table'
import { heroDisplayName, isDraft, type Hero } from '../hero/model'
import type { Die, Zone } from '../rules/types'
import { trackerName } from '../rules/trackers'
import { templateName, type ChallengeTemplate, type EnvironmentTemplate, type EnvironmentTwist, type LieutenantTemplate, type MinionTemplate } from '../template/model'
import { isVillainDraft, villainDisplayName, type Villain } from '../villain/model'
import type { CardTwist, ChallengeCard, EnvironmentCard, HiddenMark, NpcCard, PageItem, SheetCard, SheetContents, SheetItemRef, SheetOptions } from './model'
import { sameSheetRef } from './model'

/** A library item, by its type. */
export type LibrarySheetItem =
  | { kind: 'hero'; doc: Hero }
  | { kind: 'villain'; doc: Villain }
  | { kind: 'minion'; doc: MinionTemplate }
  | { kind: 'lieutenant'; doc: LieutenantTemplate }
  | { kind: 'challenge'; doc: ChallengeTemplate }
  | { kind: 'environment'; doc: EnvironmentTemplate }

export type AttachableKind = 'minion' | 'lieutenant' | 'challenge'

/** Finds an environment's attached template in the library; undefined when it's gone. */
export type LibrarySheetLookup = (kind: AttachableKind, id: string) => MinionTemplate | LieutenantTemplate | ChallengeTemplate | undefined

/** Where a reference sheet's items come from. */
export type SheetSource = { kind: 'library'; items: readonly LibrarySheetItem[]; lookup: LibrarySheetLookup } | { kind: 'scene'; game: Game; sceneId: string }

const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

const ZONE_ORDER: readonly Zone[] = ['green', 'yellow', 'red']

/** Twists grouped Green, Yellow, Red, minor before major; otherwise in their own order. */
function cardTwists(twists: readonly (EnvironmentTwist & { used?: unknown })[]): CardTwist[] {
  const rank = (t: EnvironmentTwist) => ZONE_ORDER.indexOf(t.zone) * 2 + (t.kind === 'major' ? 1 : 0)
  return twists
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => ({
      zone: t.zone,
      kind: t.kind,
      ...(t.name?.trim() ? { name: t.name.trim() } : {}),
      text: t.text,
      used: Boolean(t.used),
    }))
}

const memberBoxes = (die: Die, count: number) => Array.from({ length: count }, () => ({ die, out: false }))

function npcTemplateCard(kind: 'minion' | 'lieutenant', doc: MinionTemplate | LieutenantTemplate, from?: string): NpcCard {
  return {
    ref: { kind, id: doc.id },
    type: kind,
    name: templateName(doc, kind),
    appearance: appearanceOf({
      kind: 'group',
      environment: Boolean(from),
      color: doc.color,
    }),
    ...(from ? { from } : {}),
    die: doc.die,
    actions: doc.actions,
    notes: doc.notes,
    abilities: 'abilities' in doc ? doc.abilities : [],
    members: memberBoxes(doc.die, doc.groupSize),
  }
}

function challengeTemplateCard(doc: ChallengeTemplate, from?: string): ChallengeCard {
  return {
    ref: { kind: 'challenge', id: doc.id },
    type: 'challenge',
    name: templateName(doc, 'challenge'),
    appearance: appearanceOf({
      kind: 'challenge',
      environment: Boolean(from),
      color: doc.color,
    }),
    ...(from ? { from } : {}),
    description: doc.description,
    steps: doc.steps.map((s) => ({ label: s.label, done: false })),
    whenDone: doc.done,
  }
}

const attachableCard = (doc: MinionTemplate | LieutenantTemplate | ChallengeTemplate, kind: AttachableKind, from: string): SheetCard => ({
  ...(kind === 'challenge' ? challengeTemplateCard(doc as ChallengeTemplate, from) : npcTemplateCard(kind, doc as MinionTemplate, from)),
  brought: true,
})

const heroPage = (hero: Hero, ref: SheetItemRef, hidden?: HiddenMark): PageItem => ({
  ref,
  kind: 'hero',
  hero,
  name: heroDisplayName(hero),
  draft: isDraft(hero),
  ...(hidden ? { hidden } : {}),
})
const villainPage = (villain: Villain, ref: SheetItemRef, hidden?: HiddenMark): PageItem => ({
  ref,
  kind: 'villain',
  villain,
  name: villainDisplayName(villain),
  draft: isVillainDraft(villain),
  ...(hidden ? { hidden } : {}),
})

/** Full pages in their default order: heroes, then villains, each by name. */
const pageOrder = (pages: PageItem[]) => [...byName(pages.filter((p) => p.kind === 'hero')), ...byName(pages.filter((p) => p.kind === 'villain'))]

function libraryContents(source: Extract<SheetSource, { kind: 'library' }>, options: Pick<SheetOptions, 'bringAttached'>): SheetContents {
  const pages: PageItem[] = []
  const cards: SheetCard[] = []
  const brought: SheetCard[] = []
  for (const item of source.items) {
    const ref = { kind: item.kind, id: item.doc.id }
    switch (item.kind) {
      case 'hero':
        pages.push(heroPage(item.doc, ref))
        break
      case 'villain':
        pages.push(villainPage(item.doc, ref))
        break
      case 'minion':
      case 'lieutenant':
        cards.push(npcTemplateCard(item.kind, item.doc))
        break
      case 'challenge':
        cards.push(challengeTemplateCard(item.doc))
        break
      case 'environment': {
        const from = templateName(item.doc, 'environment')
        const found = item.doc.attached.flatMap((a) => {
          const doc = source.lookup(a.kind, a.templateId)
          return doc ? [{ doc, kind: a.kind }] : []
        })
        cards.push(
          environmentCard({
            ref,
            name: from,
            color: item.doc.color,
            description: item.doc.description,
            aspects: item.doc.aspects,
            twists: item.doc.twists,
            brings: found.map((f) => templateName(f.doc, f.kind)),
          }),
        )
        // A missing attached template is skipped; one already selected, or brought by another environment, is added once.
        for (const f of found) {
          const card = attachableCard(f.doc, f.kind, from)
          if (!brought.some((b) => sameSheetRef(b.ref, card.ref))) brought.push(card)
        }
        break
      }
    }
  }
  const extra = brought.filter((b) => !cards.some((c) => sameSheetRef(c.ref, b.ref)))
  return {
    pages: pageOrder(pages),
    cards: options.bringAttached ? [...cards, ...extra] : cards,
    bringable: extra.map((c) => c.name),
  }
}

function environmentCard(e: {
  ref: SheetItemRef
  name: string
  color: EnvironmentTemplate['color']
  description: string | undefined
  aspects: EnvironmentCard['aspects'] | undefined
  twists: readonly (EnvironmentTwist & { used?: unknown })[] | undefined
  brings: string[]
  hidden?: HiddenMark
}): EnvironmentCard {
  return {
    ref: e.ref,
    type: 'environment',
    name: e.name,
    appearance: appearanceOf({ kind: 'environment', color: e.color }),
    ...(e.hidden ? { hidden: e.hidden } : {}),
    description: e.description ?? '',
    aspects: e.aspects ?? [],
    twists: cardTwists(e.twists ?? []),
    brings: e.brings,
  }
}

const DIE_RANK: readonly Die[] = ['d4', 'd6', 'd8', 'd10', 'd12']

/** A group on the table, as it is: one box per member number, crossed out when that member is out. */
function groupCard(group: NpcGroup, environmentName: string | undefined, hidden?: HiddenMark): NpcCard {
  const top = group.members.reduce<Die | undefined>((a, m) => (!a || DIE_RANK.indexOf(m.die) > DIE_RANK.indexOf(a) ? m.die : a), undefined)
  const last = group.members.reduce((n, m) => Math.max(n, m.n), 0)
  const members = Array.from({ length: last }, (_, i) => {
    const m = group.members.find((x) => x.n === i + 1)
    return m ? { die: m.die, out: false } : { die: top ?? 'd6', out: true }
  })
  const from = group.owner.kind === 'environment' ? environmentName : undefined
  return {
    ref: { kind: 'group', id: group.id },
    type: group.kind === 'minions' ? 'minion' : 'lieutenant',
    name: group.name.trim() || (group.kind === 'minions' ? 'Minions' : 'Lieutenants'),
    appearance: appearanceOf({
      kind: 'group',
      environment: group.owner.kind === 'environment',
      color: group.color,
    }),
    ...(from ? { from } : {}),
    ...(hidden ? { hidden } : {}),
    ...(top ? { die: top } : {}),
    actions: group.actions,
    notes: '',
    abilities: group.abilities ?? [],
    members,
  }
}

function challengeCard(c: Challenge, environmentName: string | undefined, hidden?: HiddenMark): ChallengeCard {
  const from = c.owner.kind === 'environment' ? environmentName : undefined
  return {
    ref: { kind: 'challenge', id: c.id },
    type: 'challenge',
    name: c.name.trim() || 'Challenge',
    appearance: appearanceOf({
      kind: 'challenge',
      environment: c.owner.kind === 'environment',
      color: c.color,
    }),
    ...(from ? { from } : {}),
    ...(hidden ? { hidden } : {}),
    description: c.description ?? '',
    steps: c.steps.map((s) => ({ label: s.label, done: s.done })),
    whenDone: c.whenDone ?? '',
  }
}

/** What an environment on the table or in a scene brings, as cards: each attached copy. */
function broughtCards(env: EnvironmentOnTable): SheetCard[] {
  return (env.attached ?? []).map((a): SheetCard => {
    const from = env.name
    if (a.kind === 'challenge')
      return {
        ref: { kind: 'challenge', id: a.templateId },
        type: 'challenge',
        name: a.name,
        appearance: appearanceOf({
          kind: 'challenge',
          environment: true,
          color: a.color,
        }),
        from,
        brought: true,
        description: a.description ?? '',
        steps: a.labels.map((label) => ({ label, done: false })),
        whenDone: a.whenDone ?? '',
      }
    return {
      ref: { kind: a.kind, id: a.templateId },
      type: a.kind,
      name: a.name,
      appearance: appearanceOf({
        kind: 'group',
        environment: true,
        color: a.color,
      }),
      from,
      brought: true,
      die: a.die,
      actions: a.actions,
      notes: '',
      abilities: [],
      members: memberBoxes(a.die, a.groupSize),
    }
  })
}

/** A card's template, for telling whether an attached template is already there. */
const cardTemplate = (card: SheetCard, game: Game): string | undefined => {
  if (card.ref.kind === 'group') return game.groups.find((g) => g.id === card.ref.id)?.templateId ?? game.offTable.groups.find((g) => g.id === card.ref.id)?.templateId
  if (card.ref.kind === 'challenge') return (game.challenges.find((c) => c.id === card.ref.id) ?? game.offTable.challenges.find((c) => c.id === card.ref.id))?.templateId ?? card.ref.id
  return card.ref.id
}

function sceneContents(game: Game, sceneId: string, options: Pick<SheetOptions, 'bringAttached' | 'includeHeroes'>): SheetContents {
  const scene = game.scenes.find((s) => s.id === sceneId)
  if (!scene) throw new Error('that scene is no longer in the game')
  const now = scene.state === 'now'
  const mark = (hidden: boolean): HiddenMark | undefined => (hidden ? (now ? 'now' : 'starts') : undefined)
  const pages: PageItem[] = []
  const cards: SheetCard[] = []
  let env: EnvironmentOnTable | undefined
  if (now) {
    env = game.environment
    for (const v of game.villains) pages.push(villainPage(v.sheet, { kind: 'villain', id: v.id }, mark(v.hidden)))
    for (const g of game.groups) cards.push(groupCard(g, env?.name, mark(g.hidden)))
    for (const c of game.challenges) cards.push(challengeCard(c, env?.name, mark(c.hidden)))
  } else {
    env = scene.environmentId ? (findItem(game, { kind: 'environment', id: scene.environmentId }) as EnvironmentOnTable | undefined) : undefined
    for (const item of scene.opposition) {
      const found = findItem(game, item.ref)
      if (!found) continue
      const hidden = mark(item.startHidden)
      if (item.ref.kind === 'villain') pages.push(villainPage((found as VillainInGame).sheet, { kind: 'villain', id: found.id }, hidden))
      else if (item.ref.kind === 'group') cards.push(groupCard(found as NpcGroup, env?.name, hidden))
      else if (item.ref.kind === 'challenge') cards.push(challengeCard(found as Challenge, env?.name, hidden))
    }
  }
  let bringable: string[] = []
  if (env) {
    const envHidden = mark(now ? env.hidden : Boolean(scene.environmentHidden))
    const brought = broughtCards(env)
    // Something it brings that's already in the scene (added on its turn, or planned) isn't added again.
    const extra = brought.filter((b) => !cards.some((c) => c.type === b.type && cardTemplate(c, game) === b.ref.id))
    cards.unshift(
      environmentCard({
        ref: { kind: 'environment', id: env.id },
        name: env.name,
        color: env.color,
        description: env.description,
        aspects: env.aspects,
        twists: env.twists,
        brings: brought.map((b) => b.name),
        ...(envHidden ? { hidden: envHidden } : {}),
      }),
    )
    bringable = extra.map((c) => c.name)
    if (options.bringAttached) cards.push(...extra)
  }
  if (options.includeHeroes) for (const h of game.heroes) pages.push(heroPage(h.sheet, { kind: 'hero', id: h.id }))
  const zones = trackerFromCounts(scene.tracker)
  const issue = scene.issueId ? game.issues.find((i) => i.id === scene.issueId) : currentIssue(game)
  const number = sceneNumber(game, scene.id)
  const issueText = issue ? issueName(issue) : `Issue ${nextIssueNumber(game)}`
  return {
    pages: pageOrder(pages),
    cards,
    bringable,
    scene: {
      gameName: gameDisplayName(game),
      where: `${issueText} · Scene ${number}`,
      name: scene.name.trim() ? sceneName(scene) : `Scene ${number}`,
      number,
      tracker: {
        counts: scene.tracker,
        name: trackerName(scene.tracker),
        zones,
        filled: now ? Math.min(scene.position + 1, zones.length) : 0,
        ...(now ? { now: boxLabel(zones, scene.position) } : {}),
      },
      notes: scene.notes,
    },
  }
}

/** The items for a library selection or a scene. */
export function sheetContents(source: SheetSource, options: Pick<SheetOptions, 'bringAttached' | 'includeHeroes'>): SheetContents {
  return source.kind === 'library' ? libraryContents(source, options) : sceneContents(source.game, source.sceneId, options)
}
