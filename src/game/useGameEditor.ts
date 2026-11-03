/**
 * Loading a game for changing it, and saving each change straight away (like
 * ../editor/useDocumentEditor.ts): the GM's table, and a character's solo game. Changes are the
 * pure functions in ./table.ts and ./solo.ts, which return the next game.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../app/game-store-context'
import { useDocumentEditor, type DocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import type { Villain } from '../villain/model'
import { isListedGame, type Game } from './model'
import { copyOf } from './table'
import { createSoloGame, refreshSolo, soloGameId, type SoloKind } from './solo'

/** Replaces the draft's contents with the next game (the reducers return a new object). */
export function replaceInto(draft: Game, next: Game): void {
  if (next === draft) return
  for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key]
  Object.assign(draft, next)
}

export interface GameEditor extends DocumentEditor<Game> {
  /** Applies a change (a pure function of the latest game), shows it and saves it. */
  apply: (fn: (game: Game) => Game) => void
}

function withApply(editor: DocumentEditor<Game>): GameEditor {
  return { ...editor, apply: (fn) => editor.update((draft) => replaceInto(draft, fn(draft))) }
}

export function useGameEditor(id: string): GameEditor {
  const store = useGameStore()
  const load = useCallback(async (gameId: string): Promise<Lookup<Game>> => {
    const r = await store.get(gameId)
    return r.status === 'found' ? { status: 'found', doc: r.game } : r
  }, [store])
  const save = useCallback((g: Game) => store.save(g), [store])
  return withApply(useDocumentEditor(id, load, save))
}

/**
 * A character's solo game (./solo.ts), for its standalone Play page: loaded, or made (and saved
 * on the first change) the first time. Whenever the library sheet `doc` changes, the game's copy
 * is brought up to date. Until `doc` is loaded the game stays loading.
 */
export function useSoloGame(kind: SoloKind, doc: Hero | Villain | undefined, clock: () => Clock): GameEditor {
  const store = useGameStore()
  const docRef = useRef(doc)
  const clockRef = useRef(clock)
  useEffect(() => {
    docRef.current = doc
    clockRef.current = clock
  })
  const id = doc ? soloGameId(kind, doc.id) : ''
  const load = useCallback(async (gameId: string): Promise<Lookup<Game>> => {
    // No id until the character has loaded: wait (the page shows the character's own state).
    if (!gameId) return new Promise<Lookup<Game>>(() => {})
    const r = await store.get(gameId)
    if (r.status === 'found') return { status: 'found', doc: r.game }
    const source = docRef.current
    if (r.status === 'missing' && source) return { status: 'found', doc: createSoloGame(kind, source, clockRef.current()), unsaved: true }
    return r
  }, [store, kind])
  const save = useCallback((g: Game) => store.save(g), [store])
  const editor = withApply(useDocumentEditor(id, load, save))
  const game = editor.state.status === 'ready' ? editor.state.doc : undefined
  const { apply } = editor
  useEffect(() => {
    if (!game || !doc) return
    const next = refreshSolo(game, doc, clockRef.current())
    if (next !== game) apply(() => next)
    // `apply` is new each render; the check above makes running again harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, doc])
  return editor
}

/** Every game listed on the Games page (no solo games), and how loading them went. */
export function useListedGames(): { games: Game[] | null; error: string | null; reload: () => void } {
  const store = useGameStore()
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    store.list().then(
      (list) => live && setGames(list.games.filter(isListedGame)),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [store, tick])
  return { games, error, reload: () => setTick((t) => t + 1) }
}

/** The listed games holding a copy of a character, by name (a character's "also in" line). */
export function gamesHolding(games: readonly Game[], kind: 'hero' | 'villain' | 'minion' | 'lieutenant' | 'challenge', sourceId: string): Game[] {
  return games.filter((g) => isListedGame(g) && holds(g, kind, sourceId))
}

/** Whether a game holds a copy of a library document, or something made from a template. */
function holds(game: Game, kind: 'hero' | 'villain' | 'minion' | 'lieutenant' | 'challenge', sourceId: string): boolean {
  switch (kind) {
    case 'hero':
    case 'villain':
      return Boolean(copyOf(game, kind, sourceId))
    case 'minion':
    case 'lieutenant':
      return game.groups.some((g) => g.templateId === sourceId && g.kind === (kind === 'minion' ? 'minions' : 'lieutenants'))
    case 'challenge':
      return game.challenges.some((c) => c.templateId === sourceId)
  }
}
