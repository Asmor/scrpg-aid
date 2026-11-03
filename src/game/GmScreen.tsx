/**
 * The GM screen: the GM's side panel (docs/design/game-table/spec.md, section 7). Quick add,
 * Running (the villain or group the GM is working), and the Bring in and Notes tabs.
 */
import { useEffect, useId, useState } from 'react'
import { useStore } from '../app/store-context'
import { useOptionalSavedSearchStore } from '../app/saved-search-context'
import { useVillainStore } from '../app/villain-store-context'
import { villainPath } from '../app/route'
import { ActionIcon, DieIcon } from '../components/icons'
import { ABILITY_TYPE_LABEL } from '../hero/labels'
import { isDraft } from '../hero/model'
import { heroType, villainType, toItem, type LibraryItem } from '../library/registry'
import { filterItems, matches, type LibraryQuery } from '../library/query'
import type { SavedSearch } from '../library/saved-searches'
import { ModForm } from '../play/ModForm'
import { confirmRoll, effectAmount } from '../play/roll'
import { RollDialog, type RollSubject } from '../play/RollDialog'
import { addMod, addTwist, currentHealth, describeMod, modName, removeMod, removeTwist, setHealth, setReactionUsed, type Clock } from '../play/state'
import { villainDisplayName, type VillainPlayState } from '../villain/model'
import { villainHealth, villainStatusDie, villainZone } from '../villain/play'
import { buildVillainSheet, villainTraits } from '../villain/sheet'
import type { Game, NpcGroup, VillainInGame } from './model'
import { RunningGroup, type GroupActions } from './RunningGroup'
import { ZoneChip } from './TableCenter'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

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

/** A villain's Attack results with targets: who each hits (a target id from ./roll-targets.ts) and how hard. */
export type VillainAttacks = (attacks: { to: string; amount: number }[]) => void

