/**
 * A hero's Advancement page (docs/design/advancement/spec.md): back issues up to six, naming a
 * collection, changes to the hero, the collections and the history. The player has full control.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { editPath, heroPath, listPath, navigate } from '../app/route'
import { Modal } from '../components/Modal'
import { StepWarnings } from '../editor/StepWarnings'
import { buildSheet } from '../creation/sheet'
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import { useHeroEditor } from '../editor/useHeroEditor'
import { gamesHolding, useListedGames } from '../game/useGameEditor'
import { gameDisplayName } from '../game/model'
import { ConfirmDialog } from '../game/dialogs'
import { MenuButton } from '../game/TableCenter'
import { DETAIL_LABEL } from '../hero/labels'
import { heroDisplayName, isDraft, newId, type BackIssue, type Hero, type HeroDetails } from '../hero/model'
import { continueStep } from '../hero/wizard-steps'
import { PopoverGroup } from '../library/Popover'
import type { Clock } from '../play/state'
import { addBackIssue, addStartingCollection, changeCosmetic, collectionsText, cosmeticFields, editBackIssue, recordCollection, removeBackIssue, shortDate, undoable, undoLast, type CosmeticKind, type IssueGame } from './records'
import { swapTrait } from './swaps'
import { TraitSwapDialog } from './SwapDialogs'

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })

/** Puts the next hero's fields into the editor's draft. */
function replaceInto(draft: Hero, next: Hero): void {
  if (next === draft) return
  for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key]
  Object.assign(draft, next)
}

const NO_GAME = ''

