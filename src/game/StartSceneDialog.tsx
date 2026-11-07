/**
 * Starting the next scene (scrpg-aid-designs/scenes/spec.md, section 5): what's leaving and what becomes
 * of it, what's coming in, what resets, and a preview of what players will see.
 */
import { useId, useState } from 'react'
import { Modal } from '../components/Modal'
import { nameList } from './names'
import { betweenIssues, currentScene, issueTitle, nextIssueNumber, sceneName, sceneNumber, trackerFromCounts, type Game } from './model'
import type { IssueStartFacts } from './issues'
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

const ISSUE_RESETS = RESETS.map((r) => (r.key === 'mods' ? { ...r, name: 'Bonuses and penalties on the opposition', note: 'Cleared from villains and minions brought along' } : r))

/** What the dialog needs for starting the next issue, not just a scene (scrpg-aid-designs/issues/spec.md, section 5). */
export interface IssueStartProps {
  facts: IssueStartFacts
  /** Only while hosting: there's nobody to remind otherwise. */
  onRemind?: () => void
  onReview: (heroId: string) => void
}

const pointsWord = (n: number) => `${n} hero ${n === 1 ? 'point' : 'points'}`

function BeforeYouStart({ facts, number, finishedNumber, name, onRemind, onReview }: IssueStartProps & { number: number; finishedNumber: number; name: string }) {
  const [reminded, setReminded] = useState(false)
  return (
    <>
      {facts.unspent.length > 0 && (
        <div className="gt-issue-box">
          <strong>Unspent hero points</strong>
          <span className="gt-sub">
            {facts.unspent.map((u) => `${u.name} ${u.points}${u.away ? ' (disconnected)' : ''}`).join(' · ')}. Unspent points are lost when the issue starts.
          </span>
          {onRemind && (
            <div>
              <button
                type="button"
                className="button button--small"
                disabled={reminded}
                onClick={() => {
                  setReminded(true)
                  onRemind()
                }}
              >
                {reminded ? 'Reminded' : 'Remind them'}
              </button>
            </div>
          )}
        </div>
      )}
      {facts.bought.length > 0 && (
        <p className="gt-sub">
          Bought for issue {number}: {facts.bought.join(' · ')}. They become exclusive bonuses when the issue starts.
        </p>
      )}
      {facts.syncs.map((s) => (
        <div key={s.heroId} className="gt-issue-box">
          <strong>{s.name}'s sheet update is waiting.</strong>
          <span className="gt-sub">
            {s.player} changed the sheet after the issue. Review it so issue {number} starts with the new sheet.
          </span>
          <div>
            <button type="button" className="button button--small" aria-label={`Review ${s.name}'s sheet update`} onClick={() => onReview(s.heroId)}>
              Review
            </button>
          </div>
        </div>
      ))}
      {facts.notRecorded.length > 0 && (
        <p className="gt-sub">
          Back issues: {nameList(facts.notRecorded)} {facts.notRecorded.length === 1 ? "hasn't" : "haven't"} recorded issue {finishedNumber} yet. That doesn't hold anything up; they can add it any time.
        </p>
      )}
      <p className="gt-sub">
        Players get a toast: "Issue {number} began: {name}."
      </p>
    </>
  )
}

export function StartSceneDialog({ game, sceneId, issue, onStart, onEdit, onClose }: { game: Game; sceneId: string; issue?: IssueStartProps | undefined; onStart: (choices: StartChoices, recover: boolean) => void; onEdit: () => void; onClose: () => void }) {
  const [recover, setRecover] = useState(true)
  const [confirming, setConfirming] = useState(false)
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
  const between = betweenIssues(game)
  const issueNumber = nextIssueNumber(game)
  const finished = game.issues.at(-1)
  const resets = between ? ISSUE_RESETS : RESETS
  const lost = issue?.facts.unspent.reduce((n, u) => n + u.points, 0) ?? 0
  return (
    <Modal title={between ? `Start issue ${issueNumber} with scene ${number}: ${name}?` : `Start scene ${number}: ${name}?`} onClose={onClose} wide>
      <p className="gt-sub">
        {between && finished ? (
          <>
            Issue {finished.number}, {issueTitle(finished)}, is finished.
          </>
        ) : (
          <>
            Scene {sceneNumber(game, previous.id)}, {sceneName(previous)}, ends {game.round > 0 ? `after round ${game.round}` : 'before round 1'}.
          </>
        )}
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
          <h3 id={`${id}-resets`}>Reset for the new {between ? 'issue' : 'scene'}</h3>
          {between && (
            <label className="checkbox">
              <input type="checkbox" checked={recover} onChange={(e) => setRecover(e.target.checked)} />
              <span>
                <strong>Heroes recover</strong>
                <br />
                <span className="gt-sub">Health to max; twists, bonuses and penalties, and player-made minions cleared; forms and modes back to their default; reaction ready. Bonuses bought with hero points are added after this.</span>
              </span>
            </label>
          )}
          {resets.map((r) => (
            <label key={r.key} className="checkbox">
              <input type="checkbox" checked={choices.resets[r.key]} onChange={(e) => setChoices({ ...choices, resets: { ...choices.resets, [r.key]: e.target.checked } })} />
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="gt-sub">{r.note}</span>
              </span>
            </label>
          ))}
          {!between && heroes.length > 0 && <p className="gt-sub">The heroes stay: {nameList(heroes)} keep their Health and twists.</p>}
        </section>

        <section className="gt-start__section gt-start__section--see" aria-labelledby={`${id}-see`}>
          <h3 id={`${id}-see`}>{between ? 'Before you start' : 'What players will see'}</h3>
          {between && issue ? <BeforeYouStart {...issue} number={issueNumber} finishedNumber={finished?.number ?? 1} name={name} /> : <div className="gt-start__preview">
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
          </div>}
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
        <button type="button" className="button button--primary" onClick={() => (between && lost > 0 ? setConfirming(true) : onStart(choices, recover))}>
          {between ? `Start issue ${issueNumber}` : `Start scene ${number}`}
        </button>
      </div>
      {confirming && issue && (
        <Modal title={`${pointsWord(lost)} will be lost`} onClose={() => setConfirming(false)}>
          <p>
            {nameList(issue.facts.unspent.map((u) => `${u.name} has ${u.points}`))} unspent. Once issue {issueNumber} starts, unspent hero points are gone.
          </p>
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button" onClick={() => setConfirming(false)}>
              Wait for them
            </button>
            <button type="button" className="button button--primary" onClick={() => onStart(choices, recover)}>
              Start anyway
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
