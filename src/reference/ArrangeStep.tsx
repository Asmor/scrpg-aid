/**
 * Step 2 of the reference sheet export, Arrange (scrpg-aid-designs/reference-sheets/spec.md, section 4):
 * the card pages as they'll print, with each card moved by drag, by keyboard (its handle: Space
 * picks it up, arrows move it, Space drops, Escape cancels) or from its ⋯ menu, and column and
 * page breaks. The cards are measured as drawn, so the pages reflow as they will print.
 */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { PopoverMenu } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { leaveOut, moveCard, setBreak } from './arrange'
import { columnMoveTarget, pageBox, type Layout } from './layout'
import { CARD_TYPE_NAME, sheetRefKey, type SheetArrangement, type SheetContents, type SheetOptions } from './model'
import { fillCss } from '../colors/palette'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { layoutCards, placeText, type ArrangedCard } from './sheet'
import { SheetCardView } from './SheetCards'
import { CardPage } from './SheetPreviewPage'

type Change = (fn: (a: SheetArrangement) => SheetArrangement) => void

const BREAK_NAME = { column: 'Column break', page: 'Page break' } as const

/** Each card's height as drawn at the column's width, by key; empty until drawn (or where nothing is laid out, as in tests). */
function useCardHeights(cards: readonly ArrangedCard[], options: SheetOptions) {
  const box = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map())
  const keys = cards.map((c) => sheetRefKey(c.card.ref)).join('|')
  // Measured when drawn and again whenever a card's size changes (fonts arriving, options): a
  // ResizeObserver reports each. Without one (tests), the layout uses estimates.
  useLayoutEffect(() => {
    const root = box.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const read = () => {
      const next = new Map<string, number>()
      for (const el of root.querySelectorAll<HTMLElement>('[data-card]')) if (el.offsetHeight) next.set(el.dataset.card!, el.offsetHeight)
      setHeights((now) => (now.size === next.size && [...next].every(([k, h]) => now.get(k) === h) ? now : next))
    }
    const watch = new ResizeObserver(read)
    for (const el of root.querySelectorAll<HTMLElement>('[data-card]')) watch.observe(el)
    return () => watch.disconnect()
  }, [keys, options.columns, options.paper, options.writeIns])
  const width = pageBox(options.paper, options.columns).columnWidth
  const measure = (
    <div className="ref-measure" ref={box} aria-hidden="true" style={{ width }}>
      {cards.map((c) => (
        <div key={sheetRefKey(c.card.ref)} data-card={sheetRefKey(c.card.ref)}>
          <SheetCardView card={c.card} writeIns={options.writeIns} />
        </div>
      ))}
    </div>
  )
  return { heights, measure }
}

/** How much to shrink a page so it fits the board's height. */
function useFitScale(pageHeight: number) {
  const board = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.55)
  useLayoutEffect(() => {
    const el = board.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const room = el.clientHeight - 40
      if (room > 100) setScale(Math.min(1, room / pageHeight))
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [pageHeight])
  return { board, scale }
}

interface CardProps {
  item: ArrangedCard
  index: number
  count: number
  continued: boolean
  tooTall: boolean
  writeIns: boolean
  selected: boolean
  picked: boolean
  drop: 'before' | 'after' | null
  /** A phone's list row instead of the card as it prints. */
  compact: boolean
  onSelect: () => void
  onHandleKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  onHandleBlur: (e: FocusEvent<HTMLButtonElement>) => void
  onMove: (to: number) => void
  onBreak: (kind: 'column' | 'page' | undefined) => void
  onOut: () => void
  onDragStart: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: () => void
  onDragEnd: () => void
}

