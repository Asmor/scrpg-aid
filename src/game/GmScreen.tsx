/**
 * The GM screen: the GM's side panel (scrpg-aid-designs/game-table/spec.md, section 7). Quick add,
 * Running (the villain or group the GM is working), and the Bring in, Scenes and Notes tabs.
 */
import { useId, useState } from 'react'
import { villainPath } from '../app/route'
import { useSettings } from '../settings/context'
import { ActionIcon } from '../components/icons'
import { ABILITY_TYPE_LABEL } from '../hero/labels'
import type { PlayMod } from '../hero/model'
import type { LibraryItem } from '../library/registry'
import { TEMPLATE_TYPES } from '../library/template-types'
import { MAX_GROUP_SIZE, type MinionTemplate } from '../template/model'
import { filterItems, matches, type LibraryQuery } from '../library/query'
import { useLibraryItems } from './useLibraryItems'
import type { SavedSearch } from '../library/saved-searches'
import { ModForm } from '../play/ModForm'
import { confirmRoll, effectAmount } from '../play/roll'
import { addDefense, defenseText, removeDefense } from '../play/defense'
import { RollDialog, type RollSubject } from '../play/RollDialog'
import { addMod, addTwist, currentHealth, describeMod, modName, removeMod, removeTwist, setHealth, setReactionUsed, type Clock } from '../play/state'
import { villainDisplayName, type VillainPlayState } from '../villain/model'
import { villainHealth, villainZone } from '../villain/play'
import { buildVillainSheet, villainTraits } from '../villain/sheet'
import { sceneOnTable, type EnvironmentOnTable, type Game, type NpcGroup, type VillainInGame } from './model'
import { RunningEnvironment, type EnvironmentActions } from './RunningEnvironment'
import { RunningGroup, type GroupActions } from './RunningGroup'
import { targetId } from './roll-targets'
import { gmTable, targetOptions } from './target-options'
import { ScenesTab, type SceneActions } from './ScenesTab'
import { dangerText } from './table'
import { ZoneChip } from './TableCenter'
import { DangerResultDialog, VillainTwistDialog } from './VillainDialogs'
import { villainStatus } from './villain-status'
import { VillainStatusPanel, type VillainStatusActions } from './VillainStatusPanel'

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// ---- Running a villain ----

type VillainChange = (fn: (play: VillainPlayState, clock: Clock) => VillainPlayState) => void

/** What a villain's roll does to others at the table: each target's id (./roll-targets.ts), and the damage, defense or mod. */
export type VillainAttacks = (results: ({ kind: 'attack' | 'defend'; to: string; amount: number } | { kind: 'mod'; to: string; mod: Omit<PlayMod, 'id'> })[]) => void

/** The tabs under Running. */
export type GmTab = 'bring' | 'scenes' | 'notes'

