/** The words for New code… (./new-code.tsx): lists of names, and who needs the new code. Pure. */

import { nameList } from './names'

/** The line about players who are away: they'll need the new code from the GM. */
export function awayLine(away: readonly string[]): string {
  if (!away.length) return ''
  return `${nameList(away)} ${away.length === 1 ? 'is' : 'are'} disconnected, so they'll need the new code from you.`
}

/** The note in Invite once the code has changed: "New code ready. A4FA-48FQ no longer works. Alex and Sam came along. Send the new code to Priya." */
export function codeReadyLine(change: { from: string; kept: readonly string[]; needsCode: readonly string[] }): string {
  const kept = change.kept.length ? ` ${nameList(change.kept)} came along.` : ''
  const send = change.needsCode.length ? ` Send the new code to ${nameList(change.needsCode)}.` : ''
  return `New code ready. ${change.from} no longer works.${kept}${send}`
}
