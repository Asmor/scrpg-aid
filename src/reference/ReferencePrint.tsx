/**
 * The reference sheet as it prints (scrpg-aid-designs/reference-sheets/spec.md, section 7): full
 * pages render their own sheets, each starting a new page; the cards flow through CSS columns.
 * It's mounted into <body> only for the print, while the app itself is hidden (../index.css).
 *
 * Each item's footer names it: every item gets a named page whose @page rule (see printRules)
 * puts its name in the bottom left. A different page name also forces the page break before it.
 * "Page N of M" is the base @page rule's, counted across the whole file.
 */
import { createPortal } from 'react-dom'
import { HeroSheetTitle, HeroSheetView } from '../components/HeroSheetView'
import { VillainSheetTitle, VillainSheetView } from '../villain/VillainSheetView'
import { sheetRefKey, type PageItem, type SheetArrangement, type SheetContents, type SheetOptions } from './model'
import { arranged, followingLine, pageRuns, type ArrangedCard } from './sheet'
import { SceneBlock, SheetCardView } from './SheetCards'

function FullPage({ item, index }: { item: PageItem; index: number }) {
  return (
    <section className="ref-print__full" style={{ page: `ref-page-${index}` }}>
      {item.kind === 'hero' ? (
        <>
          <HeroSheetTitle hero={item.hero} banded />
          <HeroSheetView hero={item.hero} interactive={false} />
        </>
      ) : (
        <>
          <VillainSheetTitle villain={item.villain} banded />
          <VillainSheetView villain={item.villain} />
        </>
      )}
    </section>
  )
}

/** The cards in columns: page breaks start a new block, column breaks are `break-before: column`. */
export function CardColumns({ cards, columns, writeIns }: { cards: readonly ArrangedCard[]; columns: SheetOptions['columns']; writeIns: boolean }) {
  return (
    <>
      {pageRuns(cards).map((run, i) => (
        <div key={i} className={`ref-columns ref-columns--${columns}${i > 0 ? ' ref-columns--new-page' : ''}`}>
          {run.map(({ card, breakBefore }) => (
            // Firefox ignores column breaks in multi-column print; Chrome honors them.
            <div key={sheetRefKey(card.ref)} className={breakBefore === 'column' ? 'ref-print__card ref-print__card--column' : 'ref-print__card'}>
              <SheetCardView card={card} writeIns={writeIns} />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

export function ReferencePrint({ contents, arrangement, options }: { contents: SheetContents; arrangement: SheetArrangement; options: SheetOptions }) {
  const { pages, cards } = arranged(contents, arrangement)
  const scene = contents.scene
  const hasCards = cards.length > 0 || Boolean(scene)
  const cardBlock = hasCards && (
    <section className="ref-print__cards" style={{ page: 'ref-cards' }}>
      {scene ? <SceneBlock scene={scene} notes={options.includeNotes} /> : <h1 className="ref-print__title">Reference sheet</h1>}
      <CardColumns cards={cards} columns={options.columns} writeIns={options.writeIns} />
      {scene && pages.length > 0 && <p className="ref-muted ref-print__following">{followingLine(pages)}</p>}
    </section>
  )
  const fullPages = pages.map((p, i) => <FullPage key={sheetRefKey(p.ref)} item={p} index={i} />)
  const cardsFirst = Boolean(scene) || options.cardsFirst
  return createPortal(
    <div className={options.writeIns ? 'ref-print' : 'ref-print ref-print--no-write-ins'}>
      {cardsFirst ? cardBlock : null}
      {fullPages}
      {cardsFirst ? null : cardBlock}
    </div>,
    document.body,
  )
}
