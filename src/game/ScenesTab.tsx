/**
 * The Scenes tab of the GM screen (docs/design/scenes/spec.md, section 3): every scene in order,
 * then + Plan a scene, then what's set aside. Planned scenes reorder by drag, or from the handle
 * with the keyboard (Space to pick up, arrows to move, Space to drop); phones use Move up and
 * Move down in each row's ⋯.
 */
import { Fragment, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { MenuItem } from '../library/Popover'
import { betweenIssues, currentIssue, sceneName, sceneNumber, trackerFromCounts, type Game, type OppositionRef, type Scene } from './model'
import { asideChips, plannedForText, refKey, sceneChips, sceneDetail, trackerLine, type AsideChip } from './scenes'
import { MenuButton } from './TableCenter'

export interface SceneActions {
  edit: (sceneId: string) => void
  /** The start dialog, for the next planned scene. */
  start: (sceneId: string) => void
  plan: () => void
  /** Moves a planned scene to a place in the list. */
  move: (sceneId: string, toIndex: number) => void
  duplicate: (sceneId: string) => void
  remove: (sceneId: string) => void
  /** A done scene's summary and notes. */
  record: (sceneId: string) => void
  addAside: (ref: OppositionRef, sceneId: string) => void
  removeAside: (chip: AsideChip) => void
  /** The Finish dialog, for the current issue. */
  finish?: () => void
}

/** A tracker's boxes, small; `at` marks the current box (none for a planned scene). */
export function TrackerBoxes({ tracker, at, large = false }: { tracker: Scene['tracker']; at?: number; large?: boolean }) {
  return (
    <span className="gt-tracker gt-tracker--inline" aria-hidden="true">
      {trackerFromCounts(tracker).map((z, i) => (
        <span key={i} className={`gt-box${large ? '' : ' gt-box--small'} zone-${z}${at !== undefined && i < at ? ' gt-box--past' : ''}${i === at ? ' gt-box--now' : ''}`} />
      ))}
    </span>
  )
}

const PILL: Record<Scene['state'], string> = { done: 'Done', now: 'Now', planned: 'Next' }

interface RowProps {
  game: Game
  scene: Scene
  next: boolean
  actions: SceneActions
  sheets: boolean
  lifted: boolean
  onHandleKey: (e: KeyboardEvent) => void
  onDragStart: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

function SceneRow({ game, scene, next, actions, sheets, lifted, onHandleKey, onDragStart, onDrop, onDragEnd }: RowProps) {
  const number = sceneNumber(game, scene.id)
  const index = number - 1
  const name = sceneName(scene)
  const chips = sceneChips(game, scene)
  const planned = scene.state === 'planned'
  const first = game.scenes.findIndex((s) => s.state === 'planned')
  const more: MenuItem[] = [
    ...(sheets && index > first ? [{ label: 'Move up', onSelect: () => actions.move(scene.id, index - 1) }] : []),
    ...(sheets && index < game.scenes.length - 1 ? [{ label: 'Move down', onSelect: () => actions.move(scene.id, index + 1) }] : []),
    { label: 'Duplicate', onSelect: () => actions.duplicate(scene.id) },
    { label: 'Delete…', danger: true, onSelect: () => actions.remove(scene.id) },
  ]
  return (
    <article
      className={`gt-scene-row gt-scene-row--${scene.state}${lifted ? ' gt-scene-row--lifted' : ''}`}
      aria-label={`Scene ${number}: ${name}`}
      {...(planned && !sheets ? { onDragOver: (e: DragEvent) => e.preventDefault(), onDrop } : {})}
    >
      <div className="gt-row">
        {planned && !sheets && (
          <button type="button" className="gt-scene-handle" draggable aria-label={`Move ${name}`} aria-pressed={lifted} onKeyDown={onHandleKey} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            ⠿
          </button>
        )}
        <span className="gt-scene-row__number">{number}</span>
        <span className="gt-grow gt-scene-row__name">{name}</span>
        {(!planned || next) && <span className={`gt-pill gt-scene-pill--${scene.state}`}>{PILL[scene.state]}</span>}
      </div>
      <div className="gt-row">
        <TrackerBoxes tracker={scene.tracker} {...(planned ? {} : { at: scene.position })} />
        <span className="gt-sub">{trackerLine(scene)}</span>
      </div>
      <div className="gt-sub">{sceneDetail(game, scene)}</div>
      {chips.length > 0 && (
        <ul className="gt-scene-chips" aria-label="Opposition">
          {chips.map((c) => (
            <li key={c.key} className={c.hidden ? 'gt-scene-chip gt-scene-chip--hidden' : 'gt-scene-chip'}>
              {c.text}
              {c.hidden && <span className="visually-hidden"> (hidden)</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="gt-row">
        {scene.state === 'done' ? (
          <button type="button" className="button button--quiet button--small" aria-label={`Edit the summary of ${name}`} onClick={() => actions.record(scene.id)}>
            Edit summary
          </button>
        ) : (
          <button type="button" className="button button--small" aria-label={`Edit ${name}`} onClick={() => actions.edit(scene.id)}>
            Edit
          </button>
        )}
        {next && !betweenIssues(game) && (
          <button type="button" className="button button--primary button--small" aria-label={`Start ${name}`} onClick={() => actions.start(scene.id)}>
            Start this scene…
          </button>
        )}
        {planned && (
          <>
            <span className="gt-grow" />
            <MenuButton label={`More for ${name}`} items={more} sheets={sheets} />
          </>
        )}
      </div>
    </article>
  )
}

function AsideItem({ game, chip, actions, sheets }: { game: Game; chip: AsideChip; actions: SceneActions; sheets: boolean }) {
  const items: MenuItem[] = [
    ...game.scenes
      .filter((s) => s.state === 'planned' && !chip.plannedFor.includes(sceneNumber(game, s.id)))
      .map((s) => ({ label: `Add to scene ${sceneNumber(game, s.id)}: ${sceneName(s)}`, onSelect: () => actions.addAside(chip.ref, s.id) })),
    { label: 'Add to the current scene', onSelect: () => actions.addAside(chip.ref, game.currentSceneId) },
    { label: 'Remove from the game…', danger: true, onSelect: () => actions.removeAside(chip) },
  ]
  const planned = plannedForText(chip.plannedFor)
  return (
    <li className="gt-scene-chip gt-scene-chip--aside">
      <span>
        {chip.text}
        {planned && <span className="gt-sub"> · {planned}</span>}
      </span>
      <MenuButton label={`Actions for ${chip.name}`} items={items} sheets={sheets} />
    </li>
  )
}

export function ScenesTab({ game, actions, sheets = false }: { game: Game; actions: SceneActions; sheets?: boolean }) {
  const next = game.scenes.find((s) => s.state === 'planned')
  const aside = asideChips(game)
  const issue = currentIssue(game)
  const [lifted, setLifted] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const handleKey = (scene: Scene) => (e: KeyboardEvent) => {
    const name = sceneName(scene)
    const index = sceneNumber(game, scene.id) - 1
    if (e.key === ' ') {
      e.preventDefault()
      const up = lifted === scene.id
      setLifted(up ? null : scene.id)
      setAnnounce(up ? `${name} dropped at scene ${index + 1}.` : `${name} picked up. Use the arrow keys to move it, Space to drop it.`)
    } else if (lifted === scene.id && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const to = index + (e.key === 'ArrowUp' ? -1 : 1)
      if (game.scenes[to]?.state === 'planned') {
        actions.move(scene.id, to)
        setAnnounce(`${name} moved to scene ${to + 1}.`)
      }
    }
  }
  return (
    <div className="gt-tab gt-scenes">
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {game.scenes.map((s, i) => (
        <Fragment key={s.id}>
        <SceneRow
          game={game}
          scene={s}
          next={s.id === next?.id}
          actions={actions}
          sheets={sheets}
          lifted={lifted === s.id}
          onHandleKey={handleKey(s)}
          onDragStart={(e) => {
            setDragging(s.id)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', s.id)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragging) actions.move(dragging, i)
            setDragging(null)
          }}
          onDragEnd={() => setDragging(null)}
        />
        {s.state === 'now' && issue && actions.finish && (
          <button type="button" className="button" onClick={actions.finish}>
            Finish issue {issue.number}…
          </button>
        )}
        </Fragment>
      ))}
      <button type="button" className="button" onClick={actions.plan}>
        + Plan a scene
      </button>
      {aside.length > 0 && (
        <section className="gt-aside" aria-labelledby="gt-aside">
          <div className="gt-row">
            <span id="gt-aside" className="gt-label">
              Set aside
            </span>
            <span className="gt-sub">· kept with their damage, for a later scene</span>
          </div>
          <ul className="gt-scene-chips">
            {aside.map((c) => (
              <AsideItem key={refKey(c.ref)} game={game} chip={c} actions={actions} sheets={sheets} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
