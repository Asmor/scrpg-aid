/** Room codes for game sessions (Phase 4): short, easy to read aloud, no look-alike characters. */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 8

/** A random room code, e.g. "K7QM-2XWD". `random` is injectable for tests. */
export function newRoomCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // Bytes past the last whole multiple of the alphabet's size are skipped, so every character is equally likely.
  const limit = 256 - (256 % ALPHABET.length)
  const chars: string[] = []
  while (chars.length < ROOM_CODE_LENGTH) for (const b of random(ROOM_CODE_LENGTH)) if (b < limit && chars.length < ROOM_CODE_LENGTH) chars.push(ALPHABET[b % ALPHABET.length]!)
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/** A room code as typed: upper case, without spaces; undefined if it can't be one. */
export function normalizeRoomCode(input: string): string | undefined {
  const raw = input.toUpperCase().replace(/[\s-]/g, '')
  if (raw.length !== ROOM_CODE_LENGTH || [...raw].some((c) => !ALPHABET.includes(c))) return undefined
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}
