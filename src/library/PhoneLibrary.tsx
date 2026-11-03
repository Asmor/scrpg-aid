/**
 * The library under 760 px (docs/design/library/spec.md, "Phone"): the view's name opens a
 * sheet of views, Filters opens a sheet of type and tag filters, and rows are a list. Press and
 * hold a row (or ⋯ Select) to start selecting; a bottom bar holds the bulk actions.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Modal } from '../components/Modal'
import { ActiveTags, FooterLine, LibraryMessages, NameCell, NewMenu, NoMatches, RemoveTagPanel, RowMenu, SaveSearchField, SearchField, TagChecklist, TypeChips, EmptyLibrary, UnreadableList } from './DesktopLibrary'
import type { GameLink, LibraryModel } from './LibraryPage'
import { usePopover } from './popover-state'
import { filterCount } from './query'
import { AddTagPanel, ItemTags } from './TagControls'
import { hasTag } from './tags'
import { useSearchDialogs } from './useSearchDialogs'

type Row = LibraryModel['view']['rows'][number]

/** How long a press must last to start selecting. */
export const HOLD_MS = 500

function ViewSheet({ model, onClose }: { model: LibraryModel; onClose: () => void }) {
  const { view } = model.view
  const dialogs = useSearchDialogs(model)
  const pick = (go: () => void) => () => {
    onClose()
    go()
  }
  return (
    <Modal title="Views" variant="sheet" onClose={onClose}>
      <ul className="phone-views">
        <li>
          <button type="button" className="library-rail__view" aria-current={view.kind === 'all' ? 'page' : undefined} onClick={pick(model.view.showAll)}>
            All <span className="library-rail__count">{model.items.length}</span>
          </button>
        </li>
        {model.searches.map((s) => (
          <li key={s.id} className="library-rail__item">
            <button type="button" className="library-rail__view" aria-current={view.kind === 'saved' && view.id === s.id ? 'page' : undefined} onClick={pick(() => model.view.showSaved(s.id))}>
              <span className="library-rail__name">{s.name}</span> <span className="library-rail__count">{model.countFor(s.query)}</span>
            </button>
            <button type="button" className="button button--quiet button--small" aria-label={`Rename ${s.name}`} onClick={() => dialogs.rename(s)}>
              Rename
            </button>
            <button type="button" className="button button--quiet button--small menu-item--danger" aria-label={`Delete ${s.name}`} onClick={() => dialogs.remove(s)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {model.searches.length === 0 && <p className="muted">Filter the library by type and tags, then save the search to find it here.</p>}
      {dialogs.dialogs}
    </Modal>
  )
}

function FiltersSheet({ model, onClose }: { model: LibraryModel; onClose: () => void }) {
  const { query, setQuery, rows } = model.view
  const [saving, setSaving] = useState(false)
  const saved = model.view.view.kind === 'saved'
  return (
    <Modal title="Filters" variant="sheet" onClose={onClose}>
      <div className="phone-filters">
        <button type="button" className="button button--quiet button--small phone-filters__clear" onClick={() => setQuery({ ...query, types: [], tags: [] })}>
          Clear
        </button>
        <div>
          <p className="phone-filters__label">Type</p>
          <div className="button-row">
            <TypeChips model={model} />
          </div>
        </div>
        <TagChecklist tags={model.tags} query={query} onChange={setQuery} hint="Tags · items must have every tag you pick" />
        {saving && !saved ? (
          <SaveSearchField
            initial={model.suggestedName}
            onSave={async (name) => {
              const error = await model.saveSearch(name)
              if (!error) setSaving(false)
              return error
            }}
            onCancel={() => setSaving(false)}
          />
        ) : null}
        <div className="phone-filters__actions">
          <button type="button" className="button" disabled={saved || !model.filtered || saving} onClick={() => setSaving(true)}>
            {saved ? 'Saved' : 'Save search'}
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Show {rows.length}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** One row: press and hold to start selecting; while selecting, its checkbox toggles it. */
function PhoneRow({ model, row, selecting }: { model: LibraryModel; row: Row; selecting: boolean }) {
  const info = row.item.row
  const { selected, setSelected } = model.view
  const on = selected.has(row.key)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const toggle = () => {
    const next = new Set(selected)
    if (next.has(row.key)) next.delete(row.key)
    else next.add(row.key)
    setSelected(next)
  }
  const start = (e: PointerEvent) => {
    if (e.button !== 0 || selecting) return
    held.current = false
    timer.current = setTimeout(() => {
      held.current = true
      setSelected(new Set([...selected, row.key]))
    }, HOLD_MS)
  }
  const stop = () => {
    clearTimeout(timer.current)
    // A hold that ends without a click (dragged off, cancelled) mustn't swallow a later tap.
    if (held.current) setTimeout(() => (held.current = false), 400)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <li
      className={on ? 'phone-row phone-row--selected' : 'phone-row'}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => {
        // A long press on touch opens the browser's menu otherwise.
        if (held.current) e.preventDefault()
      }}
      onClickCapture={(e) => {
        // The click that ends a hold doesn't follow the link.
        if (held.current) {
          held.current = false
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {selecting && <input type="checkbox" className="phone-row__check" aria-label={`Select ${info.name}`} checked={on} onChange={toggle} />}
      <div className="phone-row__main">
        <div className="phone-row__name">
          <NameCell row={info} />
        </div>
        <div className="phone-row__sub">
          {row.item.type.label}
          {info.details && ` · ${info.details}`}
        </div>
        {info.issues && (
          <a className="library-issues" href={info.issues.href}>
            {info.issues.count === 1 ? '1 rule issue' : `${info.issues.count} rule issues`}
          </a>
        )}
        <div className="phone-row__line">
          <InGamesLine games={model.inGames(row.item)} />
          <ItemTags tags={row.item.doc.tags} itemName={info.name} allTags={model.tags} isActive={(t) => hasTag(model.view.query.tags, t)} onAdd={(t) => model.addTag(row.key, t)} onRemove={(t) => model.removeTag(row.key, t)} />
        </div>
      </div>
      <div className="phone-row__actions">
        <a className="button" href={info.primary.href} aria-label={`${info.primary.label} ${info.name}`}>
          {info.primary.label}
        </a>
        <RowMenu model={model} row={row} onSelect={() => setSelected(new Set([...selected, row.key]))} />
      </div>
    </li>
  )
}

/** "In Thursday game" (and "+2 more"), linking to the games; nothing when it's in none. */
function InGamesLine({ games }: { games: readonly GameLink[] }) {
  if (!games.length) return null
  const first = games[0]!
  return (
    <span className="phone-row__games">
      In <a href={first.href}>{first.name}</a>
      {games.length > 1 && ` +${games.length - 1} more`}
    </span>
  )
}

function BottomBar({ model }: { model: LibraryModel }) {
  const [add, bindAdd] = usePopover()
  const [remove, bindRemove] = usePopover()
  const keys = [...model.view.selected]
  const rows = model.view.rows.filter((r) => model.view.selected.has(r.key))
  const tagsOnAll = model.tags.filter((t) => rows.every((r) => hasTag(r.item.doc.tags, t.name))).map((t) => t.name)
  return (
    <div className="phone-bar" role="region" aria-label="Selected items">
      <span className="selection-bar__count">{keys.length} selected</span>
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
      <button type="button" className="button button--small button--danger" onClick={() => model.askDelete(keys)}>
        Delete
      </button>
      <button type="button" className="button button--small button--quiet" onClick={() => model.view.setSelected(new Set())}>
        Cancel
      </button>
    </div>
  )
}

export function PhoneLibrary({ model }: { model: LibraryModel }) {
  const [sheet, setSheet] = useState<'views' | 'filters' | null>(null)
  const empty = model.ready && model.items.length === 0
  const count = filterCount(model.view.query)
  const selecting = model.view.selected.size > 0
  return (
    <main className={selecting ? 'phone-library phone-library--selecting' : 'phone-library'}>
      <div className="phone-library__top">
        <h1 className="phone-library__title">
          <button type="button" className="phone-view-button" aria-haspopup="dialog" onClick={() => setSheet('views')}>
            {model.title}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </h1>
        <NewMenu model={model} />
      </div>
      {model.importControl}
      <LibraryMessages model={model} />
      {model.ready && model.view.ready && !empty && (
        <>
          <div className="phone-tools" role="search">
            <SearchField model={model} className="phone-tools__search" />
            <button type="button" className="button" aria-haspopup="dialog" aria-label={count ? `Filters, ${count} on` : 'Filters'} onClick={() => setSheet('filters')}>
              Filters
              {count > 0 && (
                <span className="phone-tools__count" aria-hidden="true">
                  {count}
                </span>
              )}
            </button>
          </div>
          {model.view.query.tags.length > 0 && (
            <div className="phone-active-tags">
              <ActiveTags model={model} />
            </div>
          )}
          {model.view.rows.length > 0 ? (
            <ul className="phone-rows" aria-label="Library">
              {model.view.rows.map((r) => (
                <PhoneRow key={r.key} model={model} row={r} selecting={selecting} />
              ))}
            </ul>
          ) : (
            <NoMatches model={model} />
          )}
          <FooterLine model={model} hint={!selecting && <span>Press and hold an item to select several.</span>} />
        </>
      )}
      {empty && <EmptyLibrary model={model} />}
      <UnreadableList model={model} />
      {selecting && <BottomBar model={model} />}
      {sheet === 'views' && <ViewSheet model={model} onClose={() => setSheet(null)} />}
      {sheet === 'filters' && <FiltersSheet model={model} onClose={() => setSheet(null)} />}
    </main>
  )
}
