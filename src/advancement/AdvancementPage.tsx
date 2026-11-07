/**
 * A hero's Advancement page (scrpg-aid-designs/advancement/spec.md): back issues up to six, naming a
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
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { BackIssuePrompt } from '../game/BackIssuePrompt'
import { setIssuePrompt, type JoinedGame } from '../game/joined-store'
import { ColorPicker } from '../colors/ColorPicker'
import { appearanceOf, type Appearance } from '../colors/palette'
import { addBackIssue, addOfferedIssue, addStartingCollection, backIssueOffer, changeColors, changeCosmetic, collectionsText, cosmeticFields, editBackIssue, heroIssues, holdsIssue, recordCollection, removeBackIssue, shortDate, undoable, undoLast, type CosmeticKind, type HeroIssue, type IssueGame, type IssueSource } from './records'
import { openRewrite, startRewrite } from './rewrite'
import { swapAbility, swapPrinciple, swapTrait } from './swaps'
import { AbilitySwapDialog, PrincipleSwapDialog, TraitSwapDialog } from './SwapDialogs'

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

const ANOTHER_GAME = 'another'
const issueOption = (i: HeroIssue) => `issue:${i.game.id}:${i.id}`

/** The "From an issue" select: the finished issues this hero played, another game holding it, or None. */
function IssueSelect({ id, issues, value, onChange }: { id: string; issues: readonly HeroIssue[]; value: string; onChange: (value: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {issues.map((i) => (
        <option key={issueOption(i)} value={issueOption(i)}>
          {i.game.name} · Issue {i.number}: {i.title}
        </option>
      ))}
      <option value={ANOTHER_GAME}>Another game…</option>
      <option value={NO_GAME}>None</option>
    </select>
  )
}

/** "Not recorded yet": finished issues offered to the hero, with Add and Dismiss. */
function NotRecorded({ issues, onAdd, onDismiss }: { issues: readonly HeroIssue[]; onAdd: (issue: HeroIssue) => void; onDismiss: (issue: HeroIssue) => void }) {
  if (!issues.length) return null
  return (
    <div className="adv-unrecorded">
      <span className="gt-label">Not recorded yet</span>
      <ul className="adv-issues">
        {issues.map((i) => (
          <li key={issueOption(i)} className="gt-row">
            <span className="gt-grow">
              <strong>{i.title}</strong>
              <span className="gt-sub">
                {' '}
                · {i.game.name} · Issue {i.number}
              </span>
            </span>
            <button type="button" className="button button--small button--primary" aria-label={`Add ${i.title}`} onClick={() => onAdd(i)}>
              Add
            </button>
            <button type="button" className="button button--small button--quiet" aria-label={`Dismiss ${i.title}`} onClick={() => onDismiss(i)}>
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
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
function BackIssues({ hero, games, issues, onDismiss, apply, clock }: { hero: Hero; games: readonly IssueGame[]; issues: readonly HeroIssue[]; onDismiss: (issue: HeroIssue) => void; apply: (fn: (h: Hero) => Hero) => void; clock: () => Clock }) {
  const id = useId()
  const [title, setTitle] = useState('')
  const [game, setGame] = useState<string | null>(null)
  const [from, setFrom] = useState(ANOTHER_GAME)
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState<HeroIssue | null>(null)
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
    const picked = issues.find((i) => issueOption(i) === from)
    if (picked && holdsIssue(hero, picked.id)) {
      setNotice('Already recorded.')
      return
    }
    setNotice('')
    justFilled.current = count === BACK_ISSUES_PER_COLLECTION - 1
    const source = picked ? { game: picked.game, issue: { id: picked.id, number: picked.number } } : from === ANOTHER_GAME && games.some((g) => g.id === gameId) ? { game: games.find((g) => g.id === gameId)! } : {}
    apply((h) => addBackIssue(h, { title, ...source }, clock()))
    setTitle('')
    setFrom(ANOTHER_GAME)
  }
  const pick = (value: string) => {
    setFrom(value)
    const picked = issues.find((i) => issueOption(i) === value)
    if (picked) setTitle(picked.title)
  }
  /** Add follows the prompt's rules: at five or six it asks about a collection first. */
  const addOffered = (i: HeroIssue, collection?: string) => {
    setAdding(null)
    setNotice(addOfferedIssue(hero, i, collection, clock()).text)
    apply((h) => addOfferedIssue(h, i, collection, clock()).hero)
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
      <NotRecorded issues={issues.filter((i) => !i.dismissed && !holdsIssue(hero, i.id))} onAdd={(i) => (backIssueOffer(hero, i.id).situation === 'adds' ? addOffered(i) : setAdding(i))} onDismiss={onDismiss} />
      <p className="gt-sub" role="status">
        {notice}
      </p>
      {count > 0 && (
        <ol className="adv-issues">
          {hero.backIssues.map((b) => (
            <li key={b.id} className="gt-row">
              <span className="gt-grow">
                <strong>{b.title}</strong>
                <span className="gt-sub"> · {[b.gameName, b.issueNumber ? `Issue ${b.issueNumber}` : '', shortDate(b.at)].filter(Boolean).join(' · ')}</span>
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
          <label className="field" htmlFor={`${id}-from`}>
            <span>From an issue</span>
            <IssueSelect id={`${id}-from`} issues={issues} value={from} onChange={pick} />
          </label>
          {from === ANOTHER_GAME && (
            <label className="field" htmlFor={`${id}-game`}>
              <span>Game</span>
              <GameSelect id={`${id}-game`} games={games} value={gameId} onChange={setGame} />
            </label>
          )}
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
      {adding && (
        <BackIssuePrompt
          number={adding.number}
          title={adding.title}
          hero={hero}
          issueId={adding.id}
          who={adding.gm ?? 'You'}
          gameName={adding.game.name}
          laterLabel="Cancel"
          onAdd={(collection) => addOffered(adding, collection)}
          onLater={() => setAdding(null)}
        />
      )}
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
                  <span className="gt-sub"> · {[issue.gameName, issue.issueNumber ? `Issue ${issue.issueNumber}` : '', shortDate(issue.at)].filter(Boolean).join(' · ')}</span>
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

function ColorsDialog({ hero, onSave, onClose }: { hero: Hero; onSave: (appearance: Appearance) => void; onClose: () => void }) {
  const [appearance, setAppearance] = useState<Appearance>(appearanceOf({ kind: 'hero', appearance: hero.appearance }))
  return (
    <Modal title="Change colors" onClose={onClose} wide>
      <ColorPicker kind="hero" appearance={appearance} name={heroDisplayName(hero)} onChange={setAppearance} />
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            onSave(appearance)
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}

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

type ChangeDialog = { kind: 'cosmetic'; which: CosmeticKind } | { kind: 'colors' } | { kind: 'swapTrait'; trait: 'power' | 'quality' } | { kind: 'swapPrinciple' } | { kind: 'swapAbility' } | { kind: 'rebuild' }

/** Change the hero: its three groups, side by side. */
function ChangeHero({ hero, apply, clock, rebuild }: { hero: Hero; apply: (fn: (h: Hero) => Hero) => void; clock: () => Clock; rebuild: () => void }) {
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
          <span className="gt-sub">Appearance, codename, costume, colors</span>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'appearance' })}>
            Edit appearance…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'codename' })}>
            Change codename…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'cosmetic', which: 'costume' })}>
            Edit costume…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'colors' })}>
            Change colors…
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
          <button type="button" className="button button--small" onClick={open({ kind: 'swapPrinciple' })}>
            Swap a principle…
          </button>
          <button type="button" className="button button--small" onClick={open({ kind: 'swapAbility' })}>
            Swap an ability…
          </button>
        </div>
        <div className="adv-group">
          <h3>Major rewrite</h3>
          <span className="gt-sub">Rebuild with the constructed method. History and collections stay.</span>
          {openRewrite(hero) ? (
            <a className="button button--small" href={editPath(hero.id)}>
              Continue rebuilding {name}…
            </a>
          ) : (
            <button type="button" className="button button--small" onClick={open({ kind: 'rebuild' })}>
              Rebuild {name}…
            </button>
          )}
        </div>
      </div>
      {warnings.length > 0 && <StepWarnings warnings={warnings} />}
      {dialog?.kind === 'cosmetic' && <CosmeticDialog hero={hero} kind={dialog.which} onSave={(values) => apply((h) => changeCosmetic(h, dialog.which, values, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'colors' && <ColorsDialog hero={hero} onSave={(appearance) => apply((h) => changeColors(h, appearance, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'swapTrait' && <TraitSwapDialog hero={hero} kind={dialog.trait} onSwap={(from, to) => apply((h) => swapTrait(h, from, to, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'swapPrinciple' && <PrincipleSwapDialog hero={hero} onSwap={(replace, choice) => apply((h) => swapPrinciple(h, replace, choice, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'swapAbility' && <AbilitySwapDialog hero={hero} onSwap={(from, to) => apply((h) => swapAbility(h, from, to, clock()))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rebuild' && (
        <ConfirmDialog
          title={`Rebuild ${name}?`}
          text="You'll go through every step with the constructed method. Their history, back issues and collections stay. Their current build is saved, so Undo last change can restore it."
          confirm="Rebuild"
          onConfirm={rebuild}
          onClose={() => setDialog(null)}
        />
      )}
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
  // Games joined as a player, for the issues they finished.
  const joinedStore = useOptionalJoinedStore()
  const [joined, setJoined] = useState<JoinedGame[]>([])
  useEffect(() => {
    let live = true
    joinedStore?.list().then(
      (list) => live && setJoined(list),
      () => {},
    )
    return () => {
      live = false
    }
  }, [joinedStore])
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
  const sources: IssueSource[] = [
    ...joined.filter((j) => j.heroSourceId === hero.id).map((j) => ({ game: { id: j.id, name: gameDisplayName(j.table) }, gm: j.gm, issues: j.table.issues, ...(j.issuePrompts ? { prompts: j.issuePrompts } : {}) })),
  ]
  const issues = heroIssues(hero, sources)
  const dismiss = (issue: HeroIssue) => {
    setJoined((list) => list.map((j) => (j.id === issue.game.id ? { ...j, issuePrompts: { ...j.issuePrompts, [issue.id]: 'dismissed' } } : j)))
    if (joinedStore) setIssuePrompt(joinedStore, issue.game.id, issue.id, 'dismissed').catch(() => {})
  }
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
            <BackIssues hero={hero} games={games} issues={issues} onDismiss={dismiss} apply={apply} clock={clock} />
            <ChangeHero
              hero={hero}
              apply={apply}
              clock={clock}
              rebuild={() => {
                apply((h) => startRewrite(h, clock()))
                void flush().then((ok) => ok && navigate(editPath(hero.id)))
              }}
            />
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
