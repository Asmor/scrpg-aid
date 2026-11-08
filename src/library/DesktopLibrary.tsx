/**
 * The library at 760 px and up (scrpg-aid-designs/library/spec.md, "Page layout" and "The table"):
 * the rail of views, the title row with New, the filter bar (or the selection bar while rows
 * are checked), the table, and the footer.
 */
import { CharSwatch } from '../components/CharBand'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { GameLink, LibraryModel } from './LibraryPage'
import { helpPath } from '../app/route'
import { usePageKey } from '../help/help-context'
import { PopoverDialog, PopoverMenu } from './Popover'
import { usePopover, type Popover } from './popover-state'
import { nextSort, noMatchText, withFilterTag, type LibraryQuery, type SortKey } from './query'
import { issuesText, LIBRARY_TYPES, type RowInfo } from './registry'
import type { SavedSearch } from './saved-searches'
import { AddTagPanel, ItemTags, PlusIcon } from './TagControls'
import { hasTag, type TagCount } from './tags'
import { formatFull } from '../play/time'
import { formatAgo } from './when'
import { useSearchDialogs } from './useSearchDialogs'

type Row = LibraryModel['view']['rows'][number]

const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

/** "In Thursday game, One-shot": the games holding a copy, as links, up to two then "+N more"; nothing when none. */
export function InGamesLine({ games }: { games: readonly GameLink[] }) {
  if (!games.length) return null
  const shown = games.slice(0, 2)
  return (
    <div className="library-games">
      <span className="muted">In </span>
      {shown.map((g, i) => (
        <span key={g.id}>
          {i > 0 && <span className="muted">, </span>}
          <a href={g.href}>{g.name}</a>
        </span>
      ))}
      {games.length > 2 && <span className="muted"> +{games.length - 2} more</span>}
    </div>
  )
}

/** The item's name linking to it, with the DRAFT badge and the unnamed placeholder. */
export function NameCell({ row }: { row: RowInfo }) {
  return (
    <>
      <CharSwatch appearance={row.colors} />
      <a className={row.named ? 'library-name' : 'library-name library-name--unnamed'} href={row.openHref}>
        {row.name}
      </a>
      {row.draft && <span className="draft-badge">Draft</span>}
    </>
  )
}

/** The row's ⋯ menu: Open, Edit, Duplicate, Export, Send…, Delete… (and Select on phones). */
export function RowMenu({ model, row, onSelect }: { model: LibraryModel; row: Row; onSelect?: () => void }) {
  const [popover, bindPopover] = usePopover()
  const label = `More actions for ${row.item.row.name}`
  const info = row.item.row
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        <MoreIcon />
      </button>
      {popover.open && (
        <PopoverMenu
          popover={popover}
          label={label}
          className="popover--end"
          items={[
            ...(onSelect ? [{ label: 'Select', onSelect }] : []),
            { label: 'Open', href: info.openHref, onSelect: () => {} },
            { label: 'Edit', href: info.editHref, onSelect: () => {} },
            { label: 'Duplicate', onSelect: () => model.duplicate(row.key) },
            { label: 'Export', onSelect: () => model.exportItems([row.key]) },
            ...(model.sendItems ? [{ label: 'Send…', onSelect: () => model.sendItems?.([row.key]) }] : []),
            { label: 'Delete…', danger: true, onSelect: () => model.askDelete([row.key]) },
          ]}
        />
      )}
    </span>
  )
}

