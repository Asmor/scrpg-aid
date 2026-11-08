/**
 * The reference sheet export dialog (scrpg-aid-designs/reference-sheets/spec.md, section 3): step 1,
 * Contents, with the full pages in print order, the cards by type, what's left out, and the
 * options. Export prints with the arrangement as it stands.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PopoverMenu } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { defaultPageSize } from '../transfer/print'
import { defaultArrangement, leaveOut, movePage, putBack, reconcileArrangement } from './arrange'
import { sheetContents, type SheetSource } from './contents'
import { estimatePages, FULL_PAGE_COUNT } from './layout'
import { CARD_TYPE_NAME, CARD_TYPES, DEFAULT_SHEET_OPTIONS, joinAnd, sameSheetRef, sheetRefKey, type PageItem, type SheetArrangement, type SheetCard, type SheetContents, type SheetItemRef, type SheetOptions } from './model'
import { sheetFileBase, printReference } from './print'
import { ReferencePrint } from './ReferencePrint'
import { arranged, cardCountsText, hiddenText, printRules } from './sheet'
import { FirstPagePreview } from './SheetPreviewPage'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export interface ReferenceSheetDialogProps {
  source: SheetSource
  onClose: () => void
  /** For tests: the date in the file name. */
  now?: () => Date
}

/** A two-choice (or more) segmented control: buttons with aria-pressed. */
function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly [T, string][]; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <div className="ref-option">
      <span className="ref-option__label" id={id}>
        {label}
      </span>
      <div className="segmented segmented--fill" role="group" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function PageRow({ item, index, count, onMove, onOut }: { item: PageItem; index: number; count: number; onMove: (to: number) => void; onOut: () => void }) {
  const [popover, bind] = usePopover()
  const label = `More actions for ${item.name}`
  return (
    <li className="ref-row">
      <span className="ref-row__type">{item.kind === 'hero' ? 'Hero' : 'Villain'}</span>
      <span className="ref-row__name">
        <strong>{item.name}</strong>
        {item.draft && <span className="draft-badge">Draft</span>}
        {item.hidden && <span className="tag">{hiddenText(item.hidden)}</span>}
      </span>
      <span className="muted">{plural(FULL_PAGE_COUNT, 'page')}</span>
      <span className="popover-anchor">
        <button ref={bind} type="button" className="button button--small" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
          ⋯
        </button>
        {popover.open && (
          <PopoverMenu
            popover={popover}
            label={label}
            className="popover--end"
            items={[...(index > 0 ? [{ label: 'Move up', onSelect: () => onMove(index - 1) }] : []), ...(index < count - 1 ? [{ label: 'Move down', onSelect: () => onMove(index + 1) }] : []), { label: 'Leave out', onSelect: onOut }]}
          />
        )}
      </span>
    </li>
  )
}

function CardRow({ card, onOut }: { card: SheetCard; onOut: () => void }) {
  return (
    <li className="ref-row">
      <span className="ref-row__type">{CARD_TYPE_NAME[card.type]}</span>
      <span className="ref-row__name">
        <strong>{card.name}</strong>
        {card.brought && <span className="tag">From {card.from}</span>}
        {card.hidden && <span className="tag">{hiddenText(card.hidden)}</span>}
      </span>
      <button type="button" className="button button--small" aria-label={`Leave out ${card.name}`} onClick={onOut}>
        Leave out
      </button>
    </li>
  )
}

/** Everything left out, by name. */
function omittedNames(contents: SheetContents, omitted: readonly SheetItemRef[]) {
  return omitted.flatMap((ref) => {
    const item = contents.pages.find((p) => sameSheetRef(p.ref, ref)) ?? contents.cards.find((c) => sameSheetRef(c.ref, ref))
    return item ? [{ ref, name: item.name }] : []
  })
}

