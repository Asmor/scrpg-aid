/**
 * The GM's page (Phase 4): host a game, share its code and link, set the scene, and watch
 * the party and the feed. The GM needs no hero.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { joinUrl, listPath } from '../app/route'
import { ZONE_LABEL } from '../hero/labels'
import { ModForm } from '../play/ModForm'
import { useTick } from '../play/useTick'
import { memberName } from './gm'
import { useGmState, useSession } from './context'
import { Feed, Party } from './TableViews'

const SCENES = ['green', 'yellow', 'red'] as const

export function GmPage() {
  const session = useSession()
  const state = useGmState(session.gm)
  const formId = useId()
  const now = useTick()
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  const [confirmEnd, setConfirmEnd] = useState(false)

  if (!session.gm || !state) {
    return (
      <div className="play-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        <h2>Host a game</h2>
        <p>Start a game, then share its code or link with your players. Everyone needs to be online.</p>
        {session.player && <p className="hint">You’re in a game as a player. Hosting one leaves it.</p>}
        <form
          className="play-add"
          onSubmit={(e) => {
            e.preventDefault()
            session.host(password.trim() || undefined)
          }}
        >
          <label className="field" htmlFor={`${formId}-password`}>
            <span>Password (optional)</span>
            <input id={`${formId}-password`} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="button button--primary">
            Start a game
          </button>
        </form>
      </div>
    )
  }

  const gm = session.gm
  const link = joinUrl(gm.room)
  return (
    <div className="play-page">
      <p>
        <a href={listPath}>← All heroes</a>
      </p>
      <h2>Your game</h2>
      <div className="sheet-grid">
        <section className="sheet-panel play-section" aria-label="Invite players">
          <h3 className="sheet-panel__title">Invite players</h3>
          <p className="session-code">
            Room code: <strong>{gm.room}</strong>
          </p>
          {gm.password && (
            <p>
              Password: <strong>{gm.password}</strong>
            </p>
          )}
          <div className="button-row">
            <input className="session-link" type="text" readOnly value={link} aria-label="Join link" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="button"
              onClick={() => {
                const done = (result: 'copied' | 'failed') => {
                  setCopied(result)
                  clearTimeout(copyTimer.current)
                  copyTimer.current = setTimeout(() => setCopied(null), 3000)
                }
                // The clipboard needs a secure page (https); without it, say how to copy by hand.
                if (!navigator.clipboard) done('failed')
                else navigator.clipboard.writeText(link).then(() => done('copied'), () => done('failed'))
              }}
            >
              {copied === 'copied' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          {copied === 'failed' && <p className="hint">Couldn’t copy it. Select the link and copy it yourself.</p>}
        </section>

        <section className="sheet-panel play-section" aria-label="Scene">
          <h3 className="sheet-panel__title">Scene</h3>
          <fieldset className="play-scene">
            <legend className="visually-hidden">Scene zone</legend>
            {SCENES.map((zone) => (
              <label key={zone} className="checkbox">
                <input type="radio" name={`${formId}-scene`} checked={state.scene === zone} onChange={() => gm.setScene(zone)} />
                {ZONE_LABEL[zone]}
              </label>
            ))}
          </fieldset>
          <p className="hint">Everyone’s game aid follows the scene.</p>
        </section>
      </div>

      <section className="sheet-panel play-section" aria-label="Party">
        <h3 className="sheet-panel__title">Party</h3>
        <Party
          members={state.members}
          actions={(m) =>
            !m.connected && (
              <button type="button" className="button" onClick={() => gm.removeMember(m.clientId)}>
                Remove
              </button>
            )
          }
        />
      </section>

      <section className="sheet-panel play-section" aria-label="Give a bonus or penalty">
        <h3 className="sheet-panel__title">Give a bonus or penalty</h3>
        <p className="hint">A villain’s Hinder, say. It goes straight onto the hero’s list.</p>
        <ModForm
          self={false}
          targets={state.members.filter((m) => m.hero).map((m) => ({ id: m.clientId, name: memberName(m) }))}
          submitLabel="Give"
          onSubmit={(mod, to) => (to ? gm.giveMod(to, mod) : false)}
        />
      </section>

      <section className="sheet-panel play-section" aria-label="Feed">
        <h3 className="sheet-panel__title">Feed</h3>
        <Feed entries={state.feed} now={now} />
      </section>

      <div className="button-row">
        {confirmEnd ? (
          <span className="button-row" role="group" aria-label="End the game?">
            <span>End the game? Your players will see you as away, and the feed is cleared.</span>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                session.leave()
                setConfirmEnd(false)
              }}
            >
              Yes, end it
            </button>
            <button type="button" className="button" onClick={() => setConfirmEnd(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmEnd(true)}>
            End the game…
          </button>
        )}
      </div>
    </div>
  )
}
