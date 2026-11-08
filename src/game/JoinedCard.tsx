/**
 * A game joined as a player, on the Games page (scrpg-aid-designs/game-table/spec.md, section 3, "A
 * joined game"): from this device's cache, so it shows what the player last saw. Hidden things
 * never appear, since players never receive them.
 */
import { useEffect, useId, useState } from 'react'
import { useStore } from '../app/store-context'
import { issueToPrompt } from './issues'
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, type Hero } from '../hero/model'
import { formatFull } from '../play/time'
import { currentHealth, effectiveZone, heroPointCount, heroPointsLeft } from '../play/state'
import type { JoinedGame } from './joined-store'
import { betweenIssues, gameDisplayName, sceneDisplayName } from './model'
import { finishedPill, viewSceneLine } from './summary'
import { heroPlayInScene } from './table'
import { MenuButton, ZoneChip } from './TableCenter'

/** "Oct 28, 9:42 PM". */
const asOf = (at: string) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function JoinedCard({ joined, live, onOpen, onRemove }: { joined: JoinedGame; live: boolean; onOpen: () => void; onRemove: () => void }) {
  const id = useId()
  const view = joined.table
  const name = gameDisplayName(view)
  const mine = view.heroes.find((h) => h.id === joined.heroId)
  const sheet = mine && buildSheet(mine.sheet)
  const play = mine && heroPlayInScene({ scene: view.scene }, mine.play)
  const zone = sheet && play ? effectiveZone(sheet, play) : undefined
  const health = sheet && play ? currentHealth(sheet, play) : undefined
  const others = view.heroes.filter((h) => h.id !== joined.heroId)
  const pointsLeft = betweenIssues(view) && mine ? heroPointsLeft(view.heroPoints, mine.play) : 0
  // "Back issue to add": from the library hero, which says what's been added.
  const heroStore = useStore()
  const [library, setLibrary] = useState<Hero | undefined>()
  useEffect(() => {
    let live = true
    heroStore.get(joined.heroSourceId).then(
      (r) => live && r.status === 'found' && setLibrary(r.hero),
      () => {},
    )
    return () => {
      live = false
    }
  }, [heroStore, joined.heroSourceId])
  const toAdd = library && issueToPrompt(view.issues, joined.heroSourceId, library, joined.issuePrompts ?? {})
  return (
    <article className="card games-card" aria-labelledby={`${id}-name`}>
      <div className="gt-row">
        <h3 id={`${id}-name`} className="gt-grow games-card__name">
          {name}
        </h3>
        {live ? (
          <span className="gt-pill gt-pill--live">
            <span className="gt-live-dot" aria-hidden="true" />
            Live
          </span>
        ) : (
          <span className="gt-pill">GM offline</span>
        )}
        {betweenIssues(view) && <span className="gt-pill">{finishedPill(view.issues)}</span>}
      </div>
      <p className="gt-sub">
        GM: {joined.gm} · you play {mine ? heroDisplayName(mine.sheet) : 'a hero who has left'}
      </p>
      {(toAdd || pointsLeft > 0) && (
        // What's waiting for this player (scrpg-aid-designs/issues/games-cards.dc.html).
        <ul className="games-todos" aria-label="To do">
          {toAdd && <li className="games-todo">Back issue to add</li>}
          {pointsLeft > 0 && <li className="games-todo">{heroPointCount(pointsLeft)} to spend</li>}
        </ul>
      )}
      {mine && (
        <div className="gt-row">
          {zone && <ZoneChip zone={zone} />}
          {health !== undefined && (
            <span className="gt-hp">
              {health}
              {sheet?.maxHealth !== undefined && <small> / {sheet.maxHealth}</small>}
            </span>
          )}
        </div>
      )}
      <div className="gt-row">
        <strong>{sceneDisplayName(view)}</strong>
        <span className="gt-sub">· {viewSceneLine(view)}</span>
      </div>
      {others.length > 0 && (
        <div>
          <div className="gt-label">Heroes</div>
          <ul className="games-card__who">
            {others.map((h) => (
              <li key={h.id} className="games-who">
                {heroDisplayName(h.sheet)} {h.player && <span className="gt-sub">{h.player.name}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="games-card__foot">
        <span className="gt-sub gt-grow">
          {!live && (
            <time dateTime={joined.updatedAt} title={formatFull(joined.updatedAt)}>
              As of {asOf(joined.updatedAt)}
            </time>
          )}
        </span>
        <button type="button" className="button button--primary button--small" aria-label={`Open ${name}`} onClick={onOpen}>
          Open
        </button>
        <MenuButton label={`More actions for ${name}`} sheets={false} items={[{ label: 'Leave and remove from this device…', danger: true, onSelect: onRemove }]} />
      </div>
    </article>
  )
}
