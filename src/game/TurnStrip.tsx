/**
 * The turn order's chips (scrpg-aid-designs/character-colors/spec.md, section 4): each actor's colors in
 * a ring for its side, with a check and a grey ring once acted, a divider after the acted, and a
 * chevron over whoever is acting. The same on the table and, at room scale, on the display view.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { fillStyle } from '../colors/palette'
import { actorColors, SIDE_WORD, sideToken } from './colors'
import type { ActorRef } from './model'
import type { TableView } from './project'
import { actorKey, turnStrip } from './table'
import { stripScrollLeft } from './turn-scroll'

/** The check on a fill: the ink over a wider copy in the outline, since `text-shadow` doesn't reach SVG. */
function ActedCheck() {
  const path = 'm5 12 5 5 9-10'
  return (
    <svg className="turn-chip__check" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} stroke="var(--char-line)" strokeWidth="6" />
      <path d={path} stroke="var(--char-text)" strokeWidth="3" />
    </svg>
  )
}

/** The chevron's height and its 6 px gap above the ring. */
const CHEVRON_ROOM = 18

const SIDE_CLASS = { gm: 'char-chip--gm', heroes: 'char-chip--heroes', environment: 'char-chip--environment' } as const

export function TurnStrip({ game, name, room = false }: { game: TableView; name: (ref: ActorRef) => string; /** At room scale, for the display view. */ room?: boolean }) {
  const strip = turnStrip(game)
  const list = useRef<HTMLOListElement>(null)
  const current = strip.find((s) => s.state === 'current')
  const currentKey = current ? actorKey(current.ref) : undefined
  const [chevronAt, setChevronAt] = useState<{ x: number; y: number } | null>(null)
  // The chevron slides to whoever is acting: one element, moved over the chip, on whichever row it wrapped to.
  useLayoutEffect(() => {
    const acting = () => (currentKey ? list.current?.querySelector<HTMLElement>(`[data-actor="${CSS.escape(currentKey)}"]`) : undefined)
    const place = () => {
      const chip = acting()
      setChevronAt(chip ? { x: chip.offsetLeft + chip.offsetWidth / 2, y: chip.offsetTop - CHEVRON_ROOM } : null)
    }
    place()
    // A strip that scrolls sideways (phones) brings whoever is acting into view, just right of the divider.
    const el = list.current
    const chip = acting()
    if (el && chip && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = stripScrollLeft({ dividerLeft: el.querySelector<HTMLElement>('.turn-strip__divider')?.offsetLeft, chipLeft: chip.offsetLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
    }
    if (!list.current || typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver(place)
    watching.observe(list.current)
    return () => watching.disconnect()
  }, [currentKey, strip.length, game.turn.acted.length])
  const lastActed = strip.reduce((at, s, i) => (s.state === 'acted' ? i : at), -1)
  const showDivider = lastActed >= 0 && lastActed < strip.length - 1
  return (
    <ol ref={list} className={room ? 'turn-strip turn-strip--room' : 'turn-strip'} aria-label="Turn order this round">
      {chevronAt !== null && (
        <li className="turn-strip__chevron" aria-hidden="true" style={{ transform: `translate(${chevronAt.x}px, ${chevronAt.y}px)` }}>
          <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="var(--ui-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 2 8 8 8-8" />
          </svg>
        </li>
      )}
      {strip.map(({ ref, state }, i) => {
        const colors = actorColors(game, ref)
        const key = actorKey(ref)
        const ring = { '--char-side': state === 'acted' ? 'var(--ui-muted)' : sideToken(colors.side) } as CSSProperties
        return [
          <li key={key} className="turn-strip__item" data-actor={key}>
            <span className={`char-chip ${SIDE_CLASS[colors.side]}`} style={ring}>
              <span className="char-chip__fill char-fill" style={fillStyle(colors.appearance)}>
                {state === 'acted' && <ActedCheck />}
                {name(ref)}
              </span>
            </span>
            <span className="visually-hidden">
              , {SIDE_WORD[colors.side]}
              {state === 'acted' ? ', has acted' : state === 'current' ? ', acting now' : ''}
            </span>
          </li>,
          showDivider && i === lastActed && <li key="divider" className="turn-strip__divider" aria-hidden="true" />,
        ]
      })}
    </ol>
  )
}

/** One character's chip in its colors, with its side's ring: for the display view's end card. */
export function ActorChip({ game, actor, name }: { game: TableView; actor: ActorRef; name: string }) {
  const colors = actorColors(game, actor)
  return (
    <span className={`char-chip ${SIDE_CLASS[colors.side]}`} style={{ '--char-side': sideToken(colors.side) } as CSSProperties}>
      <span className="char-chip__fill char-fill" style={fillStyle(colors.appearance)}>
        {name}
      </span>
    </span>
  )
}
