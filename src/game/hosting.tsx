/**
 * Hosting a game from the table (docs/design/game-table/spec.md, section 10, "Invite, join and
 * watch"): starting to host, and the Invite dialog with the code, a QR code of the player link,
 * the link to copy, and who's connected.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { joinUrl } from '../app/route'
import { Modal } from '../components/Modal'
import { heroDisplayName } from '../hero/model'
import type { HeroInGame } from './model'

/** A QR code as an SVG drawn from the code's modules (no HTML strings). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    const dark: string[] = []
    // A quiet zone of 4 modules all round, as the QR spec asks.
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push(`M${c + 4} ${r + 4}h1v1h-1z`)
    return { n: n + 8, path: dark.join('') }
  }, [text])
  return (
    <svg className="gt-qr" viewBox={`0 0 ${cells.n} ${cells.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={cells.n} height={cells.n} fill="#fff" />
      <path d={cells.path} fill="#000" />
    </svg>
  )
}

/** Asks for the GM's name (players see it), then starts hosting. */
export function StartHostingDialog({ name: given, onStart, onClose }: { name: string; onStart: (name: string) => void; onClose: () => void }) {
  const id = useId()
  const [name, setName] = useState(given)
  return (
    <Modal title="Start hosting" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onStart(name.trim())
          onClose()
        }}
      >
        <p>Players join with the game's code or link. Everyone needs to be online, and this device keeps the game while you host.</p>
        <label className="field" htmlFor={`${id}-name`}>
          <span>Your name (players see it)</span>
          <input id={`${id}-name`} type="text" autoComplete="nickname" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={!name.trim()}>
            Start hosting
          </button>
        </div>
      </form>
    </Modal>
  )
}

function useCopy() {
  const [copied, setCopied] = useState<{ what: string; ok: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = (what: string, text: string) => {
    const done = (ok: boolean) => {
      setCopied({ what, ok })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 3000)
    }
    // The clipboard needs a secure page (https); without it, say how to copy by hand.
    if (!navigator.clipboard) done(false)
    else navigator.clipboard.writeText(text).then(() => done(true), () => done(false))
  }
  return { copied, copy }
}

interface InviteProps {
  room: string
  /** The GM's name, as players see it, and changing it. */
  gm: string
  onRenameGm: (name: string) => void
  gameName: string
  /** Players' heroes in the game, and which are connected now. */
  players: readonly HeroInGame[]
  connected: ReadonlySet<string>
  onRemove: (hero: HeroInGame) => void
  onStop: () => void
  onClose: () => void
}

export function InviteDialog({ room, gm, onRenameGm, gameName, players, connected, onRemove, onStop, onClose }: InviteProps) {
  const id = useId()
  const link = joinUrl(room)
  const [name, setName] = useState(gm)
  const { copied, copy } = useCopy()
  const [removing, setRemoving] = useState<HeroInGame | null>(null)
  const [stopping, setStopping] = useState(false)
  return (
    <Modal title={`Invite to ${gameName}`} onClose={onClose}>
      <div className="gt-invite">
        <p className="gt-invite__code" aria-label={`Game code ${room.split('').join(' ')}`}>
          {room}
        </p>
        <QrCode text={link} label="QR code for the player link" />
      </div>
      <div className="button-row">
        <button type="button" className="button button--primary" onClick={() => copy('player', link)}>
          {copied?.what === 'player' && copied.ok ? 'Copied' : 'Copy player link'}
        </button>
      </div>
      {copied && !copied.ok && (
        <p className="hint">
          Couldn't copy it. Select the link and copy it yourself: <span className="gt-invite__link">{link}</span>
        </p>
      )}
      <form
        className="gt-row gt-invite__name"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onRenameGm(name.trim())
        }}
      >
        <label className="field gt-grow" htmlFor={`${id}-gm`}>
          <span>Your name (players see it)</span>
          <input id={`${id}-gm`} type="text" autoComplete="nickname" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== gm && onRenameGm(name.trim())} />
        </label>
        <button type="submit" className="button button--small" disabled={!name.trim() || name.trim() === gm}>
          Save
        </button>
      </form>
      <h3 className="gt-label">Connected</h3>
      {players.length === 0 ? (
        <p className="gt-sub">No one has joined yet.</p>
      ) : (
        <ul className="gt-invite__people">
          {players.map((h) => {
            const here = h.player && connected.has(h.player.clientId)
            return (
              <li key={h.id} className="gt-row">
                <span className="gt-grow">
                  {h.player?.name} · {heroDisplayName(h.sheet)}
                </span>
                <span className={here ? 'gt-flag gt-flag--on' : 'gt-flag'}>{here ? 'connected' : 'disconnected'}</span>
                <button type="button" className="button button--small" aria-label={`Remove ${h.player?.name} and ${heroDisplayName(h.sheet)}`} onClick={() => setRemoving(h)}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {removing && (
        <div className="gt-confirm" role="group" aria-label={`Remove ${removing.player?.name}?`}>
          <p>
            Remove {removing.player?.name} from the game? {heroDisplayName(removing.sheet)} leaves the table too, and they can't rejoin this game.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={() => setRemoving(null)}>
              Keep
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                onRemove(removing)
                setRemoving(null)
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
      <div className="button-row gt-dialog-actions">
        {stopping ? (
          <span className="button-row" role="group" aria-label="Stop hosting?">
            <span>Stop hosting? Players can't act until you host again. The game stays as it is.</span>
            <button type="button" className="button" onClick={() => setStopping(false)}>
              Keep hosting
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                onStop()
                onClose()
              }}
            >
              Stop hosting
            </button>
          </span>
        ) : (
          <>
            <button type="button" className="button" onClick={() => setStopping(true)}>
              Stop hosting…
            </button>
            <button type="button" className="button button--primary" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
