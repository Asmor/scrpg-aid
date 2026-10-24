/** Step 1, Background (p. 49–54): choose a background, assign its quality dice, take its principle. */
import { useState } from 'react'
import { expandRefs } from '../rules/catalog'
import { backgrounds, backgroundsById, backgroundStep, principleCategories } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { Background } from '../rules/types'
import { describeOptions } from '../components/format'
import type { RollRecord } from '../rules/rolling'
import type { Hero } from '../hero/model'
import { DiceAssigner } from './DiceAssigner'
import { PrinciplePicker } from './PrinciplePicker'
import { TablePicker } from './TablePicker'

function BackgroundSummary({ bg }: { bg: Background }) {
  const category = principleCategories.find((c) => c.id === bg.principleCategory)?.name ?? bg.principleCategory
  const required = bg.qualities.required ?? []
  return (
    <>
      Qualities {bg.qualities.dice.join(', ')}
      {required.length > 0 && ` (one on ${describeOptions(required)})`}: {describeOptions(bg.qualities.options)}. Principle of {category}. Power source dice{' '}
      {bg.powerSourceDice.join(', ')}. <span className="page-ref">{formatEntryRef(bg)}</span>
    </>
  )
}

export function BackgroundStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  // A roll made before a background is chosen; it's saved with the choice.
  const [pendingRoll, setPendingRoll] = useState<RollRecord | undefined>()
  const choice = hero.background
  const bg = choice ? backgroundsById.get(choice.id) : undefined
  const roll = choice?.roll ?? pendingRoll

  return (
    <div className="step-form">
      <TablePicker
        what="background"
        method={hero.method}
        dice={backgroundStep.startingDice}
        table={backgrounds}
        roll={roll}
        selectedId={choice?.id}
        onRoll={(r) => {
          if (choice) {
            update((h) => {
              h.background!.roll = r
            })
          } else {
            setPendingRoll(r)
          }
        }}
        onSelect={(entry) =>
          update((h) => {
            // Keep earlier choices that may still fit; the checks flag the ones that don't.
            h.background = { qualities: [], ...h.background, id: entry.id, ...(roll ? { roll } : {}) }
          })
        }
        describe={(entry) => <BackgroundSummary bg={entry} />}
      />

      {choice && bg && (
        <>
          <DiceAssigner
            hero={hero}
            legend={`${bg.name} qualities`}
            dice={bg.qualities.dice}
            assignments={choice.qualities}
            options={expandRefs([...(bg.qualities.required ?? []), ...bg.qualities.options])}
            earlier={[]}
            onChange={(qualities) =>
              update((h) => {
                h.background!.qualities = qualities
              })
            }
          />
          {bg.qualities.note && <p className="hint">{bg.qualities.note}</p>}
          <PrinciplePicker
            category={bg.principleCategory}
            choice={choice.principle}
            onChange={(principle) =>
              update((h) => {
                if (principle) h.background!.principle = principle
                else delete h.background!.principle
              })
            }
          />
        </>
      )}
    </div>
  )
}