/** The villain's copy in this game: its sheet and its play state here. */
function RunningVillain({ game, copy, change, attack, danger, undoDanger, captured, escapes, status: statusActions, random }: { game: Game; copy: VillainInGame; change: VillainChange; attack: VillainAttacks; danger: (success: boolean) => void; undoDanger: () => void; captured: () => void; escapes: () => void; status: VillainStatusActions; random?: () => number }) {
  const { sheet: villain, play } = copy
  const id = useId()
  const [amount, setAmount] = useState('')
  const [adding, setAdding] = useState<'mod' | 'twist' | null>(null)
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  // The tracker Overcome: rolling it, then asking how it went, with the total.
  const [dangerRoll, setDangerRoll] = useState(false)
  const [dangerTotal, setDangerTotal] = useState<{ total: number | undefined } | null>(null)
  const name = villainDisplayName(villain)
  const sheet = buildVillainSheet(villain)
  const health = villainHealth(villain, play)
  const current = currentHealth(health, play)
  const zone = villainZone(health, play)
  const statusDie = villainStatus(copy, game)?.die
  const out = zone === 'out'
  const traits = villainTraits(villain).traits
  const dice = {
    powers: traits.filter((t) => t.trait.kind === 'power'),
    qualities: traits.filter((t) => t.trait.kind === 'quality'),
    ...(statusDie ? { statusDice: { green: statusDie, yellow: statusDie, red: statusDie } } : {}),
    slots: ['power', 'quality'] as const,
    cannot: [],
    known: traits,
  }
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0
  const by = (n: number) => change((p, c) => setHealth(p, villainHealth(villain, p), (currentHealth(villainHealth(villain, p), p) ?? 0) + n, c))
  return (
    <>
      <VillainStatusPanel game={game} copy={copy} actions={statusActions} />
      {current === undefined ? (
        <p className="sheet-empty">This villain has no Health yet: choose its approach and archetype.</p>
      ) : (
        <>
          <div className="gt-health-ctl">
            <button type="button" className="button" aria-label="Lose 1 Health" onClick={() => by(-1)}>
              −
            </button>
            <div>
              <div className="gt-big">{current}</div>
              <div className="gt-sub gt-center-text">
                of {health.maxHealth} Health {zone && <ZoneChip zone={zone} label={out ? 'Defeated' : undefined} />}
              </div>
            </div>
            <button type="button" className="button" aria-label="Gain 1 Health" onClick={() => by(1)}>
              +
            </button>
          </div>
          <div className="button-row">
            <label className="visually-hidden" htmlFor={`${id}-amount`}>
              Amount
            </label>
            <input id={`${id}-amount`} className="play-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
            <button type="button" className="button button--small" disabled={!validAmount} onClick={() => (by(-delta), setAmount(''))}>
              Lose
            </button>
            <button type="button" className="button button--small" disabled={!validAmount} onClick={() => (by(delta), setAmount(''))}>
              Gain
            </button>
          </div>
        </>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={play.reactionUsed} onChange={(e) => change((p, c) => setReactionUsed(p, e.target.checked, c))} />
        Reaction used this round
      </label>
      {(play.mods.length > 0 || (play.defenses?.length ?? 0) > 0) && (
        <ul className="gt-chips">
          {(play.defenses ?? []).map((d) => (
            <li key={d.id} className="gt-mod gt-defense">
              {defenseText(d, villainDisplayName(villain))}
              <button type="button" className="gt-chip-x" aria-label={`Remove ${defenseText(d)}`} onClick={() => change((p) => removeDefense(p, d.id))}>
                ×
              </button>
            </li>
          ))}
          {play.mods.map((m) => (
            <li key={m.id} className="gt-mod">
              {m.value > 0 ? `+${m.value}` : `−${-m.value}`} {modName(m)}
              <button type="button" className="gt-chip-x" aria-label={`Remove ${describeMod(m)}`} onClick={() => change((p, c) => removeMod(p, m.id, c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button type="button" className="button button--primary button--small" data-shortcut="roll" disabled={out} onClick={() => setRolling({ kind: 'basic' })}>
          Roll
        </button>
        <button type="button" className="button button--small" aria-expanded={adding === 'mod'} onClick={() => setAdding(adding === 'mod' ? null : 'mod')}>
          + Mod
        </button>
        <button type="button" className="button button--small" onClick={() => setAdding('twist')}>
          + Twist
        </button>
      </div>
      {adding === 'mod' && <ModForm onSubmit={(mod) => (change((p, c) => addMod(p, mod, c)), setAdding(null))} />}
      {adding === 'twist' && (
        <VillainTwistDialog
          name={name}
          onMinor={(text) => change((p, c) => addTwist(p, { kind: 'minor', text }, c))}
          onCaptured={() => {
            setAdding(null)
            captured()
          }}
          onEscapes={() => {
            setAdding(null)
            escapes()
          }}
          onClose={() => setAdding(null)}
        />
      )}
      <div className="gt-danger">
        <span className="gt-grow">
          <strong>Make the scene more dangerous</strong>
          <br />
          <span className="gt-sub">{copy.dangerUsed ? dangerText(copy.dangerUsed, sceneOnTable(game).tracker) : 'Once per scene. Roll an Overcome; on a success the scene tracker advances one box.'}</span>
        </span>
        {copy.dangerUsed ? (
          <button type="button" className="button button--quiet button--small" aria-label="Undo making the scene more dangerous" onClick={undoDanger}>
            Undo
          </button>
        ) : (
          <button
            type="button"
            className="button button--small"
            disabled={out}
            onClick={() => {
              setDangerRoll(true)
              setRolling({ kind: 'basic', action: 'overcome' })
            }}
          >
            Overcome: advance tracker
          </button>
        )}
      </div>
      <section aria-labelledby={`${id}-twists`}>
        <h3 id={`${id}-twists`} className="gt-status-panel__head">
          Twists
        </h3>
        {play.twists.length === 0 ? (
          <p className="gt-sub">None.</p>
        ) : (
          <ul className="gt-twists">
            {play.twists.map((t) => (
              <li key={t.id} className="gt-row">
                <span className="tag">MINOR</span>
                <span className="gt-grow">{t.text}</span>
                <button type="button" className="button button--quiet button--small" aria-label={`Resolve the minor twist: ${t.text}`} onClick={() => change((p, c) => removeTwist(p, t.id, c))}>
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ul className="gt-abilities" aria-label="Abilities">
        {[...sheet.abilities, ...(sheet.mastery ? [sheet.mastery] : [])].map((a, i) => {
          const usable = a.type !== 'I' || (a.use.pool !== undefined && a.use.effects.length > 0)
          const blocked = out ? 'Defeated' : a.type === 'R' && play.reactionUsed ? 'Reaction used this round' : undefined
          return (
            <li key={`${a.source}:${a.baseName}:${i}`} className={blocked ? 'gt-ability gt-ability--off' : 'gt-ability'}>
              <span className="gt-grow">
                {a.effects.map((e) => (
                  <ActionIcon key={e} action={e} />
                ))}{' '}
                <strong>{a.name}</strong> <span className="gt-sub">{ABILITY_TYPE_LABEL[a.type]}</span>
                {usable && blocked && <span className="gt-sub"> · {blocked}</span>}
              </span>
              {usable && (
                <button type="button" className="button button--small" disabled={Boolean(blocked)} aria-label={`Use ${a.name}`} onClick={() => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' })}>
                  Use
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <a href={villainPath(copy.sourceId)}>Open this villain's sheet</a>
      {rolling && (
        <RollDialog
          subject={rolling}
          dice={dice}
          zone={out ? undefined : (zone ?? 'green')}
          mods={play.mods}
          statusLabel="Status"
          onClose={() => {
            setRolling(null)
            setDangerRoll(false)
          }}
          targetsFor={(effect, opts) => targetOptions({ kind: 'villain', id: copy.id }, effect, gmTable(game), opts)}
          selfId={targetId({ kind: 'villain', id: copy.id })}
          onConfirm={(record, followUps, _form, _made, choices = []) => {
            if (dangerRoll) setDangerTotal({ total: record.results.find((r) => r.action === 'overcome')?.total })
            change((p, c) => {
              const after = confirmRoll(p, record, c)
              const withMods = followUps.filter((f) => !f.to).reduce((q, f) => addMod(q, f.mod, c), after)
              return rolling.kind === 'ability' && rolling.reaction ? setReactionUsed(withMods, true, c) : withMods
            })
            const amount = (i: number) => effectAmount(record.results[i]?.total ?? 0)
            // A Defend for itself (ruling 65); the rest go to others.
            const self = choices.filter((x) => record.results[x.result]?.action === 'defend' && !x.to)
            if (self.length) change((p, c) => self.reduce((q, x) => addDefense(q, amount(x.result), villainDisplayName(villain), c), p))
            const others = [
              ...choices.filter((x) => x.to).map((x) => ({ kind: record.results[x.result]?.action === 'defend' ? ('defend' as const) : ('attack' as const), to: x.to, amount: amount(x.result) })),
              ...followUps.flatMap((f) => (f.to ? [{ kind: 'mod' as const, to: f.to, mod: f.mod }] : [])),
            ]
            if (others.length) attack(others)
          }}
          random={random}
        />
      )}
      {dangerTotal && (
        <DangerResultDialog
          name={name}
          total={dangerTotal.total}
          onResult={(success) => {
            setDangerTotal(null)
            danger(success)
          }}
          onClose={() => setDangerTotal(null)}
        />
      )}
    </>
  )
}

// ---- Bring in ----

/** What Bring in needs to know about the table. */
export interface BringIn {
  /**
   * Where a library item is on the table: absent, shown, hidden, there with a library sheet that
   * has changed since (its Update), a template already used here, which can come in again, a villain
   * whose copy is waiting off the table, or already in the scene being planned.
   */
  placeOf: (item: LibraryItem) => 'absent' | 'shown' | 'hidden' | 'changed' | 'again' | 'waiting' | 'added'
  /**
   * Brings in a copy; a minion or lieutenant template with `count` members (its usual group size by
   * default). A villain first asks how many heroes and what it comes with, unless `quick`.
   */
  bringIn: (item: LibraryItem, count?: number, quick?: boolean) => void
  /** Opens Update from library for an item whose copy differs. */
  update: (item: LibraryItem) => void
  /** A tag on the row: "Planned for scene 3". */
  note?: (item: LibraryItem) => string | undefined
  /** Which library types to list (planning a scene has no heroes); all of them without it. */
  only?: (typeKey: string) => boolean
  /** The button's word, "Bring in" without it. */
  verb?: string
}

type Source = { kind: 'all' } | { kind: 'type'; key: string } | { kind: 'search'; search: SavedSearch }

/** The Bring in list: from the GM screen for the table, or in a modal for a planned scene. */
export function BringInTab({ bring }: { bring: BringIn }) {
  const { startHidden } = useSettings().settings.newGame
  const id = useId()
  const { items: allItems, searches, error } = useLibraryItems()
  const items = allItems && (bring.only ? allItems.filter((i) => bring.only!(i.type.key)) : allItems)
  // How many members each minion or lieutenant template brings in, by item key.
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [source, setSource] = useState('all')
  const [text, setText] = useState('')
  const allSources: { value: string; label: string; source: Source }[] = [
    { value: 'all', label: 'All', source: { kind: 'all' } },
    ...searches.map((s) => ({ value: `search:${s.id}`, label: `${s.name} (saved search)`, source: { kind: 'search' as const, search: s } })),
    { value: 'type:hero', label: 'All heroes', source: { kind: 'type', key: 'hero' } },
    { value: 'type:villain', label: 'All villains', source: { kind: 'type', key: 'villain' } },
    ...TEMPLATE_TYPES.map((t) => ({ value: `type:${t.key}`, label: `All ${t.plural.toLowerCase()}`, source: { kind: 'type' as const, key: t.key } })),
  ]
  const sources = allSources.filter((s) => !bring.only || s.source.kind !== 'type' || bring.only(s.source.key))
  const chosen = sources.find((s) => s.value === source)?.source ?? { kind: 'all' }
  const query: LibraryQuery = chosen.kind === 'search' ? chosen.search.query : { text: '', types: chosen.kind === 'type' ? [chosen.key] : [], tags: [] }
  /** The count typed for a group template (undefined for anything else); null when it isn't 1–20. */
  const countOf = (i: LibraryItem): number | undefined | null => {
    if (i.type.key !== 'minion' && i.type.key !== 'lieutenant') return undefined
    const typed = counts[`${i.type.key}:${i.doc.id}`]
    if (typed === undefined) return undefined
    const n = Number(typed)
    return Number.isInteger(n) && n >= 1 && n <= MAX_GROUP_SIZE ? n : null
  }
  const fields = (items ?? []).map((i) => ({ item: i, type: i.type.key, name: i.row.name, tags: i.doc.tags }))
  // The source's filter, then the name typed here.
  const shown = filterItems(
    fields.filter((f) => matches(f, query)),
    { text, types: [], tags: [] },
  ).map((f) => f.item)
  // Only villains: heroes come in one at a time, as themselves, and templates as many times as wanted.
  const rest = shown.filter((i) => i.type.key === 'villain' && bring.placeOf(i) === 'absent')
  const verb = bring.verb ?? 'Bring in'
  return (
    <div className="gt-tab">
      <label className="field" htmlFor={`${id}-source`}>
        <span>From your library</span>
        <select id={`${id}-source`} value={source} onChange={(e) => setSource(e.target.value)}>
          {sources.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <input type="search" className="gt-search" aria-label="Search the library by name" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} />
      {error && (
        <p role="alert" className="error">
          Couldn't read your library: {error}
        </p>
      )}
      {items === null && !error ? (
        <p>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="sheet-empty">Nothing matches.</p>
      ) : (
        <ul className="gt-lib" aria-label="Library">
          {shown.map((i) => {
            const place = bring.placeOf(i)
            const note = bring.note?.(i)
            return (
              <li key={`${i.type.key}:${i.doc.id}`} className="gt-row">
                <span className="gt-grow">
                  <strong>{i.row.name}</strong>
                  <span className="gt-sub gt-lib__meta">
                    {i.type.label}
                    {i.doc.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                    {note && <span className="tag tag--strong">{note}</span>}
                  </span>
                </span>
                {(i.type.key === 'minion' || i.type.key === 'lieutenant') && (
                  <input
                    type="number"
                    className="gt-group-count"
                    inputMode="numeric"
                    min={1}
                    max={MAX_GROUP_SIZE}
                    aria-label={`How many ${i.row.name}`}
                    value={counts[`${i.type.key}:${i.doc.id}`] ?? String((i.doc as unknown as MinionTemplate).groupSize)}
                    onChange={(e) => setCounts((c) => ({ ...c, [`${i.type.key}:${i.doc.id}`]: e.target.value }))}
                  />
                )}
                {place === 'absent' || place === 'again' ? (
                  <button
                    type="button"
                    className="button button--small"
                    aria-label={`${place === 'again' ? 'Add another' : verb} ${i.row.name}`}
                    disabled={countOf(i) === null}
                    onClick={() => bring.bringIn(i, countOf(i) ?? undefined)}
                  >
                    {place === 'again' ? 'Add another' : verb}
                  </button>
                ) : place === 'waiting' ? (
                  <button type="button" className="button button--small" aria-label={`Bring in ${i.row.name} now`} onClick={() => bring.bringIn(i)}>
                    Bring in now
                  </button>
                ) : place === 'changed' ? (
                  <span className="gt-row">
                    <span className="tag">Library changed</span>
                    <button type="button" className="button button--small" aria-label={`Update ${i.row.name} from your library`} onClick={() => bring.update(i)}>
                      Update
                    </button>
                  </span>
                ) : (
                  <span className="gt-sub">{place === 'added' ? 'In this scene' : place === 'hidden' ? 'Hidden' : 'On the table'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {rest.length > 0 && (
        <button type="button" className="button" onClick={() => rest.forEach((i) => bring.bringIn(i, undefined, true))}>
          {verb} the rest ({rest.length}){startHidden ? ', hidden' : ''}
        </button>
      )}
      {!bring.only && <p className="hint">Everything is copied into this game, so damage never touches your library or other games. Templates (minions, lieutenants, challenges and environments) start fresh each time they're brought in. {startHidden ? 'Villains arrive hidden from players.' : 'Villains arrive where players can see them.'}</p>}
    </div>
  )
}

// ---- The panel ----

export type QuickAddKind = 'minions' | 'lieutenants' | 'challenge'

interface GmScreenProps {
  game: Game
  quickAdd: (kind: QuickAddKind) => void
  running?: { kind: 'villain'; villain: VillainInGame; change: VillainChange; attack: VillainAttacks; danger: (success: boolean) => void; undoDanger: () => void; captured: () => void; escapes: () => void; status: VillainStatusActions } | { kind: 'group'; group: NpcGroup; actions: GroupActions } | { kind: 'environment'; env: EnvironmentOnTable; actions: EnvironmentActions } | { kind: 'missing' }
  stopRunning: () => void
  bring: BringIn
  setNotes: (notes: string) => void
  /** Which tab is showing: the page opens Scenes from the scene card's menu. */
  tab: GmTab
  setTab: (tab: GmTab) => void
  scenes: SceneActions
  /** Players' sheet update requests, shown at the top while there are any (section 8). */
  requests?: { heroId: string; name: string; summary: string }[]
  onReview?: (heroId: string) => void
  random?: () => number
  /** Bottom sheets for menus (phones). */
  sheets?: boolean
}

export function GmScreen({ game, quickAdd, running, stopRunning, bring, setNotes, tab, setTab, scenes, requests = [], onReview, random, sheets = false }: GmScreenProps) {
  const id = useId()
  const runningName = running?.kind === 'villain' ? villainDisplayName(running.villain.sheet) : running?.kind === 'group' ? running.group.name : running?.kind === 'environment' ? running.env.name : ''
  return (
    <aside className="gt-side" aria-label="GM screen">
      <section className="card gt-card">
        <div className="gt-row">
          <h2 className="gt-grow">GM screen</h2>
          <span className="gt-flag">
            <LockIcon /> Only you see this
          </span>
        </div>
        {requests.length > 0 && (
          <section className="gt-requests" aria-labelledby={`${id}-requests`}>
            <h3 id={`${id}-requests`} className="gt-label">
              Requests <span className="gt-count">{requests.length}</span>
            </h3>
            <ul className="gt-lib">
              {requests.map((r) => (
                <li key={r.heroId} className="gt-row">
                  <span className="gt-grow">
                    <strong>{r.name}</strong>
                    <span className="gt-sub"> {r.summary}</span>
                  </span>
                  <button type="button" className="button button--small button--primary" aria-label={`Review ${r.name}'s sheet update`} onClick={() => onReview?.(r.heroId)}>
                    Review
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="gt-label">Quick add</div>
        <div className="gt-quick">
          <button type="button" className="button button--small" onClick={() => quickAdd('minions')}>
            + Minion
          </button>
          <button type="button" className="button button--small" onClick={() => quickAdd('lieutenants')}>
            + Lieutenant
          </button>
          <button type="button" className="button button--small" onClick={() => quickAdd('challenge')}>
            + Challenge
          </button>
        </div>
      </section>

      {running && running.kind !== 'missing' && (
        <section className="card gt-card gt-running" aria-labelledby={`${id}-running`}>
          <div className="gt-row">
            <div className="gt-grow">
              <div className="gt-label">Running</div>
              <h2 id={`${id}-running`}>{runningName}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Stop running this" title="Stop running this" onClick={stopRunning}>
              ×
            </button>
          </div>
          {running.kind === 'villain' ? (
            <RunningVillain key={running.villain.id} game={game} copy={running.villain} change={running.change} attack={running.attack} danger={running.danger} undoDanger={running.undoDanger} captured={running.captured} escapes={running.escapes} status={running.status} random={random} />
          ) : running.kind === 'environment' ? (
            <RunningEnvironment key={running.env.id} game={game} env={running.env} actions={running.actions} sheets={sheets} random={random} />
          ) : (
            <RunningGroup key={running.group.id} game={game} group={running.group} actions={running.actions} random={random} />
          )}
        </section>
      )}

      <section className="card" aria-label="Library, scenes and notes">
        <div className="gt-tabs" role="tablist" aria-label="GM screen">
          <button type="button" role="tab" id={`${id}-tab-bring`} aria-controls={`${id}-panel`} aria-selected={tab === 'bring'} className={tab === 'bring' ? 'gt-tabs__on' : undefined} onClick={() => setTab('bring')}>
            Bring in
          </button>
          <button type="button" role="tab" id={`${id}-tab-scenes`} aria-controls={`${id}-panel`} aria-selected={tab === 'scenes'} className={tab === 'scenes' ? 'gt-tabs__on' : undefined} onClick={() => setTab('scenes')}>
            Scenes
          </button>
          <button type="button" role="tab" id={`${id}-tab-notes`} aria-controls={`${id}-panel`} aria-selected={tab === 'notes'} className={tab === 'notes' ? 'gt-tabs__on' : undefined} onClick={() => setTab('notes')}>
            Notes
          </button>
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
          {tab === 'bring' ? (
            <BringInTab bring={bring} />
          ) : tab === 'scenes' ? (
            <ScenesTab game={game} actions={scenes} sheets={sheets} />
          ) : (
            <div className="gt-tab">
              <label className="field" htmlFor={`${id}-notes`}>
                <span>Private notes</span>
                <textarea id={`${id}-notes`} rows={8} value={game.notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      </section>
    </aside>
  )
}
