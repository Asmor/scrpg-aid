import { describe, expect, it, vi } from 'vitest'
import { fetchTurnServers } from './turn'

const ok = (body: unknown) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch

describe('TURN credentials', () => {
  it('fetches the relay servers, keeping only what Trystero uses', async () => {
    const fetchFn = ok([
      { urls: 'stun:stun.relay.example:80' },
      { urls: ['turn:a.relay.example:80', 'turns:a.relay.example:443?transport=tcp'], username: 'u', credential: 'c', extra: 1 },
    ])
    expect(await fetchTurnServers('https://x.example/creds', fetchFn)).toEqual([
      { urls: 'stun:stun.relay.example:80' },
      { urls: ['turn:a.relay.example:80', 'turns:a.relay.example:443?transport=tcp'], username: 'u', credential: 'c' },
    ])
  })

  it('has none without a URL, or when the service fails, answers oddly, or is too slow', async () => {
    expect(await fetchTurnServers(undefined, ok([]))).toEqual([])
    expect(await fetchTurnServers('u', vi.fn(() => Promise.resolve(new Response('no', { status: 401 }))) as unknown as typeof fetch)).toEqual([])
    expect(await fetchTurnServers('u', ok({ error: 'bad key' }))).toEqual([])
    expect(await fetchTurnServers('u', ok([{ urls: 5 }]))).toEqual([])
    expect(await fetchTurnServers('u', vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toEqual([])
    const hang = vi.fn((_: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
    expect(await fetchTurnServers('u', hang, 10)).toEqual([])
  })
})
