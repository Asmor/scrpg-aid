/**
 * The Scenes tab of the GM screen (docs/design/scenes/spec.md, section 3): every scene in order,
 * with its state, tracker, one line of detail and opposition.
 */
import { sceneName, sceneNumber, trackerFromCounts, type Game, type Scene } from './model'
import { sceneChips, sceneDetail, trackerLine } from './scenes'

export interface SceneActions {
  edit: (sceneId: string) => void
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

function SceneRow({ game, scene, next, actions }: { game: Game; scene: Scene; next: boolean; actions: SceneActions }) {
  const number = sceneNumber(game, scene.id)
  const name = sceneName(scene)
  const chips = sceneChips(game, scene)
  return (
    <article className={`gt-scene-row gt-scene-row--${scene.state}`} aria-label={`Scene ${number}: ${name}`}>
      <div className="gt-row">
        <span className="gt-scene-row__number">{number}</span>
        <span className="gt-grow gt-scene-row__name">{name}</span>
        {(scene.state !== 'planned' || next) && <span className={`gt-pill gt-scene-pill--${scene.state}`}>{PILL[scene.state]}</span>}
      </div>
      <div className="gt-row">
        <TrackerBoxes tracker={scene.tracker} {...(scene.state === 'planned' ? {} : { at: scene.position })} />
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
      {scene.state === 'now' && (
        <div className="gt-row">
          <button type="button" className="button button--small" aria-label={`Edit ${name}`} onClick={() => actions.edit(scene.id)}>
            Edit
          </button>
        </div>
      )}
    </article>
  )
}

export function ScenesTab({ game, actions }: { game: Game; actions: SceneActions }) {
  const next = game.scenes.find((s) => s.state === 'planned')
  return (
    <div className="gt-tab gt-scenes">
      {game.scenes.map((s) => (
        <SceneRow key={s.id} game={game} scene={s} next={s.id === next?.id} actions={actions} />
      ))}
    </div>
  )
}
