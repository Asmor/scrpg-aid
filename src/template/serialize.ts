/** The versioned save formats for templates, like ../hero/serialize.ts: one format per kind. */
import { readEnvelope } from '../saved'
import type { DocEnvelope } from '../store/doc-store'
import type { ChallengeTemplate, EnvironmentTemplate, LieutenantTemplate, MinionTemplate } from './model'
import { challengeTemplateProblem, environmentTemplateProblem, lieutenantTemplateProblem, minionTemplateProblem } from './validate'

/** Each kind's format, the envelope's key, and its shape check. */
const KINDS = {
  minion: { format: 'scrpg-minion-template', key: 'minion', problem: minionTemplateProblem },
  lieutenant: { format: 'scrpg-lieutenant-template', key: 'lieutenant', problem: lieutenantTemplateProblem },
  challenge: { format: 'scrpg-challenge-template', key: 'challenge', problem: challengeTemplateProblem },
  environment: { format: 'scrpg-environment-template', key: 'environment', problem: environmentTemplateProblem },
} as const

export type TemplateKind = keyof typeof KINDS

/** A kind's envelope format ("scrpg-minion-template"). */
export const templateFormat = (kind: TemplateKind) => KINDS[kind].format

export const TEMPLATE_VERSION = 1

function envelope<T>(kind: TemplateKind): DocEnvelope<T> {
  const { format, key, problem } = KINDS[kind]
  return {
    toSaved: (doc) => ({ format, version: TEMPLATE_VERSION, [key]: doc }),
    parse: (saved) => readEnvelope<T>(saved, { format, key, currentVersion: TEMPLATE_VERSION, problem }),
  }
}

export const minionTemplateEnvelope = envelope<MinionTemplate>('minion')
export const lieutenantTemplateEnvelope = envelope<LieutenantTemplate>('lieutenant')
export const challengeTemplateEnvelope = envelope<ChallengeTemplate>('challenge')
export const environmentTemplateEnvelope = envelope<EnvironmentTemplate>('environment')

/** A template as JSON text, in its envelope: the single-item export. */
export const templateJson = <T>(env: DocEnvelope<T>, doc: T) => JSON.stringify(env.toSaved(doc), null, 2)
