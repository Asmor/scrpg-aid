/**
 * Send… (scrpg-aid-designs/game-table/spec.md, section 15, and connect.dc.html): sends library items
 * to another device. The dialog shows the items, whether their tags go too, and a short code,
 * and stays open until the other device accepts or the sender cancels.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { useSenderSnapshot, useSession } from '../session/context'
import { MAX_OFFER, type Sender } from '../session/send'
import { nameList } from './names'
import type { LibraryItem } from './registry'
import { sendText } from './send-text'

const itemCount = (n: number) => (n === 1 ? 'one item' : `${n} items`)

export function SendDialog({ items, onClose }: { items: readonly LibraryItem[]; onClose: () => void }) {
  const session = useSession()
  const [text] = useState(() => sendText(items))
  const tooBig = text.length > MAX_OFFER
  const [sender, setSender] = useState<Sender | undefined>()
  // Opened once per dialog (the session's functions are new on every render).
  const open = useRef(session.send)
  useEffect(() => {
    if (tooBig || !open.current) return
    const s = open.current(text)
    setSender(s)
    return () => s.cancel()
  }, [text, tooBig])
  const snapshot = useSenderSnapshot(sender)
  const status = snapshot?.status
  const names = items.map((i) => i.row.name)
  const tagged = items.some((i) => i.doc.tags.length > 0)
  const title = items.length === 1 ? `Send ${names[0]}` : `Send ${items.length} items`
  return (
    <Modal title={title} onClose={onClose}>
      <p className="hint">
        {nameList(names)}
        {tagged && ' · with their tags'}
      </p>
      {tooBig && <p role="alert">That's too much to send at once. Send fewer items.</p>}
      {sender && status !== 'accepted' && (
        <>
          <p className="gt-invite__code" aria-label={`Send code ${sender.code.split('').join(' ')}`}>
            {sender.code}
          </p>
          <p>On their device: Play together, then Receive, then this code. Keep this open until they accept.</p>
        </>
      )}
      <p role="status">{status === 'opened' ? 'Their device has the code. Waiting for them to accept.' : status === 'accepted' ? `Sent. They accepted ${itemCount(items.length)}.` : ''}</p>
      <div className="button-row gt-dialog-actions">
        <button type="button" className={status === 'accepted' ? 'button button--primary' : 'button'} onClick={onClose}>
          {status === 'accepted' ? 'Done' : 'Cancel'}
        </button>
      </div>
    </Modal>
  )
}
