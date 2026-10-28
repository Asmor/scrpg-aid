/**
 * The GM's page (Phase 4): host a game, share its code and link, set the scene, and watch
 * the party and the feed. The GM needs no hero.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { joinUrl, listPath, villainPlayPath } from '../app/route'
import { ZONE_LABEL } from '../hero/labels'
import { ModForm } from '../play/ModForm'
import { useTick } from '../play/useTick'
import { memberName } from './gm'
import { useOnline } from './useOnline'
import { useGmState, useSession } from './context'
import { Feed, Party, Villains } from './TableViews'
import { useOptionalVillainStore } from '../app/villain-store-context'
import { villainDisplayName, type Villain } from '../villain/model'
import { villainSummary } from '../villain/play'
import { villainTarget } from './types'

const SCENES = ['green', 'yellow', 'red'] as const

export function GmPage() {
  const session = useSession()
  const state = useGmState(session.gm)
  const formId = useId()
  const now = useTick()
  const online = useOnline()
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  const [confirmEnd, setConfirmEnd] = useState(false)
  // The GM's saved villains, to add to the game (Phase 5).
  const villainStore = useOptionalVillainStore()
  const [savedVillains, setSavedVillains] = useState<Villain[]>([])
  const [villainToAdd, setVillainToAdd] = useState('')
  useEffect(() => {
    let live = true
    villainStore?.list().then(
      (list) => live && setSavedVillains(list.villains),
      () => live && setSavedVillains([]),
    )
    return () => {
      live = false
    }
  }, [villainStore])

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
      {!online && <p className="hint">You’re offline. The game picks up again when you’re back online.</p>}
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

      {villainStore && (
        <section className="sheet-panel play-section" aria-label="Villains">
          <h3 className="sheet-panel__title">Villains</h3>
          <Villains
            villains={state.villains ?? []}
            actions={(v) => {
              const waiting = state.inbox.filter((i) => i.to === villainTarget(v.id)).length
              return (
                <div className="button-row">
                  <a href={villainPlayPath(v.id)}>Play</a>
                  {waiting > 0 && <span className="hint">{waiting === 1 ? 'A mod is' : `${waiting} mods are`} waiting: open its Play page to add them.</span>}
                  <button type="button" className="button" onClick={() => gm.removeVillain(v.id)}>
                    Remove
                  </button>
                </div>
              )
            }}
          />
          {savedVillains.length === 0 ? (
            <p className="sheet-empty">You have no saved villains to add yet.</p>
          ) : (
            <div className="play-add">
              <label className="field" htmlFor={`${formId}-villain`}>
                <span>Villain to add</span>
                <select id={`${formId}-villain`} value={villainToAdd} onChange={(e) => setVillainToAdd(e.target.value)}>
                  <option value="">Choose…</option>
                  {savedVillains
                    .filter((v) => !(state.villains ?? []).some((s) => s.id === v.id))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {villainDisplayName(v)}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="button"
                disabled={!villainToAdd}
                onClick={() => {
                  const villain = savedVillains.find((v) => v.id === villainToAdd)
                  if (!villain) return
                  const last = villain.play?.history.at(-1)?.id
                  gm.addVillain({ ...villainSummary(villain), ...(last ? { sharedUpTo: last } : {}) })
                  setVillainToAdd('')
                }}
              >
                Add to the game
              </button>
            </div>
          )}
          <p className="hint">Run a villain from its Play page; while it's open, the table sees its Health, status, and rolls, and mods players give it are added.</p>
        </section>
      )}

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