/** The + Tag filter popover: every tag, with checkboxes and counts. */
export function TagChecklist({ tags, query, onChange, hint }: { tags: readonly TagCount[]; query: LibraryQuery; onChange: (q: LibraryQuery) => void; hint: string }) {
  const [filter, setFilter] = useState('')
  const shown = tags.filter((t) => t.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
  return (
    <div className="tag-checklist">
      <p className="popover__hint">{hint}</p>
      {tags.length > 10 && <input type="text" className="popover__field" aria-label="Filter tags" placeholder="Filter tags" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {tags.length === 0 && <p className="popover__hint">No tags yet. Add one to an item with its + button.</p>}
      <ul className="tag-checklist__list">
        {shown.map((t) => {
          const on = hasTag(query.tags, t.name)
          return (
            <li key={t.name}>
              <label className="tag-checklist__option">
                <input type="checkbox" checked={on} onChange={() => onChange(on ? { ...query, tags: query.tags.filter((x) => x.toLocaleLowerCase() !== t.name.toLocaleLowerCase()) } : withFilterTag(query, t.name))} />
                <span>{t.name}</span>
                <span className="muted">{t.count}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The name field that replaces Save search: Enter saves, Escape cancels, a bad name shows inline. */
export function SaveSearchField({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => Promise<string | undefined>; onCancel: () => void }) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | undefined>()
  const input = useRef<HTMLInputElement>(null)
  const errorId = useId()
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const save = async () => setError(await onSave(name))
  return (
    <span className="save-search">
      <input
        ref={input}
        type="text"
        aria-label="Saved search name"
        value={name}
        maxLength={80}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
      <button type="button" className="button button--primary button--small" onClick={() => void save()}>
        Save
      </button>
      <button type="button" className="button button--quiet button--small" onClick={onCancel}>
        Cancel
      </button>
      {error && (
        <span id={errorId} role="alert" className="error save-search__error">
          {error}
        </span>
      )}
    </span>
  )
}

/** Save search, its name field, or "Saved" while the view is a saved search. */
export function SaveSearch({ model }: { model: LibraryModel }) {
  const [saving, setSaving] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const saved = model.view.view.kind === 'saved'
  if (saving && !saved)
    return (
      <SaveSearchField
        initial={model.suggestedName}
        onSave={async (name) => {
          const error = await model.saveSearch(name)
          if (!error) setSaving(false)
          return error
        }}
        onCancel={() => {
          setSaving(false)
          requestAnimationFrame(() => button.current?.focus())
        }}
      />
    )
  return (
    <button ref={button} type="button" className="button button--small" disabled={saved} onClick={() => setSaving(true)}>
      {saved ? 'Saved' : 'Save search'}
    </button>
  )
}

/** The search field, applied about 150 ms after typing stops. */
export function SearchField({ model, className }: { model: LibraryModel; className?: string }) {
  const { query, setQuery } = model.view
  const [text, setText] = useState(query.text)
  // A new view (a saved search, Clear, Back) puts its text in the field.
  const [shownText, setShownText] = useState(query.text)
  if (query.text !== shownText) {
    setShownText(query.text)
    setText(query.text)
  }
  useEffect(() => {
    if (text === query.text) return
    const timer = setTimeout(() => setQuery({ ...query, text }), 150)
    return () => clearTimeout(timer)
  }, [text, query, setQuery])
  // "/" puts focus here (scrpg-aid-designs/help/spec.md, section 5).
  const input = useRef<HTMLInputElement>(null)
  usePageKey('/', (e) => {
    e.preventDefault()
    input.current?.focus()
  })
  return (
    <label className={`library-search ${className ?? ''}`}>
      <SearchIcon />
      <input ref={input} type="search" aria-label="Search by name" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  )
}

/** A type chip per type with items; any chosen type matches. */
export function TypeChips({ model }: { model: LibraryModel }) {
  const { query, setQuery } = model.view
  return (
    <>
      {model.typesInUse.map((t) => {
        const on = query.types.includes(t.key)
        return (
          <button key={t.key} type="button" className={on ? 'filter-chip filter-chip--on' : 'filter-chip'} aria-pressed={on} onClick={() => setQuery({ ...query, types: on ? query.types.filter((k) => k !== t.key) : [...query.types, t.key] })}>
            {t.plural}
          </button>
        )
      })}
    </>
  )
}

/** The active tag filters, each with an X. */
export function ActiveTags({ model }: { model: LibraryModel }) {
  const { query, setQuery } = model.view
  return (
    <>
      {query.tags.map((tag) => (
        <span key={tag} className="active-tag">
          {tag}
          <button type="button" aria-label={`Remove tag filter ${tag}`} title={`Remove tag filter ${tag}`} onClick={() => setQuery({ ...query, tags: query.tags.filter((t) => t !== tag) })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      ))}
    </>
  )
}

function FilterBar({ model }: { model: LibraryModel }) {
  const [tagPopover, bindTagPopover] = usePopover()
  const { query, setQuery } = model.view
  return (
    <div className="filter-bar" role="search">
      <SearchField model={model} />
      <TypeChips model={model} />
      <span className="filter-bar__sep" aria-hidden="true" />
      <ActiveTags model={model} />
      <span className="popover-anchor">
        <button ref={bindTagPopover} type="button" className="filter-chip" aria-haspopup="dialog" aria-expanded={tagPopover.open} onClick={tagPopover.toggle}>
          <PlusIcon /> Tag
        </button>
        {tagPopover.open && (
          <PopoverDialog popover={tagPopover} label="Filter by tags">
            <TagChecklist tags={model.tags} query={query} onChange={setQuery} hint="Shows items that have every tag you pick." />
          </PopoverDialog>
        )}
      </span>
      {model.filtered && (
        <>
          <button type="button" className="button button--quiet button--small" onClick={() => setQuery({ text: '', types: [], tags: [] })}>
            Clear
          </button>
          <span className="filter-bar__grow" />
          <SaveSearch key={model.view.refreshes} model={model} />
        </>
      )}
    </div>
  )
}

/** Remove tag: only the selection's tags, each with "2 of 3". */
export function RemoveTagPanel({ model, popover }: { model: LibraryModel; popover: Popover }) {
  const keys = [...model.view.selected]
  const docs = model.view.rows.filter((r) => model.view.selected.has(r.key)).map((r) => r.item.doc)
  const counts = new Map<string, { name: string; count: number }>()
  for (const doc of docs) for (const tag of doc.tags) {
    const key = tag.toLocaleLowerCase()
    counts.set(key, { name: counts.get(key)?.name ?? tag, count: (counts.get(key)?.count ?? 0) + 1 })
  }
  const list = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  return (
    <PopoverDialog popover={popover} label="Remove a tag from the selected items">
      <p className="popover__hint">{list.length ? 'Tags on the selected items' : 'The selected items have no tags.'}</p>
      <div className="popover__options">
        {list.map((t) => (
          <button
            key={t.name}
            type="button"
            className="popover__option"
            onClick={() => {
              popover.close()
              model.bulkRemoveTag(t.name)
            }}
          >
            {t.name}
            <span className="muted">
              {t.count} of {keys.length}
            </span>
          </button>
        ))}
      </div>
    </PopoverDialog>
  )
}

function SelectionBar({ model }: { model: LibraryModel }) {
  const [add, bindAdd] = usePopover()
  const [remove, bindRemove] = usePopover()
  const keys = [...model.view.selected]
  const tagsOnAll = model.tags.filter((t) => model.view.rows.filter((r) => model.view.selected.has(r.key)).every((r) => hasTag(r.item.doc.tags, t.name))).map((t) => t.name)
  return (
    <div className="selection-bar" role="region" aria-label="Selected items">
      <span className="selection-bar__count">{keys.length} selected</span>
      <span className="filter-bar__sep" aria-hidden="true" />
      <span className="popover-anchor">
        <button ref={bindAdd} type="button" className="button button--small" aria-haspopup="dialog" aria-expanded={add.open} onClick={add.toggle}>
          Add tag
        </button>
        {add.open && <AddTagPanel popover={add} label="Add a tag to the selected items" allTags={model.tags} exclude={tagsOnAll} onAdd={model.bulkAddTag} />}
      </span>
      <span className="popover-anchor">
        <button ref={bindRemove} type="button" className="button button--small" aria-haspopup="dialog" aria-expanded={remove.open} onClick={remove.toggle}>
          Remove tag
        </button>
        {remove.open && <RemoveTagPanel model={model} popover={remove} />}
      </span>
      <button type="button" className="button button--small" onClick={() => model.exportItems(keys)}>
        Export
      </button>
      {model.sendItems && (
        <button type="button" className="button button--small" onClick={() => model.sendItems?.(keys)}>
          Send…
        </button>
      )}
      <button type="button" className="button button--small button--danger" onClick={() => model.askDelete(keys)}>
        Delete…
      </button>
      <span className="filter-bar__grow" />
      <button type="button" className="button button--quiet button--small" onClick={() => model.view.setSelected(new Set())}>
        Clear selection
      </button>
    </div>
  )
}

function SortButton({ model, label, sortKey }: { model: LibraryModel; label: string; sortKey: SortKey }) {
  const { sort, setSort } = model.view
  const on = sort.key === sortKey
  return (
    <button type="button" className={on ? 'sort-button sort-button--on' : 'sort-button'} onClick={() => setSort(nextSort(sort, sortKey))}>
      {label}
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d={sort.dir === 'asc' ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} />
        </svg>
      )}
    </button>
  )
}

/** The header cell's aria-sort: the direction when one of its keys is the active sort. */
function ariaSort(model: LibraryModel, keys: readonly SortKey[]) {
  const { sort } = model.view
  return keys.includes(sort.key) ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
}

/**
 * The condensed four-column table (scrpg-aid-designs/library/spec.md, section 4): select; name, type
 * and details; in games and tags; changed with the actions. Rows grow taller instead of the
 * table scrolling sideways.
 */
function LibraryTable({ model }: { model: LibraryModel }) {
  const { rows, selected, setSelected, query, setQuery } = model.view
  const all = useRef<HTMLInputElement>(null)
  const some = selected.size > 0 && selected.size < rows.length
  useEffect(() => {
    if (all.current) all.current.indeterminate = some
  }, [some])
  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }
  return (
    <div className="library-table-wrap">
      <table className="library-table" aria-label="Library">
        <thead>
          <tr>
            <th scope="col" className="library-table__select">
              <input ref={all} type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && selected.size === rows.length} disabled={rows.length === 0} onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.key)))} />
            </th>
            <th scope="col" className="library-table__item" aria-sort={ariaSort(model, ['name', 'type'])}>
              <SortButton model={model} label="Name" sortKey="name" />
              <span className="library-table__dot" aria-hidden="true">
                ·
              </span>
              <SortButton model={model} label="Type" sortKey="type" />
              <span className="library-table__dot" aria-hidden="true">
                ·
              </span>
              <span>Details</span>
            </th>
            <th scope="col" className="library-table__meta">
              In games · Tags
            </th>
            <th scope="col" className="library-table__when" aria-sort={ariaSort(model, ['changed'])}>
              <SortButton model={model} label="Changed" sortKey="changed" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const info = r.item.row
            const on = selected.has(r.key)
            return (
              <tr key={r.key} className={on ? 'library-row library-row--selected' : 'library-row'}>
                <td className="library-table__select">
                  <input type="checkbox" aria-label={`Select ${info.name}`} checked={on} onChange={() => toggle(r.key)} />
                </td>
                <td>
                  <div className="library-table__name">
                    <NameCell row={info} />
                  </div>
                  <div className="library-type">
                    {r.item.type.label}
                    {info.kind && <span className="muted"> ({info.kind})</span>}
                  </div>
                  {info.details && (
                    <div className="library-details" title={info.details}>
                      {info.details}
                    </div>
                  )}
                  {info.issues && (
                    <a className="library-issues" href={info.issues.href}>
                      {issuesText(info.issues.count)}
                    </a>
                  )}
                </td>
                <td>
                  <InGamesLine games={model.inGames(r.item)} />
                  <ItemTags
                    tags={r.item.doc.tags}
                    itemName={info.name}
                    allTags={model.tags}
                    isActive={(t) => hasTag(query.tags, t)}
                    onFilter={(t) => setQuery(withFilterTag(query, t))}
                    onAdd={(t) => model.addTag(r.key, t)}
                    onRemove={(t) => model.removeTag(r.key, t)}
                  />
                </td>
                <td className="library-table__when">
                  <time className="library-when" dateTime={r.item.doc.updatedAt} title={formatFull(r.item.doc.updatedAt)}>
                    {formatAgo(r.item.doc.updatedAt, model.now)}
                  </time>
                  <span className="library-actions">
                    {info.primary && (
                      <a className="button button--small" href={info.primary.href} aria-label={`${info.primary.label} ${info.name}`}>
                        {info.primary.label}
                      </a>
                    )}
                    <RowMenu model={model} row={r} />
                  </span>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4}>
                <NoMatches model={model} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function NoMatches({ model }: { model: LibraryModel }) {
  return (
    <div className="library-no-matches">
      <p className="library-no-matches__title">Nothing matches</p>
      <p className="muted">{noMatchText(model.view.query)}</p>
      <button type="button" className="button button--small" onClick={() => model.view.setQuery({ text: '', types: [], tags: [] })}>
        Clear filters
      </button>
    </div>
  )
}

/** "10 items" or "Showing 3 of 10", the no-longer-matching count with Refresh, and the live count. */
export function FooterLine({ model, hint }: { model: LibraryModel; hint?: ReactNode }) {
  const { rows, stale, refresh, refreshes } = model.view
  const total = model.items.length
  const shown = rows.length === total && !model.filtered ? `${total} ${total === 1 ? 'item' : 'items'}` : `Showing ${rows.length} of ${total}`
  // Announce the count each time the snapshot is retaken (not when it's first shown).
  const [seen, setSeen] = useState(refreshes)
  const [announce, setAnnounce] = useState('')
  if (refreshes !== seen) {
    setSeen(refreshes)
    setAnnounce(`${rows.length} ${rows.length === 1 ? 'item' : 'items'} shown`)
  }
  return (
    <div className="library-footer">
      <span>
        {shown}
        {stale > 0 && (
          <>
            {' · '}
            {stale === 1 ? '1 item no longer matches.' : `${stale} items no longer match.`}{' '}
            <button type="button" className="library-link" onClick={() => refresh()}>
              Refresh
            </button>
          </>
        )}
      </span>
      {hint}
      <span className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  )
}

function SearchMenu({ search, onRename, onDelete }: { search: SavedSearch; onRename: () => void; onDelete: () => void }) {
  const [popover, bindPopover] = usePopover()
  const label = `More actions for ${search.name}`
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className="icon-button icon-button--small" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        <MoreIcon />
      </button>
      {popover.open && (
        <PopoverMenu
          popover={popover}
          label={label}
          items={[
            { label: 'Rename', onSelect: onRename },
            { label: 'Delete', danger: true, onSelect: onDelete },
          ]}
        />
      )}
    </span>
  )
}

function Rail({ model }: { model: LibraryModel }) {
  const { view } = model.view
  const dialogs = useSearchDialogs(model)
  return (
    <nav className="library-rail" aria-label="Library views">
      <button type="button" className="library-rail__view" aria-current={view.kind === 'all' ? 'page' : undefined} onClick={model.view.showAll}>
        All <span className="library-rail__count">{model.items.length}</span>
      </button>
      <p className="library-rail__label">Saved searches</p>
      {model.searches.length === 0 && <p className="library-rail__hint">Filter the library by type and tags, then save the search to find it here.</p>}
      <ul className="library-rail__list">
        {model.searches.map((s) => (
          <li key={s.id} className="library-rail__item">
            <button type="button" className="library-rail__view" aria-current={view.kind === 'saved' && view.id === s.id ? 'page' : undefined} onClick={() => model.view.showSaved(s.id)}>
              <span className="library-rail__name">{s.name}</span>{' '}
              <span className="library-rail__count">{model.countFor(s.query)}</span>
            </button>
            <SearchMenu search={s} onRename={() => dialogs.rename(s)} onDelete={() => dialogs.remove(s)} />
          </li>
        ))}
      </ul>
      {dialogs.dialogs}
    </nav>
  )
}

/** The New menu: one item per type that can be created. */
export function NewMenu({ model, className }: { model: LibraryModel; className?: string }) {
  const [popover, bindPopover] = usePopover()
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className={`button button--primary ${className ?? ''}`} aria-haspopup="menu" aria-expanded={popover.open} disabled={model.busy || !model.ready} onClick={popover.toggle}>
        <PlusIcon size={16} /> New
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {popover.open && <PopoverMenu popover={popover} label="New" className="popover--end" items={LIBRARY_TYPES.filter((t) => t.create).map((t) => ({ label: t.label, onSelect: () => model.create(t) }))} />}
    </span>
  )
}