function ArrangeCard({ item, index, count, continued, tooTall, writeIns, selected, picked, drop, compact, onSelect, onHandleKey, onHandleBlur, onMove, onBreak, onOut, onDragStart, onDragOver, onDrop, onDragEnd }: CardProps) {
  const [popover, bind] = usePopover()
  const name = item.card.name
  const label = `More actions for ${name}`
  const key = sheetRefKey(item.card.ref)
  if (continued) return <SheetCardView card={item.card} writeIns={writeIns} continued />
  const classes = [compact ? 'ref-arrange-row' : 'ref-arrange-card', selected && 'ref-arrange-card--selected', picked && 'ref-arrange-card--picked', drop && `ref-arrange-card--drop-${drop}`].filter(Boolean).join(' ')
  return (
    <>
      {item.breakBefore && (
        <div className="ref-break">
          <span>{BREAK_NAME[item.breakBefore]}</span>
          <button type="button" className="ref-break__remove" aria-label={`Remove the ${BREAK_NAME[item.breakBefore].toLowerCase()} before ${name}`} onClick={() => onBreak(undefined)}>
            ×
          </button>
        </div>
      )}
      <div
        className={classes}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', key)
          onDragStart()
        }}
        onDragOver={onDragOver}
        onDrop={(e) => {
          e.preventDefault()
          onDrop()
        }}
        onDragEnd={onDragEnd}
      >
        <div className="ref-arrange-card__tools">
          <button type="button" className="ref-handle" data-handle={key} aria-label={`Move ${name}`} aria-pressed={selected} onClick={onSelect} onKeyDown={onHandleKey} onBlur={onHandleBlur}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" />))}
            </svg>
          </button>
          {tooTall && (
            <span className="ref-warning" role="img" aria-label="Too tall for one column. It will continue in the next." title="Too tall for one column. It will continue in the next.">
              ⚠
            </span>
          )}
          <span className="popover-anchor">
            <button ref={bind} type="button" className="ref-handle" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
              ⋯
            </button>
            {popover.open && (
              <PopoverMenu
                popover={popover}
                label={label}
                className="popover--end"
                items={[
                  ...(compact && index > 0 ? [{ label: 'Move up', onSelect: () => onMove(index - 1) }] : []),
                  ...(compact && index < count - 1 ? [{ label: 'Move down', onSelect: () => onMove(index + 1) }] : []),
                  ...(index > 0 ? [{ label: 'Move to top', onSelect: () => onMove(0) }] : []),
                  ...(index < count - 1 ? [{ label: 'Move to bottom', onSelect: () => onMove(count - 1) }] : []),
                  ...(index > 0 && item.breakBefore !== 'column' ? [{ label: 'Start a new column here', onSelect: () => onBreak('column') }] : []),
                  ...(index > 0 && item.breakBefore !== 'page' ? [{ label: 'Start a new page here', onSelect: () => onBreak('page') }] : []),
                  { label: 'Leave out', onSelect: onOut },
                ]}
              />
            )}
          </span>
        </div>
        {compact ? (
          <span className="ref-arrange-row__name">
            <span className="ref-arrange-row__band" style={{ background: fillCss(item.card.appearance) }} aria-hidden="true" />
            <strong>{name}</strong>
            <span className="muted">
              {CARD_TYPE_NAME[item.card.type]}
              {item.card.from ? ` · from ${item.card.from}` : ''}
            </span>
          </span>
        ) : (
          <SheetCardView card={item.card} writeIns={writeIns} />
        )}
      </div>
    </>
  )
}

export interface ArrangeStepProps {
  contents: SheetContents
  arrangement: SheetArrangement
  cards: readonly ArrangedCard[]
  options: SheetOptions
  /** A move to keep (Undo can take it back). */
  onChange: Change
  /** A move while a card is picked up: shown, but kept only when it's dropped. */
  onPreview: (a: SheetArrangement) => void
  /** Ends a keyboard pick-up: keeps the moves since `from`, or (cancel) goes back to it. */
  onPickEnd: (from: SheetArrangement, keep: boolean) => void
  toolbar: ReactNode
  /** Pages before the card pages in the file (full pages printed first). */
  pagesBefore: number
  /** Pages in the file besides the card pages. */
  otherPages: number
}

