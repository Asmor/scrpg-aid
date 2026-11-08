/**
 * The app's keyboard shortcuts, in one table (scrpg-aid-designs/help/spec.md, section 5). The
 * Keyboard shortcuts dialog is built from it, so add a row here whenever a shortcut is added.
 */

export type ShortcutGroup = 'Anywhere' | 'Game table' | 'Dice pad' | 'Rolling'

export interface Shortcut {
  group: ShortcutGroup
  /** Key caps, in order. */
  keys: readonly string[]
  /** The keys are the two ends of a range ("1–9"), not keys held together. */
  range?: true
  /** How the keys are read out, where the caps alone aren't clear. */
  spoken?: string
  action: string
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Anywhere', 'Game table', 'Dice pad', 'Rolling']

export const SHORTCUTS: readonly Shortcut[] = [
  { group: 'Anywhere', keys: ['?'], spoken: 'Question mark', action: 'This list' },
  { group: 'Anywhere', keys: ['/'], spoken: 'Slash', action: 'Search (library, help)' },
  { group: 'Anywhere', keys: ['Esc'], spoken: 'Escape', action: 'Close a dialog or popover' },
  { group: 'Dice pad', keys: ['1', '9'], range: true, spoken: '1 to 9', action: 'Enter that number' },
  { group: 'Dice pad', keys: ['0', '-', '='], spoken: '0, minus, equals', action: 'Enter 10, 11, 12' },
  { group: 'Dice pad', keys: ['Backspace'], action: 'Remove the last number' },
  { group: 'Dice pad', keys: ['Enter'], action: 'Accept' },
]

/**
 * Whether a single-key shortcut should be left alone: focus is in a text field, a select or
 * something editable, or a key with a modifier was pressed (spec section 5).
 */
export function typingOrModified(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return true
  const el = e.target instanceof Element ? e.target : document.activeElement
  if (!el) return false
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type)
  return false
}

/** Whether a modal dialog is open: the page's own shortcuts wait until it's closed. */
export function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}
