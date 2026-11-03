/** Names in sentences. Pure. */

/** "Alex, Sam and Jo". */
export function nameList(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
