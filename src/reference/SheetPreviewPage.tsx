/**
 * Card pages drawn at screen scale (scrpg-aid-designs/reference-sheets/spec.md, sections 3, 4 and 7):
 * the same card components the print uses, laid out by ./layout.ts. The print flows them through
 * CSS columns instead; where the two differ, the print wins.
 */
import type { ReactNode } from 'react'
import { pageBox, type Layout } from './layout'
import type { SheetContents, SheetOptions } from './model'
import { layoutCards, type ArrangedCard } from './sheet'
import { SceneBlock, SheetCardView } from './SheetCards'

/** One card page at print size (scale it with CSS): its columns, and page 1's title or scene block. */
export function CardPage({
  layout,
  page,
  cards,
  contents,
  options,
  renderCard,
}: {
  layout: Layout
  page: number
  cards: readonly ArrangedCard[]
  contents: SheetContents
  options: SheetOptions
  renderCard?: (c: ArrangedCard, index: number, continued: boolean) => ReactNode
}) {
  const box = pageBox(options.paper, options.columns)
  const laid = layout.pages[page]
  return (
    <div className="ref-page" style={{ width: box.width, height: box.height }}>
      {page === 0 && (contents.scene ? <SceneBlock scene={contents.scene} notes={options.includeNotes} /> : <h1 className="ref-print__title">Reference sheet</h1>)}
      <div
        className="ref-page__columns"
        style={{
          gridTemplateColumns: `repeat(${options.columns}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: options.columns }, (_, col) => (
          <div key={col} className="ref-page__column">
            {(laid?.columns[col] ?? []).map((p) => {
              const c = cards[p.index]!
              return <div key={`${p.index}:${p.continued ? 'c' : ''}`}>{renderCard ? renderCard(c, p.index, Boolean(p.continued)) : <SheetCardView card={c.card} writeIns={options.writeIns} continued={Boolean(p.continued)} />}</div>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Step 1's small live preview: the first card page, scaled down. */
export function FirstPagePreview({ contents, cards, options }: { contents: SheetContents; cards: readonly ArrangedCard[]; options: SheetOptions }) {
  const layout = layoutCards(cards, contents, options)
  const box = pageBox(options.paper, options.columns)
  const scale = 200 / box.width
  const count = layout.pages[0]?.columns.reduce((n, c) => n + c.length, 0) ?? 0
  return (
    <div className="ref-thumb" role="img" aria-label={`Preview of the first card page: ${options.columns} columns, ${count} ${count === 1 ? 'card' : 'cards'}`} style={{ width: box.width * scale, height: box.height * scale }}>
      <div className="ref-thumb__inner" style={{ transform: `scale(${scale})` }} aria-hidden="true">
        <CardPage layout={layout} page={0} cards={cards} contents={contents} options={options} />
      </div>
    </div>
  )
}
