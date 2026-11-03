/**
 * The GM's table's side of Open display view (./display-channel.ts): sends the observer
 * projection to any display window of this game after every change, answers a window that asks,
 * and says when the table closes.
 */
import { useEffect, useRef } from 'react'
import { openDisplayChannel, readDisplayMessage, type DisplayMessage } from './display-channel'
import type { TableView } from './project'

export function useDisplayBroadcast(gameId: string, table: TableView | undefined, room?: string): void {
  const latest = useRef<DisplayMessage | undefined>(undefined)
  const channel = useRef<BroadcastChannel | undefined>(undefined)
  useEffect(() => {
    const ch = openDisplayChannel(gameId)
    if (!ch) return
    channel.current = ch
    ch.onmessage = (e: MessageEvent) => {
      if (readDisplayMessage(e.data)?.type === 'ask' && latest.current) ch.postMessage(latest.current)
    }
    if (latest.current) ch.postMessage(latest.current)
    return () => {
      ch.postMessage({ type: 'closed' } satisfies DisplayMessage)
      ch.close()
      channel.current = undefined
    }
  }, [gameId])
  useEffect(() => {
    if (!table) return
    const msg: DisplayMessage = { type: 'state', table, ...(room ? { room } : {}) }
    latest.current = msg
    channel.current?.postMessage(msg)
  }, [table, room])
}
