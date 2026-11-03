/**
 * Receive (docs/design/game-table/spec.md, section 15): Play together, then Receive, then the
 * code someone is sending with. The page shows what's coming, and Accept adds it to the
 * library (./receive.ts), tags included.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { listPath, navigate, receivePath } from '../app/route'
import { useStore } from '../app/store-context'
import { useOptionalVillainStore } from '../app/villain-store-context'
import { heroType, villainType } from '../library/registry'
import { nameList } from '../library/names'
import { normalizeRoomCode } from './code'
import { useReceiverSnapshot, useSession } from './context'
import { saveOffer, type Saved } from './receive'
import type { Offer, Receiver } from './send'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const itemCount = (n: number) => (n === 1 ? 'one item' : `${n} items`)

export function ReceivePage({ code: given }: { code?: string }) {
  const code = given ? normalizeRoomCode(given) : undefined
  return code ? <Receiving key={code} code={code} /> : <ReceiveForm key={given ?? ''} code={given} />
}

function ReceiveForm({ code: given }: { code?: string }) {
  const id = useId()
  const [text, setText] = useState(given ?? '')
  const code = normalizeRoomCode(text)
  return (
    <div className="watch-page">
      <p>
        <a href={listPath}>← Library</a>
      </p>
      <h2>Receive</h2>
      <p>Get heroes, villains or other items someone is sending you. Use the code their Send dialog shows.</p>
      <form
        className="play-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (code) navigate(receivePath(code))
        }}
      >
        <label className="field" htmlFor={`${id}-code`}>
          <span>Code</span>
          <input id={`${id}-code`} type="text" autoComplete="off" autoCapitalize="characters" value={text} onChange={(e) => setText(e.target.value)} placeholder="ABCD-EFGH" />
        </label>
        {text.trim() && !code && <p className="hint">A code is eight letters and numbers, like ABCD-EFGH.</p>}
        <button type="submit" className="button button--primary" disabled={!code}>
          Receive
        </button>
      </form>
    </div>
  )
}

/** The offered items: name, kind and tags. */
function OfferList({ offer }: { offer: Offer }) {
  const items = [...offer.heroes.map((h) => ({ id: `hero:${h.id}`, type: heroType.label, name: heroType.row(h).name, tags: h.tags })), ...offer.villains.map((v) => ({ id: `villain:${v.id}`, type: villainType.label, name: villainType.row(v).name, tags: v.tags }))]
  return (
    <ul className="receive-list">
      {items.map((i, n) => (
        <li key={`${i.id}-${n}`} className="receive-list__item">
          <strong>{i.name}</strong> <span className="hint">{i.type}</span>
          {i.tags.length > 0 && (
            <span className="item-tags" aria-label={`Tags: ${i.tags.join(', ')}`}>
              {i.tags.map((t) => (
                <span key={t} className="tag-chip">
                  <span className="tag-chip__name">{t}</span>
                </span>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Receiving({ code }: { code: string }) {
  const session = useSession()
  const heroes = useStore()
  const villains = useOptionalVillainStore()
  const [receiver, setReceiver] = useState<Receiver | undefined>()
  // Opened once per code (the session's functions are new on every render).
  const open = useRef(session.receive)
  useEffect(() => {
    const r = open.current?.(code)
    setReceiver(r)
    return () => r?.close()
  }, [code])
  const snapshot = useReceiverSnapshot(receiver)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accept = async (offer: Offer) => {
    setError(null)
    setSaving(true)
    try {
      const result = await saveOffer(offer, heroes, villains)
      setSaved(result)
      receiver?.accept()
    } catch (e) {
      setError(`Couldn't add them to your library: ${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const back = (
    <p>
      <a href={listPath}>← Library</a>
    </p>
  )
  const another = (
    <a className="button" href={receivePath()}>
      Use another code
    </a>
  )

  if (!snapshot) {
    return (
      <div className="watch-page">
        {back}
        <p role="alert">Receiving isn't available here.</p>
      </div>
    )
  }
  if (saved) {
    return (
      <div className="watch-page">
        <h2>Received</h2>
        <p role="status">Added {nameList(saved.names)} to your library.</p>
        {saved.copies.length > 0 && <p className="hint">You already had {nameList(saved.copies)}, so {saved.copies.length === 1 ? 'it came in as a copy' : 'they came in as copies'}.</p>}
        <div className="button-row">
          <a className="button button--primary" href={listPath}>
            Open the library
          </a>
        </div>
      </div>
    )
  }
  if (snapshot.status === 'looking') {
    return (
      <div className="watch-page">
        {back}
        <h2>Receive</h2>
        <p role="status">Looking for {code}…</p>
      </div>
    )
  }
  if (snapshot.status === 'notFound') {
    return (
      <div className="watch-page">
        {back}
        <h2>Receive</h2>
        <p role="alert">
          {snapshot.unreadable
            ? `Something was sent with ${code}, but this device couldn't read it. Reload this page to update the app, and ask the sender to do the same.`
            : `Nothing is being sent with ${code}. Check the code with the sender, and that their Send dialog is still open.`}
        </p>
        <div className="button-row">
          <button type="button" className="button button--primary" onClick={() => receiver?.retry()}>
            Try again
          </button>
          {another}
        </div>
      </div>
    )
  }
  const offer = snapshot.offer
  const count = offer.heroes.length + offer.villains.length
  return (
    <div className="watch-page">
      {back}
      <h2>Receive {count === 1 ? (offer.heroes[0] ? heroType.row(offer.heroes[0]).name : villainType.row(offer.villains[0]!).name) : `${count} items`}</h2>
      <OfferList offer={offer} />
      {offer.unreadable > 0 && <p className="hint">{offer.unreadable === 1 ? "One more item couldn't be read, so it won't come in." : `${offer.unreadable} more items couldn't be read, so they won't come in.`}</p>}
      {snapshot.status === 'gone' ? (
        <>
          <p role="alert">The sender closed the code before you accepted. Ask them to send again.</p>
          <div className="button-row">{another}</div>
        </>
      ) : (
        <>
          <p className="hint">Accept adds {count === 1 ? 'it' : `these ${itemCount(count)}`} to your library, with {count === 1 ? 'its' : 'their'} tags. Anything you already have comes in as a copy.</p>
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button type="button" className="button button--primary" disabled={saving} onClick={() => void accept(offer)}>
              Accept
            </button>
            <button type="button" className="button" onClick={() => navigate(listPath)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
