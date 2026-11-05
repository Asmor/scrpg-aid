/**
 * Finishing the issue (docs/design/issues/spec.md, section 2): the title and summary, what becomes
 * of scenes and opposition, a checkbox per hero for their back issue, and a preview of the end card.
 */
import { useId, useState } from 'react'
import { BackIssuePips } from '../components/BackIssuePips'
import { Modal } from '../components/Modal'
import { MAX_NAME, MAX_TEXT } from '../session/protocol'
import { defaultIssueTitle, finishRows, modsToClear, oppositionStaying, scenesPlayed, type FinishChoices } from './issues'
import { currentIssue, currentScene, gameDisplayName, sceneName, sceneNumber, type Game } from './model'
import { TrackerBoxes } from './ScenesTab'
import { EndOfIssue } from './TableCenter'

interface Props {
  game: Game
  /** The client ids of players connected now. */
  connected: ReadonlySet<string>
  onFinish: (choices: FinishChoices) => void
  onClose: () => void
}

export function FinishIssueDialog({ game, connected, onFinish, onClose }: Props) {
  const id = useId()
  const issue = currentIssue(game)
  const [title, setTitle] = useState(() => (issue ? issue.title?.trim() || defaultIssueTitle(game, issue) : ''))
  const [summary, setSummary] = useState('')
  // Every player's hero starts checked.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  if (!issue) return null
  const checked = new Set(game.heroes.filter((h) => !unchecked.has(h.id)).map((h) => h.id))
  const rows = finishRows(game, checked, connected)
  const heroIds = rows.filter((r) => checked.has(r.heroId)).map((r) => r.heroId)
  const named = title.trim()
  const scene = currentScene(game)
  const played = scenesPlayed(game)
  const planned = game.scenes.filter((s) => s.state === 'planned')
  const cleared = modsToClear(game)
  const opposition = oppositionStaying(game)
  const players = game.heroes.filter((h) => h.player)
  const offeredPlayers = players.filter((h) => heroIds.includes(h.id))
  return (
    <Modal title={`Finish issue ${issue.number}?`} onClose={onClose} wide>
      <p className="gt-sub">
        {gameDisplayName(game)} · Scene {sceneNumber(game, scene.id)}, {sceneName(scene)}, ends {game.round > 0 ? `after round ${game.round}` : 'before round 1'}.
      </p>
      <div className="gt-start">
        <section className="gt-start__section" aria-labelledby={`${id}-issue`}>
          <h3 id={`${id}-issue`}>The issue</h3>
          <label className="field" htmlFor={`${id}-title`}>
            <span>Title</span>
            <input id={`${id}-title`} type="text" maxLength={MAX_NAME} required value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby={`${id}-title-hint`} />
          </label>
          <span id={`${id}-title-hint`} className="gt-sub">
            Each hero's back issue gets this name.
          </span>
          <label className="field" htmlFor={`${id}-summary`}>
            <span>What happened (optional)</span>
            <textarea id={`${id}-summary`} rows={3} maxLength={MAX_TEXT} value={summary} onChange={(e) => setSummary(e.target.value)} aria-describedby={`${id}-summary-hint`} />
          </label>
          <span id={`${id}-summary-hint`} className="gt-sub">
            Players see it, and it's kept with the issue.
          </span>
          <ul className="gt-finish__facts">
            <li>
              <strong>
                {played.length} {played.length === 1 ? 'scene' : 'scenes'} played
              </strong>
              <br />
              <span className="gt-sub">{played.map(sceneName).join(' · ')}</span>
            </li>
            {planned.length > 0 && (
              <li>
                <strong>
                  {planned.length} planned {planned.length === 1 ? "scene wasn't" : "scenes weren't"} played
                </strong>
                <br />
                <span className="gt-sub">{planned.length === 1 ? 'It stays planned' : 'They stay planned'}, ready for the next issue.</span>
              </li>
            )}
            {cleared.length > 0 && (
              <li>
                <strong>Bonuses and penalties are removed</strong>
                <br />
                <span className="gt-sub">{cleared.map((c) => `${c.name} ${c.sizes}`).join(' · ')}</span>
              </li>
            )}
            {opposition && (
              <li>
                <strong>The opposition stays put</strong>
                <br />
                <span className="gt-sub">{opposition}. You'll decide what leaves when the next issue starts.</span>
              </li>
            )}
          </ul>
        </section>

        <section className="gt-start__section" aria-labelledby={`${id}-back`}>
          <h3 id={`${id}-back`}>Back issues</h3>
          <p className="gt-sub">
            Each checked hero gets "{named || title}" as a back issue. Players confirm it on their own device.
          </p>
          <ul className="gt-finish__facts">
            {rows.map((r) => {
              const on = checked.has(r.heroId)
              return (
                <li key={r.heroId} className="gt-row">
                  <label className="checkbox gt-grow">
                    <input
                      type="checkbox"
                      checked={on}
                      aria-label={r.name}
                      onChange={(e) => {
                        const next = new Set(unchecked)
                        if (e.target.checked) next.delete(r.heroId)
                        else next.add(r.heroId)
                        setUnchecked(next)
                      }}
                    />
                    <span>
                      <strong>{r.name}</strong> <span className="gt-sub">{r.who}</span>
                      <br />
                      <span className="gt-sub">{r.note}</span>
                    </span>
                  </label>
                  <BackIssuePips count={r.count} adding={on} />
                  {on && r.tag && <span className="tag">{r.tag}</span>}
                </li>
              )
            })}
          </ul>
          {rows.length > 0 && <p className="gt-sub">Uncheck a hero who sat this one out.</p>}
        </section>

        <section className="gt-start__section gt-finish__see" aria-labelledby={`${id}-see`}>
          <h3 id={`${id}-see`}>What players will see</h3>
          <div className="gt-start__preview gt-end gt-finish__preview">
            <EndOfIssue number={issue.number} title={named || `Issue ${issue.number}`} summary={summary.trim()} />
            <div className="gt-row">
              <span className="gt-end__tracker">
                <TrackerBoxes tracker={scene.tracker} at={scene.position} />
              </span>
              <span className="gt-sub">The table is paused until the next issue starts.</span>
            </div>
          </div>
          <p className="gt-sub">
            Each player whose hero is checked gets "Add {named || title} to your back issues?" on their device ({offeredPlayers.length} of {players.length} {players.length === 1 ? 'player' : 'players'}). Players who aren't connected get it the next time they join. The display view shows the end card.
          </p>
        </section>
      </div>
      <div className="button-row gt-dialog-actions">
        <span className="gt-sub gt-start__foot">You can undo this for 30 seconds.</span>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={!named} onClick={() => onFinish({ title: named, summary, heroIds })}>
          Finish issue {issue.number}
        </button>
      </div>
    </Modal>
  )
}
