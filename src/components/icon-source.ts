/**
 * Where the die and action icons (public/icons) load from. It's a context, so the HTML
 * export can swap in embedded copies and stay self-contained.
 */
import { createContext } from 'react'
import type { Action } from '../creation/effects'
import type { Die } from '../rules/types'

export { DICE } from '../rules/dice'

/** An icon's path under public/icons, e.g. "die/d8" or "action/attack". */
export type IconName = `die/${Die}` | `action/${Action}`

/** The app's own copies, served from public/. */
export const appIconSrc = (name: IconName) => `${import.meta.env.BASE_URL}icons/${name}.png`

export const IconSource = createContext<(name: IconName) => string>(appIconSrc)
