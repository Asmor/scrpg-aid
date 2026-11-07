/** What colors an actor on the table has (scrpg-aid-designs/character-colors/spec.md, sections 2 and 4). Pure. */
import { appearanceOf, side, SIDE_COLOR, type Appearance, type ColoredItem, type Side } from '../colors/palette'
import type { ActorRef } from './model'
import type { TableView } from './project'

/** An actor as colors see it. */
export function actorColored(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>, ref: ActorRef): ColoredItem {
  switch (ref.kind) {
    case 'hero':
      return { kind: 'hero', appearance: view.heroes.find((h) => h.id === ref.id)?.sheet.appearance }
    case 'villain':
      return { kind: 'villain', appearance: view.villains.find((v) => v.id === ref.id)?.appearance }
    case 'group': {
      const group = view.groups.find((g) => g.id === ref.id)
      return { kind: 'group', environment: group?.owner.kind === 'environment', color: group?.color }
    }
    default:
      return { kind: 'environment', color: view.environment?.color }
  }
}

export interface ActorColors {
  side: Side
  appearance: Appearance
}

export function actorColors(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>, ref: ActorRef): ActorColors {
  const item = actorColored(view, ref)
  return { side: side(item), appearance: appearanceOf(item) }
}

export const SIDE_WORD: Record<Side, string> = { gm: 'GM side', heroes: 'heroes', environment: 'environment' }

export const sideToken = (s: Side) => `var(--char-${SIDE_COLOR[s]})`
