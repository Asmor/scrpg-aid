/**
 * The versioned envelope every saved or shared document is wrapped in (heroes, villains):
 * `{ format, version, <key>: document }`. Reading one checks the format and version, and the
 * document's shape (the data is untrusted). There are no real saves yet, so only the current
 * version reads: older ones aren't carried forward.
 */
import { isRecord } from './shape'

export type EnvelopeResult<T> = { ok: true; doc: T } | { ok: false; error: string }

export interface EnvelopeSpec {
  format: string
  /** The envelope's key holding the document, and the word for it in errors ("hero"). */
  key: string
  currentVersion: number
  /** The document's first structural problem, or undefined. */
  problem: (doc: unknown) => string | undefined
}

export function readEnvelope<T>(value: unknown, spec: EnvelopeSpec): EnvelopeResult<T> {
  const { format, key, currentVersion } = spec
  if (!isRecord(value) || value.format !== format) return { ok: false, error: `not a saved ${key}` }
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'missing or invalid version' }
  }
  if (version > currentVersion) {
    return { ok: false, error: `saved by a newer version of the app (format ${version})` }
  }
  if (version < currentVersion) {
    return { ok: false, error: `saved by an older version of the app (format ${version})` }
  }
  if (!isRecord(value[key])) return { ok: false, error: `missing ${key}` }

  // Work on a copy so callers can't change the stored record.
  const doc = structuredClone(value[key])
  const problem = spec.problem(doc)
  return problem ? { ok: false, error: problem } : { ok: true, doc: doc as T }
}