export function ArrangeStep({ contents, arrangement, cards, options, onChange, onPreview, onPickEnd, toolbar, pagesBefore, otherPages }: ArrangeStepProps) {
  const { heights, measure } = useCardHeights(cards, options)
  const layout = layoutCards(cards, contents, options, heights, (c) => sheetRefKey(c.card.ref))
  const box = pageBox(options.paper, options.columns)
  const { board, scale } = useFitScale(box.height)
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ key: string; from: SheetArrangement } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ index: number; side: 'before' | 'after' } | null>(null)
  const [announce, setAnnounce] = useState('')
  const indexOf = (key: string) => cards.findIndex((c) => sheetRefKey(c.card.ref) === key)
  const selectedIndex = selected ? indexOf(selected) : -1

  // Focus follows a card moved by keyboard or menu: its handle is drawn anew in its new place.
  const [follow, setFollow] = useState<string | null>(null)
  useEffect(() => {
    if (!follow) return
    document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(follow)}"]`)?.focus()
    setFollow(null)
  }, [follow, arrangement])

  /** Announces where a card ended up, once the pages have reflowed. */
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!said) return
    const i = indexOf(said)
    if (i >= 0) setAnnounce(placeText(cards[i]!.card.name, layout, i))
    setSaid(null)
    // Reads the layout after the move has rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [said, arrangement])

  const move = (from: number, to: number, key: string) => {
    if (from === to) return
    onChange((a) => moveCard(a, from, to))
    setFollow(key)
    setSaid(key)
  }

  const onHandleKey = (index: number, key: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const name = cards[index]!.card.name
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (picked) {
        onPickEnd(picked.from, true)
        setPicked(null)
        setAnnounce(`${placeText(name, layout, index)} Dropped.`)
      } else {
        setPicked({ key, from: arrangement })
        setSelected(key)
        setAnnounce(`${name} picked up. Use the arrow keys to move it, Space to drop it, Escape to cancel.`)
      }
      return
    }
    if (!picked || picked.key !== key) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onPickEnd(picked.from, false)
      setPicked(null)
      setFollow(key)
      setAnnounce(`${name}: move cancelled.`)
      return
    }
    const to =
      e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : e.key === 'ArrowRight' ? columnMoveTarget(layout, index, 1, cards.length) : e.key === 'ArrowLeft' ? columnMoveTarget(layout, index, -1, cards.length) : null
    if (to === null) return
    e.preventDefault()
    if (to < 0 || to >= cards.length || to === index) return
    onPreview(moveCard(arrangement, index, to))
    setFollow(key)
    setSaid(key)
  }

  const onDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    if (dragging === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const side = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
    if (drop?.index !== index || drop.side !== side) setDrop({ index, side })
  }
  const onDrop = () => {
    if (dragging !== null && drop) {
      const flat = drop.side === 'after' ? drop.index + 1 : drop.index
      const key = sheetRefKey(cards[dragging]!.card.ref)
      move(dragging, flat > dragging ? flat - 1 : flat, key)
    }
    setDragging(null)
    setDrop(null)
  }

  const pageCount = layout.pages.length
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const [previewing, setPreviewing] = useState(false)
  const renderCard = (c: ArrangedCard, index: number, continued: boolean, compact: boolean) => {
    const key = sheetRefKey(c.card.ref)
    return (
      <ArrangeCard
        item={c}
        index={index}
        count={cards.length}
        continued={continued}
        tooTall={layout.tooTall.has(index)}
        writeIns={options.writeIns}
        selected={selected === key}
        picked={picked?.key === key}
        drop={drop?.index === index ? drop.side : null}
        compact={compact}
        onSelect={() => setSelected(selected === key ? null : key)}
        onHandleKey={onHandleKey(index, key)}
        onHandleBlur={(e) => {
          // Focus going elsewhere (Undo, Sort, a click away) drops a picked-up card where it is.
          // The handle itself is drawn anew as the card moves, which isn't leaving.
          const next = e.relatedTarget as HTMLElement | null
          if (!picked || picked.key !== key || !next || next.dataset.handle === key) return
          onPickEnd(picked.from, true)
          setPicked(null)
        }}
        onMove={(to) => move(index, to, key)}
        onBreak={(kind) => onChange((a) => setBreak(a, index, kind))}
        onOut={() => {
          onChange((a) => leaveOut(a, c.card.ref))
          setAnnounce(`${c.card.name} left out.`)
        }}
        onDragStart={() => setDragging(index)}
        onDragOver={onDragOver(index)}
        onDrop={onDrop}
        onDragEnd={() => {
          setDragging(null)
          setDrop(null)
        }}
      />
    )
  }
  const pageLabel = (p: number) => `Page ${pagesBefore + p + 1} of ${otherPages + pageCount}`
  return (
    <div className="ref-arrange">
      <div className="ref-arrange__toolbar" role="toolbar" aria-label="Arrange">
        {toolbar}
        <span className="muted">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'} on {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
        <span className="ref-arrange__grow" />
        {phone ? (
          <button type="button" className="button button--small" onClick={() => setPreviewing(true)}>
            Preview
          </button>
        ) : selectedIndex > 0 ? (
          <>
            <button type="button" className="button button--small" onClick={() => onChange((a) => setBreak(a, selectedIndex, 'column'))}>
              + Column break
            </button>
            <button type="button" className="button button--small" onClick={() => onChange((a) => setBreak(a, selectedIndex, 'page'))}>
              + Page break
            </button>
          </>
        ) : (
          <span className="muted">Select a card (after the first) for + Column break and + Page break.</span>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {phone ? (
        <div className="ref-arrange-list">
          {layout.pages.flatMap((page, p) =>
            page.columns.map((column, c) => {
              const firsts = column.filter((x) => !x.continued)
              if (!firsts.length) return null
              return (
                <section key={`${p}:${c}`} aria-label={`Page ${pagesBefore + p + 1}, column ${c + 1}`}>
                  <h3 className="ref-label">
                    Page {pagesBefore + p + 1} · Column {c + 1}
                  </h3>
                  {firsts.map((x) => (
                    <div key={x.index}>{renderCard(cards[x.index]!, x.index, false, true)}</div>
                  ))}
                </section>
              )
            }),
          )}
        </div>
      ) : (
        <div className="ref-arrange__board" ref={board}>
          {layout.pages.map((_, p) => (
            <figure key={p} className="ref-arrange__page" style={{ width: box.width * scale }}>
              <div
                className="ref-arrange__paper"
                role="group"
                aria-label={`Page ${pagesBefore + p + 1} of ${otherPages + pageCount}, ${options.columns} columns, ${layout.pages[p]!.columns.reduce((n, c) => n + c.filter((x) => !x.continued).length, 0)} cards`}
                style={{ width: box.width * scale, height: box.height * scale }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                  <CardPage layout={layout} page={p} cards={cards} contents={contents} options={options} renderCard={(c, index, continued) => renderCard(c, index, continued, false)} />
                </div>
              </div>
              <figcaption className="muted">{pageLabel(p)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {previewing && <PagesPreview layout={layout} cards={cards} contents={contents} options={options} label={pageLabel} onClose={() => setPreviewing(false)} />}
      {measure}
    </div>
  )
}

/** The card pages full screen, one after another, swiping between them (a phone's Preview). */
export function PagesPreview({ layout, cards, contents, options, label, onClose }: { layout: Layout; cards: readonly ArrangedCard[]; contents: SheetContents; options: SheetOptions; label: (page: number) => string; onClose: () => void }) {
  const box = pageBox(options.paper, options.columns)
  // Fits the screen's width, less the dialog's padding.
  const width = Math.min(box.width, (typeof window === 'undefined' ? box.width : window.innerWidth) - 48)
  const scale = width / box.width
  return (
    <Modal title="Preview" onClose={onClose} wide className="modal--reference-preview">
      <div className="ref-preview-pages">
        {layout.pages.map((_, p) => (
          <figure key={p} className="ref-preview-pages__page">
            <div className="ref-arrange__paper" role="img" aria-label={`${label(p)}, ${options.columns} columns`} style={{ width: box.width * scale, height: box.height * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} aria-hidden="true">
                <CardPage layout={layout} page={p} cards={cards} contents={contents} options={options} />
              </div>
            </div>
            <figcaption className="muted">{label(p)}</figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  )
}