export function ReferenceSheetDialog({ source, onClose, now = () => new Date() }: ReferenceSheetDialogProps) {
  const [options, setOptions] = useState<SheetOptions>(() => ({
    ...DEFAULT_SHEET_OPTIONS,
    paper: defaultPageSize(typeof navigator === 'undefined' ? undefined : navigator.language),
  }))
  const set = <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => setOptions((o) => ({ ...o, [key]: value }))
  const built = useMemo((): { contents: SheetContents } | { error: string } => {
    try {
      return { contents: sheetContents(source, options) }
    } catch (e) {
      return { error: errorText(e) }
    }
  }, [source, options])
  const contents = 'contents' in built ? built.contents : undefined
  const [saved, setSaved] = useState<SheetArrangement | null>(null)
  // The arrangement for what's in it now: new items (an attached template brought) join in their place.
  const arrangement = useMemo(() => (contents ? (saved ? reconcileArrangement(saved, contents) : defaultArrangement(contents)) : undefined), [contents, saved])
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kept = contents && arrangement ? arranged(contents, arrangement) : undefined
  useEffect(() => {
    if (!printing || !contents || !kept) return
    let live = true
    printReference(printRules(kept.pages, contents, options.paper), sheetFileBase(contents, now())).then(
      () => {
        if (!live) return
        setPrinting(false)
        onClose()
      },
      (e: unknown) => {
        if (!live) return
        setPrinting(false)
        setError(`Couldn't print: ${errorText(e)}`)
      },
    )
    return () => {
      live = false
    }
    // Starts once per Export; the sheet being printed doesn't change while it's open.
  }, [printing])

  if (!contents || !arrangement || !kept) {
    return (
      <Modal title="Reference sheet" onClose={onClose}>
        <p role="alert">Couldn't make the reference sheet: {'error' in built ? built.error : ''}</p>
      </Modal>
    )
  }
  const change = (fn: (a: SheetArrangement) => SheetArrangement) => setSaved(fn(arrangement))
  const items = kept.pages.length + kept.cards.length
  const pages = estimatePages({ pages: kept.pages, cards: kept.cards.map((c) => c.card) }, options)
  const outs = omittedNames(contents, arrangement.omitted)
  const keptCards = kept.cards.map((c) => c.card)
  const shownCards = CARD_TYPES.flatMap((t) => keptCards.filter((c) => c.type === t))
  const library = source.kind === 'library'
  const nothing = items === 0 && !contents.scene
  return (
    <Modal title="Reference sheet" onClose={onClose} className="modal--reference">
      <p className="ref-dialog__sub">
        {plural(items, 'item')} · about {plural(pages, 'page')}
      </p>
      <p className="ref-dialog__steps" aria-live="polite">
        Step 1 of 1, Contents
      </p>
      <div className="ref-dialog__body">
        <div className="ref-dialog__contents">
          <h3 className="ref-label">Full pages · one each, in this order</h3>
          {kept.pages.length ? (
            <ol className="ref-list" aria-label="Full pages">
              {kept.pages.map((p, i) => (
                <PageRow key={sheetRefKey(p.ref)} item={p} index={i} count={kept.pages.length} onMove={(to) => change((a) => movePage(a, i, to))} onOut={() => change((a) => leaveOut(a, p.ref))} />
              ))}
            </ol>
          ) : (
            <p className="muted">No heroes or villains.</p>
          )}
          <h3 className="ref-label">Cards{shownCards.length ? ` · ${cardCountsText(shownCards)}` : ''}</h3>
          {shownCards.length ? (
            <ul className="ref-list" aria-label="Cards">
              {shownCards.map((c) => (
                <CardRow key={sheetRefKey(c.ref)} card={c} onOut={() => change((a) => leaveOut(a, c.ref))} />
              ))}
            </ul>
          ) : (
            <p className="muted">No minions, lieutenants, challenges or environments.</p>
          )}
          {contents.bringable.length > 0 && (
            <label className="ref-check">
              <input type="checkbox" checked={options.bringAttached} onChange={(e) => set('bringAttached', e.target.checked)} />
              <span>
                <strong>Add what environments bring</strong>
                <br />
                <span className="muted">Adds {joinAnd(contents.bringable)}</span>
              </span>
            </label>
          )}
          {outs.length > 0 && (
            <>
              <h3 className="ref-label">Left out ({outs.length})</h3>
              <ul className="ref-outs">
                {outs.map((o) => (
                  <li key={sheetRefKey(o.ref)}>
                    <button type="button" className="button button--small" onClick={() => change((a) => putBack(a, o.ref, contents))}>
                      Put back {o.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="ref-dialog__options">
          <Choice
            label="Paper"
            value={options.paper}
            options={[
              ['letter', 'Letter'],
              ['a4', 'A4'],
            ]}
            onChange={(v) => set('paper', v)}
          />
          <Choice
            label="Card columns"
            value={options.columns}
            options={[
              [2, '2'],
              [3, '3'],
            ]}
            onChange={(v) => set('columns', v)}
          />
          {library && (
            <Choice
              label="Where cards go"
              value={options.cardsFirst ? 'before' : 'after'}
              options={[
                ['after', 'After the full pages'],
                ['before', 'Before the full pages'],
              ]}
              onChange={(v) => set('cardsFirst', v === 'before')}
            />
          )}
          <label className="ref-check">
            <input type="checkbox" checked={options.writeIns} onChange={(e) => set('writeIns', e.target.checked)} />
            <span>
              <strong>Write-in spaces</strong>
              <br />
              <span className="muted">Health lines, die boxes, step and twist boxes, for tracking on paper.</span>
            </span>
          </label>
          {(keptCards.length > 0 || contents.scene) && <FirstPagePreview contents={contents} cards={kept.cards} options={options} />}
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="ref-dialog__footer">
        <span className="muted ref-dialog__file">Saved as {sheetFileBase(contents, now())}.pdf</span>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={nothing || printing} onClick={() => setPrinting(true)}>
          Export
        </button>
      </div>
      {printing && <ReferencePrint contents={contents} arrangement={arrangement} options={options} />}
    </Modal>
  )
}
