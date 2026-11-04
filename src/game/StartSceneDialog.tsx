/**
 * Starting the next scene (docs/design/scenes/spec.md, section 5): what's leaving and what becomes
 * of it, what's coming in, what resets, and a preview of what players will see.
 */
import { useId, useState } from 'react'
import { Modal } from '../components/Modal'
import { nameList } from './names'
import { currentScene, sceneName, sceneNumber, trackerFromCounts, type Game } from './model'
import { defaultChoices, playersWillSee, refKey, startPlan, trackerLine, type Fate, type SceneResets, type StartChoices } from './scenes'
import { TrackerBoxes } from './ScenesTab'
import { boxLabel } from './table'
import { heroDisplayName } from '../hero/model'

const RESETS: { key: keyof SceneResets; name: string; note: string }[] = [
  { key: 'round', name: 'Round and turn order', note: 'Round 0, nobody has acted, reactions ready' },
  { key: 'mods', name: 'Bonuses and penalties', note: 'Cleared from every hero, villain and minion' },
  { key: 'once', name: 'Once-per-scene uses', note: "Each villain's tracker-advancing Overcome (Core Rules p. 154)" },
  { key: 'twists', name: 'Twist use', note: 'All environment twists unmarked' },
]

export function StartSceneDialog({ game, sceneId, onStart, onEdit, onClose }: { game: Game; sceneId: string; onStart: (choices: StartChoices) => void; onEdit: () => void; onClose: () => void }) {
  const id = useId()
  const [plan] = useState(() => startPlan(game, sceneId))
  const [choices, setChoices] = useState<StartChoices>(() => defaultChoices(plan))
  const scene = game.scenes.find((s) => s.id === sceneId)
  if (!scene) return null
  const number = sceneNumber(game, sceneId)
  const previous = currentScene(game)
  const name = sceneName(scene)
  const heroes = game.heroes.map((h) => heroDisplayName(h.sheet))
  const { seen, hidden } = playersWillSee(plan, choices)
  const boxes = trackerFromCounts(scene.tracker)
  const first = { ...scene, position: 0, state: 'planned' as const }
  return (
    <Modal title={`Start scene ${number}: ${name}?`} onClose={onClose} wide>
      <p className="gt-sub">
        Scene {sceneNumber(game, previous.id)}, {sceneName(previous)}, ends {game.round > 0 ? `after round ${game.round}` : 'before round 1'}.
      </p>
      <div className="gt-start">
        <section className="gt-start__section gt-start__section--leaving" aria-labelledby={`${id}-leaving`}>
          <h3 id={`${id}-leaving`}>Leaving the table</h3>
          {plan.leaving.length === 0 && !plan.replaced && <p className="gt-sub">Nothing is leaving.</p>}
          <ul className="gt-start__list">
            {plan.leaving.map((item) => (
              <li key={refKey(item.ref)} className="gt-opp-row">
                <span className="gt-grow">
                  <strong>{item.name}</strong> <span className="gt-sub">{item.kind}</span>
                </span>
                <select aria-label={`What happens to ${item.name}`} value={choices.fates[refKey(item.ref)] ?? item.fate} onChange={(e) => setChoices({ ...choices, fates: { ...choices.fates, [refKey(item.ref)]: e.target.value as Fate } })}>
                  <option value="aside">Set aside</option>
                  <option value="remove">Remove</option>
                  <option value="along">Bring along</option>
                </select>
              </li>
            ))}
            {plan.replaced && (
              <li className="gt-opp-row">
                <span className="gt-grow">
                  <strong>{plan.replaced.name}</strong> <span className="gt-sub">Environment</span>
                </span>
                <span className="gt-sub">Replaced by {plan.replaced.by}</span>
              </li>
            )}
          </ul>
          <p className="gt-sub">Set aside keeps it in this game with its damage, for a later scene. Remove takes it out of the game.</p>
        </section>

        <section className="gt-start__section gt-start__section--coming" aria-labelledby={`${id}-coming`}>
          <h3 id={`${id}-coming`}>Coming in</h3>
          {plan.coming.length === 0 && <p className="gt-sub">Nothing is planned for this scene.</p>}
          <ul className="gt-start__list">
            {plan.coming.map((item) => {
              const key = refKey(item.ref)
              const isHidden = choices.hidden[key] ?? item.hidden
              return (
                <li key={key} className={isHidden ? 'gt-opp-row gt-opp-row--hidden' : 'gt-opp-row'}>
                  <span className="gt-grow">
                    <strong>{item.name}</strong> <span className="gt-sub">{item.kind}{item.fromAside ? ' · from set aside' : ''}</span>
                  </span>
                  <label className="checkbox">
                    <input type="checkbox" aria-label={`${item.name} hidden`} checked={isHidden} onChange={(e) => setChoices({ ...choices, hidden: { ...choices.hidden, [key]: e.target.checked } })} />
                    Hidden
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="gt-sub">As planned. Hidden ones wait for Reveal, as on the table.</p>
        </section>

        <section className="gt-start__section gt-start__section--resets" aria-labelledby={`${id}-resets`}>
          <h3 id={`${id}-resets`}>Reset for the new scene</h3>
          {RESETS.map((r) => (
            <label key={r.key} className="checkbox">
              <input type="checkbox" checked={choices.resets[r.key]} onChange={(e) => setChoices({ ...choices, resets: { ...choices.resets, [r.key]: e.target.checked } })} />
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="gt-sub">{r.note}</span>
              </span>
            </label>
          ))}
          {heroes.length > 0 && <p className="gt-sub">The heroes stay: {nameList(heroes)} keep their Health and twists.</p>}
        </section>

        <section className="gt-start__section gt-start__section--see" aria-labelledby={`${id}-see`}>
          <h3 id={`${id}-see`}>What players will see</h3>
          <div className="gt-start__preview">
            <div className="gt-row">
              <strong>{name}</strong>
              <span className="gt-sub">{choices.resets.round ? 'Round not started' : `Round ${game.round}`}</span>
            </div>
            <div className="gt-row">
              <span role="img" aria-label={`Tracker at ${boxLabel(boxes, 0)} of ${boxes.length}`}>
                <TrackerBoxes tracker={scene.tracker} at={0} />
              </span>
              <span className="gt-sub">{trackerLine(first)}</span>
            </div>
            <div>
              <span className="gt-sub">Opposition:</span> {seen.length ? seen.join(', ') : 'nothing yet'}
            </div>
            <div className="gt-sub">{hidden ? `${hidden} more hidden until you reveal them.` : 'Nothing hidden.'}</div>
            <div className="gt-sub">They get a toast: "New scene: {name}".</div>
          </div>
        </section>
      </div>
      <div className="button-row gt-dialog-actions">
        <span className="gt-sub gt-start__foot">{choices.resets.round ? 'After this, Start round 1 asks who goes first.' : ''}</span>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button" onClick={onEdit}>
          Edit scene {number} first
        </button>
        <button type="button" className="button button--primary" onClick={() => onStart(choices)}>
          Start scene {number}
        </button>
      </div>
    </Modal>
  )
}
