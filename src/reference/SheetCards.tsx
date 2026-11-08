/**
 * A reference sheet's cards and scene block, as they print (scrpg-aid-designs/reference-sheets/spec.md,
 * sections 5 and 6). Arrange's preview draws the same components. Nothing here is interactive:
 * no buttons or links, only text, dice and action icons.
 */
import { fillCss } from '../colors/palette'
import { ActionIcon, AbilityText, DieIcon } from '../components/icons'
import { aspectName } from '../game/environment'
import { ACTION_NAME, actionsText, groupActionList } from '../game/npc'
import type { Zone } from '../rules/types'
import { countsText } from '../rules/trackers'
import { hiddenText, membersText } from './sheet'
import { CARD_TYPE_NAME, type CardTwist, type ChallengeCard, type EnvironmentCard, type NpcCard, type ScenePage, type SheetCard } from './model'

const ZONE_LETTER: Record<Zone, string> = { green: 'G', yellow: 'Y', red: 'R' }
const ZONE_NAME: Record<Zone, string> = {
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
}
const ABILITY_TYPE: Record<'A' | 'R' | 'I', string> = {
  A: 'Action',
  R: 'Reaction',
  I: 'Inherent',
}

/** A tick box to mark at the table, checked when it's already done. */
function Box({ checked = false }: { checked?: boolean }) {
  return <span className={checked ? 'ref-box ref-box--checked' : 'ref-box'} aria-hidden="true" />
}

/** A zone's letter on its game color, so it reads in grayscale. */
export function ZoneLetter({ zone }: { zone: Zone }) {
  return (
    <span className={`ref-zone zone-${zone}`} role="img" aria-label={ZONE_NAME[zone]}>
      {ZONE_LETTER[zone]}
    </span>
  )
}

function Actions({ card }: { card: NpcCard }) {
  if (card.actions === 'any') return <p>{actionsText(card)}</p>
  const list = groupActionList(card)
  return (
    <p className="ref-card__actions" aria-label={actionsText(card)}>
      {list.map((a, i) => (
        <span key={a} aria-hidden="true">
          {i > 0 && (i === list.length - 1 ? ' or ' : ', ')}
          <span className="effect-word">
            <ActionIcon action={a} decorative />
            {ACTION_NAME[a]}
          </span>
        </span>
      ))}
    </p>
  )
}