/**
 * The empty library's "New to SCRPG Aid?" card (scrpg-aid-designs/help/spec.md, section 4): build a
 * hero, or run a game. Dismissing it hides it on this device for good.
 */
function FirstRun({ model }: { model: LibraryModel }) {
  const hero = LIBRARY_TYPES.find((t) => t.key === 'hero')!
  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <button
        type="button"
        className="icon-button first-run__x"
        aria-label="Dismiss, don't show again"
        onClick={() => {
          // The card goes; focus goes to what's left.
          document.getElementById('library-empty-title')?.focus()
          model.dismissFirstRun()
        }}
      >
        ✕
      </button>
      <div>
        <h2 id="first-run-title">New to SCRPG Aid?</h2>
        <p className="muted">Pick where you'd like to start. You can do the other any time.</p>
      </div>
      <div className="first-run__paths">
        <button type="button" className="first-run__path" disabled={model.busy} aria-labelledby="first-run-hero-name" aria-describedby="first-run-hero" onClick={() => model.create(hero)}>
          <span className="first-run__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
            </svg>
          </span>
          <strong id="first-run-hero-name">Build a hero</strong>
          <span className="muted" id="first-run-hero">
            Step by step, with the rules checked as you go.
          </span>
        </button>
        <button type="button" className="first-run__path" disabled={model.busy} aria-labelledby="first-run-game-name" aria-describedby="first-run-game" onClick={model.startGame}>
          <span className="first-run__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M8 21h8M12 18v3" />
            </svg>
          </span>
          <strong id="first-run-game-name">Run a game</strong>
          <span className="muted" id="first-run-game">
            Make villains and scenes, then invite players with a code.
          </span>
        </button>
      </div>
      <p className="muted">
        Everything is saved in this browser. <a href={helpPath()}>Help</a> explains the rest.
      </p>
    </section>
  )
}

