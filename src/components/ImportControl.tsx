/**
 * Importing heroes from a file: one hero, a backup of several, or a Markdown or HTML export. When a hero is already
 * saved (the same id), the player chooses each time whether to replace theirs or keep both.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../app/store-context'
import { heroDisplayName, type Hero } from '../hero/model'
import { conflicts, heroesToSave, readImport, type Resolution, type SkippedHero } from '../transfer/files'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** What the player is asked before the import goes ahead. */
interface Pending {
  heroes: Hero[]
  skipped: SkippedHero[]
  savedIds: Set<string>
  conflicts: Hero[]
}

const count = (n: number) => (n === 1 ? 'one hero' : `${n} heroes`)

function skippedText(skipped: readonly SkippedHero[]): string {
  return skipped.map((s) => `Hero ${s.index} in the file couldn't be read: ${s.error}.`).join(' ')
}

interface ImportControlProps {
  /** Every saved id, including records that couldn't be read. */
  savedIds: ReadonlySet<string>
  /** Saved records that couldn't be read, so replacing one can say so. */
  unreadableIds: ReadonlySet<string>
  disabled: boolean
  /** Called as saving starts and stops, so the rest of the list can wait. */
  onBusyChange?: (busy: boolean) => void
  onImported: () => void
  /** Other buttons for the same row (the backup). */
  children?: ReactNode
}

export function ImportControl({ savedIds, unreadableIds, disabled, onBusyChange, onImported, children }: ImportControlProps) {
  const store = useStore()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const prompt = useRef<HTMLFieldSetElement>(null)
  // Put focus back on the Import button once it's usable again (it's disabled while busy).
  const returnFocus = useRef(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [choices, setChoices] = useState<Record<string, Resolution>>({})
  const [busy, setBusyState] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const setBusy = (b: boolean) => {
    setBusyState(b)
    onBusyChange?.(b)
  }

  useEffect(() => {
    if (pending) prompt.current?.focus()
  }, [pending])
  useEffect(() => {
    if (returnFocus.current && button.current && !button.current.disabled) {
      button.current.focus()
      returnFocus.current = false
    }
  })

  const close = () => {
    setPending(null)
    returnFocus.current = true
  }

  const finish = async (p: Pending, chosen: Readonly<Record<string, Resolution>>) => {
    setBusy(true)
    let saved = 0
    try {
      for (const hero of heroesToSave(p.heroes, p.savedIds, chosen)) {
        await store.save(hero)
        saved++
      }
      setMessage({ error: false, text: [`Imported ${count(saved)}.`, skippedText(p.skipped)].filter(Boolean).join(' ') })
    } catch (e) {
      setMessage({ error: true, text: `The import stopped after ${count(saved)} of ${p.heroes.length}: ${errorText(e)}` })
    } finally {
      close()
      setBusy(false)
      onImported()
    }
  }

  const read = async (file: File) => {
    setMessage(null)
    let text: string
    try {
      text = await file.text()
    } catch (e) {
      setMessage({ error: true, text: `Couldn't read ${file.name}: ${errorText(e)}` })
      return
    }
    const result = readImport(text)
    if (!result.ok) {
      setMessage({ error: true, text: result.error })
      return
    }
    if (result.heroes.length === 0) {
      setMessage({ error: true, text: ['There are no heroes in this file to import.', skippedText(result.skipped)].filter(Boolean).join(' ') })
      return
    }
    const ids = new Set(savedIds)
    const p: Pending = { heroes: result.heroes, skipped: result.skipped, savedIds: ids, conflicts: conflicts(result.heroes, ids) }
    if (p.conflicts.length === 0) {
      await finish(p, {})
      return
    }
    // Keeping both is the choice that loses nothing, so it's selected to start with.
    setChoices(Object.fromEntries(p.conflicts.map((h) => [h.id, 'copy' as const])))
    setPending(p)
  }

  return (
    <div className="import-control">
      <input
        ref={input}
        type="file"
        accept=".json,.md,.markdown,.html,.htm,application/json,text/markdown,text/html"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Clear it so choosing the same file again still imports it.
          e.target.value = ''
          if (file) void read(file)
        }}
      />
      <div className="button-row">
        <button ref={button} type="button" className="button" disabled={disabled || busy || pending !== null} onClick={() => input.current?.click()}>
          Import from a file…
        </button>
        {children}
      </div>

      {/* Always present, so screen readers announce the text when it changes. */}
      <p role="status">{message && !message.error ? message.text : ''}</p>
      {message?.error && (
        <p role="alert" className="error">
          {message.text}
        </p>
      )}

      {pending && (
        <fieldset ref={prompt} tabIndex={-1} className="import-conflicts">
          <legend>{pending.conflicts.length === 1 ? 'You already have this hero' : 'You already have these heroes'}</legend>
          <p className="hint">Replace yours with the imported one, or keep both (the imported one is added as a copy).</p>
          {pending.conflicts.map((hero) => (
            <div key={hero.id} role="radiogroup" aria-label={heroDisplayName(hero)} className="import-conflict">
              <span className="import-conflict__name">
                {heroDisplayName(hero)}
                {unreadableIds.has(hero.id) && <span className="choice__note"> (your saved copy couldn't be read)</span>}
              </span>
              {(
                [
                  ['replace', 'Replace mine'],
                  ['copy', 'Keep both'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="checkbox">
                  <input type="radio" name={`${id}-${hero.id}`} checked={choices[hero.id] === value} onChange={() => setChoices((c) => ({ ...c, [hero.id]: value }))} />
                  {label}
                </label>
              ))}
            </div>
          ))}
          <div className="button-row">
            <button type="button" className="button button--primary" disabled={busy} onClick={() => void finish(pending, choices)}>
              Import {count(pending.heroes.length)}
            </button>
            <button type="button" className="button" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
    </div>
  )
}