/** The villain's copy in this game: its sheet and its play state here. */
function RunningVillain({ copy, change, attackTargets, attack, random }: { copy: VillainInGame; change: VillainChange; attackTargets: readonly { id: string; name: string }[]; attack: VillainAttacks; random?: () => number }) {
  const { sheet: villain, play } = copy
  const id = useId()
  const [amount, setAmount] = useState('')
  const [adding, setAdding] = useState<'mod' | 'twist' | null>(null)
  const [twist, setTwist] = useState('')
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  const sheet = buildVillainSheet(villain)
  const health = villainHealth(villain, play)
  const current = currentHealth(health, play)
  const zone = villainZone(health, play)
  const statusDie = sheet.status ? villainStatusDie(sheet.status, { ...play, zone }) : undefined
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
      {statusDie && (
        <p className="gt-row">
          <span className="gt-sub">Status die</span> <DieIcon die={statusDie} />
        </p>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={play.reactionUsed} onChange={(e) => change((p, c) => setReactionUsed(p, e.target.checked, c))} />
        Reaction used this round
      </label>
      {(play.mods.length > 0 || play.twists.length > 0) && (
        <ul className="gt-chips">
          {play.mods.map((m) => (
            <li key={m.id} className="gt-mod">
              {m.value > 0 ? `+${m.value}` : `−${-m.value}`} {modName(m)}
              <button type="button" className="gt-chip-x" aria-label={`Remove ${describeMod(m)}`} onClick={() => change((p, c) => removeMod(p, m.id, c))}>
                ×
              </button>
            </li>
          ))}
          {play.twists.map((t) => (
            <li key={t.id} className="gt-mod">
              Twist: {t.text}
              <button type="button" className="gt-chip-x" aria-label={`Clear the minor twist: ${t.text}`} onClick={() => change((p, c) => removeTwist(p, t.id, c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button type="button" className="button button--primary button--small" disabled={out} onClick={() => setRolling({ kind: 'basic' })}>
          Roll
        </button>
        <button type="button" className="button button--small" aria-expanded={adding === 'mod'} onClick={() => setAdding(adding === 'mod' ? null : 'mod')}>
          + Mod
        </button>
        <button type="button" className="button button--small" aria-expanded={adding === 'twist'} onClick={() => setAdding(adding === 'twist' ? null : 'twist')}>
          + Twist
        </button>
      </div>
      {adding === 'mod' && <ModForm onSubmit={(mod) => (change((p, c) => addMod(p, mod, c)), setAdding(null))} />}
      {adding === 'twist' && (
        <form
          className="play-add"
          onSubmit={(e) => {
            e.preventDefault()
            change((p, c) => addTwist(p, { kind: 'minor', text: twist }, c))
            setTwist('')
            setAdding(null)
          }}
        >
          <label className="field" htmlFor={`${id}-twist`}>
            <span>Minor twist</span>
            <input id={`${id}-twist`} type="text" value={twist} onChange={(e) => setTwist(e.target.value)} />
          </label>
          <button type="submit" className="button button--small" disabled={!twist.trim()}>
            Add
          </button>
        </form>
      )}
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
          onClose={() => setRolling(null)}
          attackTargets={attackTargets}
          onConfirm={(record, followUps, _form, _made, attacks = []) => {
            change((p, c) => {
              const after = confirmRoll(p, record, c)
              const withMods = followUps.reduce((q, f) => addMod(q, f.mod, c), after)
              return rolling.kind === 'ability' && rolling.reaction ? setReactionUsed(withMods, true, c) : withMods
            })
            if (attacks.length) attack(attacks.map((a) => ({ to: a.to, amount: effectAmount(record.results[a.result]?.total ?? 0) })))
          }}
          random={random}
        />
      )}
    </>
  )
}

// ---- Bring in ----

/** What Bring in needs to know about the table. */
export interface BringIn {
  /** Whether the item is on the table: absent, shown, hidden, or there with a library sheet that has changed since (its Update). */
  /** Where a library item is on the table: absent, on it, or hidden. */
  placeOf: (item: LibraryItem) => 'absent' | 'shown' | 'hidden' | 'changed'
  bringIn: (item: LibraryItem) => void
  /** Opens Update from library for an item whose copy differs. */
  update: (item: LibraryItem) => void
}

type Source = { kind: 'all' } | { kind: 'type'; key: string } | { kind: 'search'; search: SavedSearch }

function BringInTab({ bring }: { bring: BringIn }) {
  const id = useId()
  const heroes = useStore()
  const villains = useVillainStore()
  const searchStore = useOptionalSavedSearchStore()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('all')
  const [text, setText] = useState('')
  useEffect(() => {
    let current = true
    Promise.all([heroes.list(), villains.list(), searchStore ? searchStore.list() : Promise.resolve({ searches: [] as SavedSearch[] })]).then(
      ([h, v, s]) => {
        if (!current) return
        // Drafts aren't ready to play.
        setItems([...h.heroes.filter((x) => !isDraft(x)).map((x) => toItem(heroType as never, x)), ...v.villains.map((x) => toItem(villainType as never, x))])
        setSearches(s.searches)
      },
      (e: unknown) => current && setError(errorText(e)),
    )
    return () => {
      current = false
    }
  }, [heroes, villains, searchStore])
  const sources: { value: string; label: string; source: Source }[] = [
    { value: 'all', label: 'All', source: { kind: 'all' } },
    ...searches.map((s) => ({ value: `search:${s.id}`, label: `${s.name} (saved search)`, source: { kind: 'search' as const, search: s } })),
    { value: 'type:hero', label: 'All heroes', source: { kind: 'type', key: 'hero' } },
    { value: 'type:villain', label: 'All villains', source: { kind: 'type', key: 'villain' } },
  ]
  const chosen = sources.find((s) => s.value === source)?.source ?? { kind: 'all' }
  const query: LibraryQuery = chosen.kind === 'search' ? chosen.search.query : { text: '', types: chosen.kind === 'type' ? [chosen.key] : [], tags: [] }
  const fields = (items ?? []).map((i) => ({ item: i, type: i.type.key, name: i.row.name, tags: i.doc.tags }))
  // The source's filter, then the name typed here.
  const shown = filterItems(
    fields.filter((f) => matches(f, query)),
    { text, types: [], tags: [] },
  ).map((f) => f.item)
  // Only what can arrive hidden: heroes come in one at a time, as themselves.
  const rest = shown.filter((i) => i.type.key !== 'hero' && bring.placeOf(i) === 'absent')
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
                  </span>
                </span>
                {place === 'absent' ? (
                  <button type="button" className="button button--small" aria-label={`Bring in ${i.row.name}`} onClick={() => bring.bringIn(i)}>
                    Bring in
                  </button>
                ) : place === 'changed' ? (
                  <span className="gt-row">
                    <span className="tag">Library changed</span>
                    <button type="button" className="button button--small" aria-label={`Update ${i.row.name} from your library`} onClick={() => bring.update(i)}>
                      Update
                    </button>
                  </span>
                ) : (
                  <span className="gt-sub">{place === 'hidden' ? 'Hidden' : 'On the table'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {rest.length > 0 && (
        <button type="button" className="button" onClick={() => rest.forEach((i) => bring.bringIn(i))}>
          Bring in the rest ({rest.length}), hidden
        </button>
      )}
      <p className="hint">Everything is copied into this game, so damage never touches your library or other games. Templates (minions, lieutenants, challenges and environments) start fresh each time they're brought in. Villains arrive hidden from players.</p>
    </div>
  )
}

// ---- The panel ----

export type QuickAddKind = 'minions' | 'lieutenants' | 'challenge'

interface GmScreenProps {
  game: Game
  quickAdd: (kind: QuickAddKind) => void
  running?: { kind: 'villain'; villain: VillainInGame; change: VillainChange; attackTargets: readonly { id: string; name: string }[]; attack: VillainAttacks } | { kind: 'group'; group: NpcGroup; actions: GroupActions } | { kind: 'missing' }
  stopRunning: () => void
  bring: BringIn
  setNotes: (notes: string) => void
  /** Players' sheet update requests, shown at the top while there are any (section 8). */
  requests?: { heroId: string; name: string; summary: string }[]
  onReview?: (heroId: string) => void
  random?: () => number
}

export function GmScreen({ game, quickAdd, running, stopRunning, bring, setNotes, requests = [], onReview, random }: GmScreenProps) {
  const id = useId()
  const [tab, setTab] = useState<'bring' | 'notes'>('bring')
  const runningName = running?.kind === 'villain' ? villainDisplayName(running.villain.sheet) : running?.kind === 'group' ? running.group.name : ''
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
          {running.kind === 'villain' ? <RunningVillain key={running.villain.id} copy={running.villain} change={running.change} attackTargets={running.attackTargets} attack={running.attack} random={random} /> : <RunningGroup key={running.group.id} game={game} group={running.group} actions={running.actions} random={random} />}
        </section>
      )}

      <section className="card" aria-label="Library and notes">
        <div className="gt-tabs" role="tablist" aria-label="GM screen">
          <button type="button" role="tab" id={`${id}-tab-bring`} aria-controls={`${id}-panel`} aria-selected={tab === 'bring'} className={tab === 'bring' ? 'gt-tabs__on' : undefined} onClick={() => setTab('bring')}>
            Bring in
          </button>
          <button type="button" role="tab" id={`${id}-tab-notes`} aria-controls={`${id}-panel`} aria-selected={tab === 'notes'} className={tab === 'notes' ? 'gt-tabs__on' : undefined} onClick={() => setTab('notes')}>
            Notes
          </button>
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
          {tab === 'bring' ? (
            <BringInTab bring={bring} />
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