/** The empty library's panel, under the first-run card until that's dismissed. */
export function EmptyLibrary({ model }: { model: LibraryModel }) {
  return (
    <>
      {model.firstRun && <FirstRun model={model} />}
      <section className="library-empty" aria-labelledby="library-empty-title">
        <h2 id="library-empty-title" tabIndex={-1}>
          Your library is empty
        </h2>
        <p className="muted">Everything you make lands here: heroes, villains and more. Tag things however suits you, by game, by scene, by group, and filter by those tags to find them fast.</p>
        <div className="button-row">
          {LIBRARY_TYPES.filter((t) => t.create).map((t, i) => (
            <button key={t.key} type="button" className={i === 0 ? 'button button--primary' : 'button'} disabled={model.busy} onClick={() => model.create(t)}>
              New {t.label.toLowerCase()}
            </button>
          ))}
          <button type="button" className="button" disabled={model.busy} onClick={model.addExample}>
            Add an example hero
          </button>
          <button type="button" className="button" disabled={model.busy} onClick={model.start.importFile}>
            Import from a file…
          </button>
        </div>
        <p className="muted">Everything is saved in this browser. Have a code from your GM? Use Play together, at the top of the page, to join.</p>
      </section>
    </>
  )
}

/** Records that couldn't be read, to delete. */
export function UnreadableList({ model }: { model: LibraryModel }) {
  const list = model.ready?.unreadable ?? []
  if (!list.length) return null
  return (
    <section className="unreadable" aria-labelledby="unreadable-title">
      <h2 id="unreadable-title">{list.length === 1 ? 'One saved item' : `${list.length} saved items`} couldn't be read</h2>
      <p>They may have been saved by a newer version of the app. Deleting one can't be undone.</p>
      <ul className="hero-cards">
        {list.map((u) => (
          <li key={`${u.type.key}:${u.id}`} className="hero-card">
            <span>
              {u.type.label} {u.id}: {u.error}
            </span>
            <button type="button" className="button" disabled={model.busy} aria-label={`Delete unreadable ${u.type.label.toLowerCase()} ${u.id}`} onClick={() => model.removeUnreadable(u.type, u.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Loading, a load error, or the action error. */
export function LibraryMessages({ model }: { model: LibraryModel }) {
  return (
    <>
      {model.state.status === 'loading' && <p>Loading your library…</p>}
      {model.state.status === 'error' && (
        <p role="alert" className="error">
          Couldn't load your library: {model.state.message}
        </p>
      )}
      {model.error && (
        <p role="alert" className="error">
          {model.error}
        </p>
      )}
    </>
  )
}

export function DesktopLibrary({ model }: { model: LibraryModel }) {
  const empty = model.ready && model.items.length === 0
  return (
    <div className="library-layout">
      <Rail model={model} />
      <main className="library-content">
        <div className="library-title">
          <h1>{model.title}</h1>
          <NewMenu model={model} />
        </div>
        {model.importControl}
        <LibraryMessages model={model} />
        {model.ready && model.view.ready && !empty && (
          <>
            {model.view.selected.size > 0 ? <SelectionBar model={model} /> : <FilterBar model={model} />}
            <LibraryTable model={model} />
            <FooterLine model={model} hint={<span>Click a tag in the table to filter by it.</span>} />
          </>
        )}
        {empty && <EmptyLibrary model={model} />}
        <UnreadableList model={model} />
      </main>
    </div>
  )
}
