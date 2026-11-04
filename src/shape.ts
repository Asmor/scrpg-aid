/**
 * Small structural checks for untrusted data (saved heroes, imported files, messages from
 * other players): each returns a description of the first problem, or undefined.
 */
export type Check = (value: unknown, path: string) => string | undefined

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const string: Check = (v, path) => (typeof v === 'string' ? undefined : `${path} should be text`)
export const nonEmptyString: Check = (v, path) => (typeof v === 'string' && v !== '' ? undefined : `${path} is missing`)
export const boolean: Check = (v, path) => (typeof v === 'boolean' ? undefined : `${path} should be true or false`)
export const integer: Check = (v, path) => (Number.isInteger(v) ? undefined : `${path} should be a whole number`)
export const positiveInteger: Check = (v, path) => integer(v, path) ?? ((v as number) < 1 ? `${path} should be at least 1` : undefined)
export const oneOf =
  (...values: readonly unknown[]): Check =>
  (v, path) =>
    values.includes(v) ? undefined : `${path} has an unknown value`

export const arrayOf =
  (item: Check): Check =>
  (v, path) => {
    if (!Array.isArray(v)) return `${path} should be a list`
    for (const [i, x] of v.entries()) {
      const problem = item(x, `${path}[${i}]`)
      if (problem) return problem
    }
    return undefined
  }

export const recordOf =
  (item: Check): Check =>
  (v, path) => {
    if (!isRecord(v)) return `${path} should be an object`
    for (const [k, x] of Object.entries(v)) {
      const problem = item(x, `${path}.${k}`)
      if (problem) return problem
    }
    return undefined
  }

/** An object with these fields; keys ending in "?" are optional. Unknown fields are allowed. */
export const object =
  (fields: Record<string, Check>): Check =>
  (v, path) => {
    if (!isRecord(v)) return `${path} should be an object`
    for (const [rawKey, check] of Object.entries(fields)) {
      const optional = rawKey.endsWith('?')
      const key = optional ? rawKey.slice(0, -1) : rawKey
      if (optional && v[key] === undefined) continue
      const problem = check(v[key], `${path}.${key}`)
      if (problem) return problem
    }
    return undefined
  }

export const nullable =
  (check: Check): Check =>
  (v, path) =>
    v === null ? undefined : check(v, path)

export const either =
  (...checks: Check[]): Check =>
  (v, path) =>
    checks.some((c) => c(v, path) === undefined) ? undefined : `${path} is malformed`
