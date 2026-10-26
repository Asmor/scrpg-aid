/** The die and action icons as bytes or data URIs, for exports that carry their own copies. */
import { ACTIONS } from '../creation/effects'
import { appIconSrc, DICE, type IconName } from '../components/icon-source'
import { fetchBytes } from './fetch-bytes'

export const ICON_NAMES: readonly IconName[] = [...DICE.map((d) => `die/${d}` as const), ...ACTIONS.map((a) => `action/${a}` as const)]

/** Every icon's PNG bytes, fetched from the app. */
export async function loadIconBytes(): Promise<Record<IconName, Uint8Array>> {
  const bytes = await Promise.all(ICON_NAMES.map((name) => fetchBytes(appIconSrc(name))))
  return Object.fromEntries(ICON_NAMES.map((name, i) => [name, bytes[i]!])) as Record<IconName, Uint8Array>
}

/** PNG bytes as a data URI. */
export function pngDataUri(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(binary)}`
}

/** Every icon as a data URI, for the HTML export. */
export async function loadIconDataUris(): Promise<Record<IconName, string>> {
  const bytes = await loadIconBytes()
  return Object.fromEntries(ICON_NAMES.map((name) => [name, pngDataUri(bytes[name])])) as Record<IconName, string>
}
