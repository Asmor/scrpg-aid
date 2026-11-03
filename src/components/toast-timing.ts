/** How toasts behave everywhere in the app (docs/design/game-table/game-table-spec-addendum-game-codes.md, "Toasts"). */

/** How long a toast stays. */
export const TOAST_MS = 8000
/** How long a toast with an action (Undo, Try again) stays. */
export const TOAST_ACTION_MS = 10_000
/** The most toasts shown at once: the oldest closes when another arrives. */
export const TOAST_MAX = 3