/** The "From a game" select: the games holding this hero, plus None. */
function GameSelect({ id, games, value, onChange }: { id: string; games: readonly IssueGame[]; value: string; onChange: (id: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
      <option value={NO_GAME}>None</option>
    </select>
  )
}

function EditIssueDialog({ issue, games, onSave, onClose }: { issue: BackIssue; games: readonly IssueGame[]; onSave: (title: string, game: IssueGame | undefined) => void; onClose: () => void }) {
  const id = useId()
  const [title, setTitle] = useState(issue.title)
  // A game that has gone stays choosable: the issue keeps its name.
  const known = issue.gameId && issue.gameName && !games.some((g) => g.id === issue.gameId) ? [{ id: issue.gameId, name: issue.gameName }] : []
  const all = [...known, ...games]
  const [game, setGame] = useState(issue.gameId ?? NO_GAME)
  return (
    <Modal title="Edit back issue" onClose={onClose}>
      <form
        className="gt-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          onSave(title, all.find((g) => g.id === game))
          onClose()
        }}
      >
        <label className="field" htmlFor={`${id}-title`}>
          <span>Issue title</span>
          <input id={`${id}-title`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field" htmlFor={`${id}-game`}>
          <span>From a game</span>
          <GameSelect id={`${id}-game`} games={all} value={game} onChange={setGame} />
        </label>
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StartingCollectionDialog({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const id = useId()
  const [name, setName] = useState('')
  return (
    <Modal title="Starting collection" onClose={onClose}>
      <form
        className="gt-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onAdd(name)
          onClose()
        }}
      >
        <p className="hint">For a new hero whose GM allows one.</p>
        <label className="field" htmlFor={id}>
          <span>Collection name</span>
          <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={!name.trim()}>
            Add collection
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** The first section: the pips, the list, and the form until six, then Record collection. */
function BackIssues({ hero, games, apply, clock }: { hero: Hero; games: readonly IssueGame[]; apply: (fn: (h: Hero) => Hero) => void; clock: () => Clock }) {
  const id = useId()
  const [title, setTitle] = useState('')
  const [game, setGame] = useState<string | null>(null)
  const [collection, setCollection] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const count = hero.backIssues.length
  const full = count >= BACK_ISSUES_PER_COLLECTION
  const gameId = game ?? games[0]?.id ?? NO_GAME
  // Focus moves to the name field when the sixth issue brings it up.
  const nameField = useRef<HTMLInputElement>(null)
  const justFilled = useRef(false)
  useEffect(() => {
    if (full && justFilled.current) nameField.current?.focus()
    justFilled.current = false
  }, [full])
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    justFilled.current = count === BACK_ISSUES_PER_COLLECTION - 1
    apply((h) => addBackIssue(h, { title, ...(games.some((g) => g.id === gameId) ? { game: games.find((g) => g.id === gameId)! } : {}) }, clock()))
    setTitle('')
  }
  const record = (e: FormEvent) => {
    e.preventDefault()
    if (!collection.trim()) return
    apply((h) => recordCollection(h, collection, clock()))
    setCollection('')
  }
  const issue = hero.backIssues.find((b) => b.id === editing)
  return (
    <section className="card adv-card" aria-labelledby={`${id}-head`}>
      <div className="gt-row">
        <h2 id={`${id}-head`} className="gt-grow">
          Back issues
        </h2>
        <span className="adv-pips" role="img" aria-label={`${count} of ${BACK_ISSUES_PER_COLLECTION} back issues`}>
          {Array.from({ length: BACK_ISSUES_PER_COLLECTION }, (_, i) => (
            <span key={i} className={i < count ? 'adv-pip adv-pip--on' : 'adv-pip'} />
          ))}
        </span>
        <strong>
          {count} of {BACK_ISSUES_PER_COLLECTION}
        </strong>
      </div>
      <p className="gt-sub">Each finished issue is a back issue. At six, name a collection to record them.</p>
      {count > 0 && (
        <ol className="adv-issues">
          {hero.backIssues.map((b) => (
            <li key={b.id} className="gt-row">
              <span className="gt-grow">
                <strong>{b.title}</strong>
                <span className="gt-sub"> · {[b.gameName, shortDate(b.at)].filter(Boolean).join(' · ')}</span>
              </span>
              <MenuButton
                label={`More for ${b.title}`}
                sheets={false}
                items={[
                  { label: 'Edit…', onSelect: () => setEditing(b.id) },
                  { label: 'Remove', danger: true, onSelect: () => apply((h) => removeBackIssue(h, b.id)) },
                ]}
              />
            </li>
          ))}
        </ol>
      )}
      {!full && (
        <form className="adv-form" onSubmit={add}>
          <label className="field adv-form__title" htmlFor={`${id}-title`}>
            <span>Issue title</span>
            <input id={`${id}-title`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field" htmlFor={`${id}-game`}>
            <span>From a game</span>
            <GameSelect id={`${id}-game`} games={games} value={gameId} onChange={setGame} />
          </label>
          <button type="submit" className="button button--primary" disabled={!title.trim()}>
            Add back issue
          </button>
        </form>
      )}
      <div role="status" aria-live="polite">
        {full && (
          <form className="adv-ready" onSubmit={record}>
            <strong>Six back issues. Name a collection to record them.</strong>
            <div className="gt-row">
              <input ref={nameField} className="gt-grow" type="text" aria-label="Collection name" value={collection} onChange={(e) => setCollection(e.target.value)} />
              <button type="submit" className="button button--primary" disabled={!collection.trim()}>
                Record collection
              </button>
            </div>
            <span className="gt-sub">The six back issues move into the collection and the count starts again.</span>
          </form>
        )}
      </div>
      {issue && <EditIssueDialog issue={issue} games={games} onSave={(t, g) => apply((h) => editBackIssue(h, issue.id, { title: t, ...(g ? { game: g } : {}) }))} onClose={() => setEditing(null)} />}
    </section>
  )
}

function Collections({ hero, apply, clock }: { hero: Hero; apply: (fn: (h: Hero) => Hero) => void; clock: () => Clock }) {
  const id = useId()
  const [adding, setAdding] = useState(false)
  return (
    <section className="card adv-card" aria-labelledby={`${id}-head`}>
      <div className="gt-row">
        <h2 id={`${id}-head`} className="gt-grow">
          Collections
        </h2>
        <span className="gt-sub">{collectionsText(hero.collections.length)}</span>
      </div>
      {hero.collections.map((c) => (
        <details key={c.id} className="adv-collection">
          <summary>
            <strong>{c.name}</strong> <span className="gt-sub">{c.starting ? 'Starting collection' : shortDate(c.at)}</span>
          </summary>
          {c.starting ? (
            <p className="gt-sub">Allowed by the GM at creation</p>
          ) : (
            <ol>
              {c.issues.map((issue, i) => (
                <li key={i}>
                  {issue.title}
                  <span className="gt-sub"> · {[issue.gameName, shortDate(issue.at)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
      ))}
      {hero.collections.length === 0 && (
        <>
          <div>
            <button type="button" className="button button--quiet button--small" onClick={() => setAdding(true)}>
              + Starting collection…
            </button>
          </div>
          <p className="gt-sub">For a new hero whose GM allows one.</p>
        </>
      )}
      {adding && <StartingCollectionDialog onAdd={(name) => apply((h) => addStartingCollection(h, name, clock()))} onClose={() => setAdding(false)} />}
    </section>
  )
}

const COSMETIC_TITLE: Record<CosmeticKind, string> = { appearance: 'Edit appearance', codename: 'Change codename', costume: 'Edit costume' }

/** A cosmetic change: a small dialog with its field, prefilled. A hero's appearance is several fields. */
function CosmeticDialog({ hero, kind, onSave, onClose }: { hero: Hero; kind: CosmeticKind; onSave: (values: Partial<HeroDetails>) => void; onClose: () => void }) {
  const id = useId()
  const fields = cosmeticFields(kind)
  const [values, setValues] = useState<Partial<HeroDetails>>(() => Object.fromEntries(fields.map((f) => [f, hero.details[f]])))
  return (
    <Modal title={COSMETIC_TITLE[kind]} onClose={onClose}>
      <form
        className="gt-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(values)
          onClose()
        }}
      >
        {fields.map((f) => (
          <label key={f} className="field" htmlFor={`${id}-${f}`}>
            <span>{kind === 'codename' ? 'Codename' : DETAIL_LABEL[f]}</span>
            <input id={`${id}-${f}`} type="text" value={values[f] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
          </label>
        ))}
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

type ChangeDialog = { kind: 'cosmetic'; which: CosmeticKind } | { kind: 'swapTrait'; trait: 'power' | 'quality' }

/** Change the hero: its three groups, side by side. */
function ChangeHero({ hero, apply, clock }: { hero: Hero; apply: (fn: (h: Hero) => Hero) => void; clock: () => Clock }) {
  const id = useId()
  const name = heroDisplayName(hero)
  const [dialog, setDialog] = useState<ChangeDialog | null>(null)
  const open = (next: ChangeDialog) => () => setDialog(next)
  const warnings = buildSheet(hero).warnings.filter((w) => w.step === 'advancement')
  return (
    <section className="card adv-card" aria-labelledby={`${id}-head`}>
      <h2 id={`${id}-head`}>Change {name}</h2>
      <p className="gt-sub">When the story calls for it, usually between collections. Changes go into the history, and games holding {name} get a sheet update to review.</p>
      <div className="adv-groups">
        <div className="adv-group">
          <h3>Cosmetic</h3>
          <span className="gt-sub">Appearance, codename, costume</span>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'appearance' })}>
            Edit appearance…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'codename' })}>
            Change codename…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'costume' })}>
            Edit costume…
          </button>
        </div>
        <div className="adv-group">
          <h3>Change details</h3>
          <span className="gt-sub">Same die size, same color</span>
          <button type="button" className="button button--small" onClick={open({ kind: 'swapTrait', trait: 'power' })}>
            Swap a power…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'swapTrait', trait: 'quality' })}>
            Swap a quality…
          </button>
        </div>
      </div>
      {warnings.length > 0 && <StepWarnings warnings={warnings} />}
      {dialog?.kind === 'cosmetic' && <CosmeticDialog hero={hero} kind={dialog.which} onSave={(values) => apply((h) => changeCosmetic(h, dialog.which, values, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'swapTrait' && <TraitSwapDialog hero={hero} kind={dialog.trait} onSwap={(from, to) => apply((h) => swapTrait(h, from, to, clock()))} onClose={() => setDialog(null)} />}
    </section>
  )
}

function History({ hero, apply }: { hero: Hero; apply: (fn: (h: Hero) => Hero) => void }) {
  const id = useId()
  const [undoing, setUndoing] = useState(false)
  const last = undoable(hero)
  return (
    <section className="card adv-card" aria-labelledby={`${id}-head`}>
      <div className="gt-row">
        <h2 id={`${id}-head`} className="gt-grow">
          History
        </h2>
        {last && (
          <button type="button" className="button button--small" onClick={() => setUndoing(true)}>
            Undo last change
          </button>
        )}
      </div>
      {undoing && last && <ConfirmDialog title="Undo the last change?" text={last.text} confirm="Undo" onConfirm={() => apply(undoLast)} onClose={() => setUndoing(false)} />}
      {hero.advancement.length === 0 ? (
        <p className="sheet-empty">Nothing yet.</p>
      ) : (
        <ol className="adv-history">
          {[...hero.advancement].reverse().map((e) => (
            <li key={e.id}>
              <span className="adv-kind">{e.kind.toUpperCase()}</span>
              {e.text}
              <div className="gt-sub">{[shortDate(e.at), e.after ? `after ${e.after}` : ''].filter(Boolean).join(' · ')}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function AdvancementPage({ id, clock = defaultClock }: { id: string; clock?: () => Clock }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  const listed = useListedGames()
  /** Leaves once the changes made so far are saved, so the next page shows them. */
  const leave = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void flush().then(() => navigate(path))
  }
  if (state.status !== 'ready') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved hero with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This hero couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this hero: {state.message}</p>}
      </div>
    )
  }
  const hero = state.hero
  const name = heroDisplayName(hero)
  if (isDraft(hero)) {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        <p role="alert">
          {name} is still a draft; advancement starts once it's finished. <a href={editPath(hero.id, continueStep(hero.furthestStep))}>Continue making this hero</a>.
        </p>
      </div>
    )
  }
  const apply = (fn: (h: Hero) => Hero) => update((draft) => replaceInto(draft, fn(draft)))
  const games = gamesHolding(listed.games ?? [], 'hero', hero.id)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((g) => ({ id: g.id, name: gameDisplayName(g) }))
  return (
    <PopoverGroup>
      <div className="adv-page">
        <p className="crumb">
          <a href={listPath} onClick={leave(listPath)}>
            Library
          </a>{' '}
          /{' '}
          <a href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
            {name}
          </a>{' '}
          / Advancement
        </p>
        <div className="adv-head">
          <h1 className="gt-grow">{name} · Advancement</h1>
          <a className="button" href={heroPath(hero.id)} onClick={leave(heroPath(hero.id))}>
            Back to sheet
          </a>
        </div>
        {saveError && (
          <p role="alert" className="error">
            Your last change couldn't be saved: {saveError}
          </p>
        )}
        <div className="adv-cols">
          <main className="adv-main">
            <BackIssues hero={hero} games={games} apply={apply} clock={clock} />
            <ChangeHero hero={hero} apply={apply} clock={clock} />
          </main>
          <aside className="adv-side">
            <Collections hero={hero} apply={apply} clock={clock} />
            <History hero={hero} apply={apply} />
          </aside>
        </div>
      </div>
    </PopoverGroup>
  )
}