function NpcBody({ card, writeIns }: { card: NpcCard; writeIns: boolean }) {
  const count = card.members.length
  return (
    <>
      <Actions card={card} />
      {card.abilities.map((a, i) => (
        <div key={i} className="ref-card__ability">
          <strong>{a.name.trim() || `Ability ${i + 1}`}</strong> <span className="ref-pill">{ABILITY_TYPE[a.type]}</span>
          <div>
            {/* As the table's group card shows it. */}
            <AbilityText text={a.text} />
          </div>
        </div>
      ))}
      {card.notes.trim() && <p className="ref-muted ref-card__text">{card.notes}</p>}
      {writeIns && count > 0 && (
        <div className="ref-card__members">
          <span className="ref-label">{membersText(card)}</span>
          {card.members.map((m, i) => (
            <span key={i} className={m.out ? 'ref-diebox ref-diebox--out' : 'ref-diebox'} role="img" aria-label={m.out ? `Member ${i + 1}, out` : `Member ${i + 1}, ${m.die}`}>
              {m.out ? <span className="ref-diebox__x">×</span> : null}
              <span className="ref-diebox__die">{m.die}</span>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function ChallengeBody({ card, writeIns }: { card: ChallengeCard; writeIns: boolean }) {
  return (
    <>
      {card.description.trim() && <p className="ref-card__text">{card.description}</p>}
      <ul className="ref-card__steps">
        {card.steps.map((s, i) => (
          <li key={i}>
            {writeIns || s.done ? <Box checked={s.done} /> : null}
            {s.label.trim() || `Step ${i + 1}`}
            {s.done && <span className="visually-hidden"> (done)</span>}
          </li>
        ))}
      </ul>
      {card.whenDone.trim() && (
        <p className="ref-card__text">
          <span className="ref-label">When it's done</span>
          <br />
          {card.whenDone}
        </p>
      )}
    </>
  )
}

function Twist({ twist, writeIns }: { twist: CardTwist; writeIns: boolean }) {
  return (
    <li className="ref-twist">
      {writeIns || twist.used ? <Box checked={twist.used} /> : null}
      <ZoneLetter zone={twist.zone} />
      <span className="ref-pill">{twist.kind === 'major' ? 'Major' : 'Minor'}</span>
      <span>
        {twist.name && <strong>{twist.name}: </strong>}
        {twist.text}
        {twist.used && <span className="visually-hidden"> (used)</span>}
      </span>
    </li>
  )
}

function EnvironmentBody({ card, writeIns }: { card: EnvironmentCard; writeIns: boolean }) {
  return (
    <>
      {card.description.trim() && <p className="ref-card__text">{card.description}</p>}
      {card.aspects.length > 0 && (
        <>
          <h3 className="ref-label">Aspects</h3>
          <ul className="ref-card__aspects">
            {card.aspects.map((a, i) => (
              <li key={i}>
                <span>{aspectName(a, i)}</span>
                <DieIcon die={a.die} size="compact" />
              </li>
            ))}
          </ul>
        </>
      )}
      {card.twists.length > 0 && (
        <>
          <h3 className="ref-label">Twists</h3>
          <ul className="ref-card__twists">
            {card.twists.map((t, i) => (
              <Twist key={i} twist={t} writeIns={writeIns} />
            ))}
          </ul>
        </>
      )}
      {card.brings.length > 0 && <p className="ref-muted">Brings: {card.brings.join(', ')}</p>}
    </>
  )
}

/** One card: a band in the item's color, the type in small caps, the name, then what its type shows. */
export function SheetCardView({ card, writeIns, continued = false }: { card: SheetCard; writeIns: boolean; continued?: boolean }) {
  const type = CARD_TYPE_NAME[card.type].toUpperCase()
  const npc = card.type === 'minion' || card.type === 'lieutenant'
  return (
    <section className="ref-card" aria-label={continued ? `${card.name}, continued` : card.name}>
      <span className="ref-card__band" style={{ background: fillCss(card.appearance) }} aria-hidden="true" />
      <p className="ref-card__type">
        {type}
        {card.from && ` · FROM ${card.from.toUpperCase()}`}
      </p>
      <div className="ref-card__head">
        <h2 className="ref-card__name">{continued ? `${card.name}, continued` : card.name}</h2>
        {/* The starting die, large enough to read across the table. */}
        {npc && card.die && <DieIcon die={card.die} size="large" />}
      </div>
      {card.hidden && <p className="ref-muted">{hiddenText(card.hidden)}</p>}
      {card.type === 'environment' ? <EnvironmentBody card={card} writeIns={writeIns} /> : card.type === 'challenge' ? <ChallengeBody card={card} writeIns={writeIns} /> : <NpcBody card={card} writeIns={writeIns} />}
    </section>
  )
}

/** The scene block at the top of a scene export's first page: names, the tracker and the notes. */
export function SceneBlock({ scene, notes }: { scene: ScenePage; notes: boolean }) {
  const { tracker } = scene
  return (
    <header className="ref-scene">
      <p className="ref-muted">
        {scene.gameName} · {scene.where}
      </p>
      <h1 className="ref-scene__name">{scene.name}</h1>
      <div className="ref-scene__tracker">
        <ol className="ref-tracker" aria-label={`Scene tracker: ${tracker.name}, ${countsText(tracker.counts)}${tracker.now ? `, now ${tracker.now}` : ''}`}>
          {tracker.zones.map((z, i) => (
            <li key={i} className={i < tracker.filled ? `ref-tracker__box zone-${z} ref-tracker__box--filled` : `ref-tracker__box ref-tracker__box--${z}`} aria-hidden="true">
              {ZONE_LETTER[z]}
            </li>
          ))}
        </ol>
        <p className="ref-muted">
          {tracker.name} · {countsText(tracker.counts)}
          {tracker.now && <strong> · Now: {tracker.now}</strong>}
        </p>
      </div>
      {notes && scene.notes.trim() && (
        <div className="ref-scene__notes">
          <h2 className="ref-label">Scene notes</h2>
          <p className="ref-card__text">{scene.notes}</p>
        </div>
      )}
    </header>
  )
}
