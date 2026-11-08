/**
 * Arranging a reference sheet (scrpg-aid-designs/reference-sheets/spec.md, sections 4 and 5): the
 * default order, keeping a saved order as a scene's contents change, and the moves. Pure: each
 * takes an arrangement and returns a new one.
 */
import { CARD_TYPES, sameSheetRef, sheetRefKey, type CardType, type SheetArrangement, type SheetCard, type SheetContents, type SheetItemRef } from './model'

const byName = (a: SheetCard, b: SheetCard) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/**
 * Cards by type (environments, challenges, lieutenants, minions), each type by name, with an
 * environment's attached templates after the other cards of their type. No breaks.
 */
export function defaultCardOrder(cards: readonly SheetCard[]): SheetCard[] {
  return CARD_TYPES.flatMap((type) => {
    const of = cards.filter((c) => c.type === type)
    const own = of.filter((c) => !c.brought).sort(byName)
    const brought = of.filter((c) => c.brought).sort(byName)
    return [...own, ...brought]
  })
}

export function defaultArrangement(contents: Pick<SheetContents, 'pages' | 'cards'>): SheetArrangement {
  return {
    pages: contents.pages.map((p) => p.ref),
    cards: defaultCardOrder(contents.cards).map((c) => ({ ref: c.ref })),
    omitted: [],
  }
}

const has = (list: readonly SheetItemRef[], ref: SheetItemRef) => list.some((r) => sameSheetRef(r, ref))

/**
 * A saved arrangement for the contents now: items that are gone are dropped (with their breaks),
 * full pages that are new go at the end, and new cards go at the end of their type's run (or
 * after the cards of earlier types, when there are none of it).
 */
export function reconcileArrangement(saved: SheetArrangement, contents: Pick<SheetContents, 'pages' | 'cards'>): SheetArrangement {
  const pageRefs = contents.pages.map((p) => p.ref)
  const cardRefs = contents.cards.map((c) => c.ref)
  const typeOf = new Map(contents.cards.map((c) => [sheetRefKey(c.ref), c.type]))
  const omitted = saved.omitted.filter((r) => has(pageRefs, r) || has(cardRefs, r))
  const pages = saved.pages.filter((r) => has(pageRefs, r))
  for (const r of pageRefs) if (!has(pages, r) && !has(omitted, r)) pages.push(r)
  const cards = saved.cards.filter((c) => has(cardRefs, c.ref))
  for (const card of defaultCardOrder(contents.cards)) {
    if (cards.some((c) => sameSheetRef(c.ref, card.ref)) || has(omitted, card.ref)) continue
    cards.splice(insertAt(cards, card.type, typeOf), 0, { ref: card.ref })
  }
  return { pages, cards, omitted }
}

/** Where a new card of a type goes: after the last of its type, or else after the last card of an earlier type. */
function insertAt(cards: SheetArrangement['cards'], type: CardType, typeOf: ReadonlyMap<string, CardType>): number {
  const rank = (t: CardType | undefined) => (t ? CARD_TYPES.indexOf(t) : CARD_TYPES.length)
  const own = cards.findLastIndex((c) => typeOf.get(sheetRefKey(c.ref)) === type)
  if (own >= 0) return own + 1
  return cards.findLastIndex((c) => rank(typeOf.get(sheetRefKey(c.ref))) < rank(type)) + 1
}

/** Moves the card at `from` to index `to` in print order (clamped). A break travels with its card. */
export function moveCard(arrangement: SheetArrangement, from: number, to: number): SheetArrangement {
  const cards = [...arrangement.cards]
  if (from < 0 || from >= cards.length) return arrangement
  const [card] = cards.splice(from, 1)
  const at = Math.max(0, Math.min(to, cards.length))
  cards.splice(at, 0, card!)
  return at === from ? arrangement : { ...arrangement, cards }
}

/** Moves the full page at `from` to index `to` (clamped). */
export function movePage(arrangement: SheetArrangement, from: number, to: number): SheetArrangement {
  const pages = [...arrangement.pages]
  if (from < 0 || from >= pages.length) return arrangement
  const [page] = pages.splice(from, 1)
  const at = Math.max(0, Math.min(to, pages.length))
  pages.splice(at, 0, page!)
  return at === from ? arrangement : { ...arrangement, pages }
}

/** Sets or clears the break before the card at `index`. The first card can't have one. */
export function setBreak(arrangement: SheetArrangement, index: number, kind: 'column' | 'page' | undefined): SheetArrangement {
  const card = arrangement.cards[index]
  if (!card || (index === 0 && kind)) return arrangement
  const cards = [...arrangement.cards]
  cards[index] = kind ? { ref: card.ref, breakBefore: kind } : { ref: card.ref }
  return { ...arrangement, cards }
}

/** Leaves an item out: it moves to the omitted list. */
export function leaveOut(arrangement: SheetArrangement, ref: SheetItemRef): SheetArrangement {
  if (has(arrangement.omitted, ref)) return arrangement
  return {
    pages: arrangement.pages.filter((r) => !sameSheetRef(r, ref)),
    cards: arrangement.cards.filter((c) => !sameSheetRef(c.ref, ref)),
    omitted: [...arrangement.omitted, ref],
  }
}

/** Puts a left-out item back: a full page at the end, a card at the end of its type's run. */
export function putBack(arrangement: SheetArrangement, ref: SheetItemRef, contents: Pick<SheetContents, 'pages' | 'cards'>): SheetArrangement {
  return reconcileArrangement(
    {
      ...arrangement,
      omitted: arrangement.omitted.filter((r) => !sameSheetRef(r, ref)),
    },
    contents,
  )
}

/** Whether anything differs from the default arrangement (Sort by type asks first when it does). */
export function isRearranged(arrangement: SheetArrangement, contents: Pick<SheetContents, 'pages' | 'cards'>): boolean {
  const def = defaultArrangement(contents).cards.filter((c) => !has(arrangement.omitted, c.ref))
  return arrangement.cards.length !== def.length || arrangement.cards.some((c, i) => c.breakBefore !== undefined || !sameSheetRef(c.ref, def[i]!.ref))
}

/** Sort by type: the default order, no breaks, keeping what's left out. */
export function sortByType(arrangement: SheetArrangement, contents: Pick<SheetContents, 'pages' | 'cards'>): SheetArrangement {
  const def = defaultArrangement(contents)
  return {
    pages: arrangement.pages,
    cards: def.cards.filter((c) => !has(arrangement.omitted, c.ref)),
    omitted: arrangement.omitted,
  }
}
