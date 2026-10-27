/**
 * The versioned envelope every saved or shared document is wrapped in (heroes, villains):
 * `{ format, version, <key>: document }`. Reading one checks the format and version,
 * migrates an older version forward, and checks the result's shape (the data is untrusted).
 */
import { isRecord } from './shape'

/** Upgrades a saved document from version N to N + 1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>

export type EnvelopeResult<T> = { ok: true; doc: T; migratedFrom?: number } | { ok: false; error: string }

export interface EnvelopeSpec {
  format: string
  /** The envelope's key holding the document, and the word for it in errors ("hero"). */
  key: string
  currentVersion: number
  /** Keyed by the version they upgrade from. */
  migrations: Readonly<Record<number, Migration>>
  /** The document's first structural problem, or undefined. */
  problem: (doc: unknown) => string | undefined
}

export function readEnvelope<T>(value: unknown, spec: EnvelopeSpec): EnvelopeResult<T> {
  const { format, key, currentVersion, migrations } = spec
  if (!isRecord(value) || value.format !== format) return { ok: false, error: `not a saved ${key}` }
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'missing or invalid version' }
  }
  if (version > currentVersion) {
    return { ok: false, error: `saved by a newer version of the app (format ${version})` }
  }
  if (!isRecord(value[key])) return { ok: false, error: `missing ${key}` }

  // Work on a copy so neither migrations nor callers can change the stored record.
  let doc: Record<string, unknown> = structuredClone(value[key] as Record<string, unknown>)
  for (let v = version; v < currentVersion; v++) {
    const migrate = migrations[v]
    if (!migrate) return { ok: false, error: `no migration from format ${v}` }
    try {
      doc = migrate(doc)
    } catch (error) {
      return { ok: false, error: `migration from format ${v} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  const problem = spec.problem(doc)
  if (problem) return { ok: false, error: problem }
  return version < currentVersion ? { ok: true, doc: doc as T, migratedFrom: version } : { ok: true, doc: doc as T }
}

/** Parses JSON text, or says it isn't JSON. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, error: 'not valid JSON' }
  }
}
