/** How far in from the strip's left edge the divider sits after scrolling. */
const SCROLL_INSET = 8

/**
 * Where a sideways-scrolling strip scrolls to when the turn passes (scrpg-aid-designs/character-colors/spec.md,
 * section 5a): the acting chip just right of the divider, or at the start when no one has acted. Never
 * past either end.
 */
export function stripScrollLeft({ dividerLeft, chipLeft, scrollWidth, clientWidth }: { dividerLeft?: number | undefined; chipLeft: number; scrollWidth: number; clientWidth: number }): number {
  const target = (dividerLeft ?? chipLeft) - SCROLL_INSET
  return Math.max(0, Math.min(target, scrollWidth - clientWidth))
}
