/** Saving a hero or a villain to a file in each export format. */
import { useEffect, useId, useRef, useState } from 'react'
import type { Hero } from '../hero/model'
import type { Villain } from '../villain/model'
import { downloadFile } from '../transfer/download'
import { heroFileName, heroJson, villainFileName, villainJson } from '../transfer/files'
import { loadIconDataUris } from '../transfer/icons'
import { heroMarkdown, villainMarkdown } from '../transfer/markdown'
import { defaultPageSize, type PageSize } from '../transfer/pdf/page-size'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * What to tell the player when an export fails. The PDF maker isn't cached up front, so its
 * first download needs a connection; and after an update, a page still running the old
 * version asks for files that are gone, until the update is accepted or the page reloaded.
 */
function exportErrorText(what: string, e: unknown): string {
  if (e instanceof Error && e.name === 'DownloadError') {
    return navigator.onLine
      ? `Couldn't make the ${what}: part of it couldn't be downloaded. If the app offers an update, accept it (or reload the page), then try again.`
      : `Couldn't make the ${what}: you're offline, and part of it downloads the first time it's used. Connect to the internet and try again.`
  }
  return `Couldn't make the ${what}: ${errorText(e)}`
}

/** A failed dynamic import counts as a download error. */
const asDownloadError = (e: unknown): never => {
  throw Object.assign(e instanceof Error ? e : new Error(String(e)), { name: 'DownloadError' })
}

/** What's exported: a hero, or a villain (Phase 5). */
type Exported = { hero: Hero; villain?: undefined } | { villain: Villain; hero?: undefined }

export function ExportMenu(props: Exported) {
  const { hero, villain } = props
  const menuId = useId()
  const fileName = (ext: string) => (hero ? heroFileName(hero, ext) : villainFileName(villain!, ext))
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [makingPdf, setMakingPdf] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Closes on Escape (back to the button) or a click elsewhere.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  /** Runs a menu item: the menu closes, focus goes back to its button, and any error shows under it. */
  const choose = (run: () => void | Promise<void>, what: string) => async () => {
    setOpen(false)
    setError(null)
    button.current?.focus()
    try {
      await run()
    } catch (e) {
      setError(exportErrorText(what, e))
    }
  }
  const pdf = (pageSize: PageSize) => async () => {
    setMakingPdf(true)
    try {
      // pdf-lib, the fonts and the icons are only downloaded when a PDF is made (then cached).
      const pdfMaker = await import('../transfer/pdf').catch(asDownloadError)
      downloadFile(fileName('pdf'), hero ? await pdfMaker.exportPdf(hero, pageSize) : await pdfMaker.exportVillainPdf(villain!, pageSize), 'application/pdf')
    } finally {
      setMakingPdf(false)
    }
  }
  const html = async () => {
    // The HTML export renders the sheet to a string, which needs React's server renderer; load it
    // only when asked. The icons are embedded so the file stands alone.
    const [htmlMaker, icons] = await Promise.all([import('../transfer/html').catch(asDownloadError), loadIconDataUris()])
    downloadFile(fileName('html'), hero ? htmlMaker.heroHtml(hero, icons) : htmlMaker.villainHtml(villain!, icons), 'text/html')
  }
  const items: [label: string, run: () => void | Promise<void>, what: string][] = [
    ['JSON', () => downloadFile(fileName('json'), hero ? heroJson(hero) : villainJson(villain!), 'application/json'), 'JSON file'],
    ['Markdown', () => downloadFile(fileName('md'), hero ? heroMarkdown(hero) : villainMarkdown(villain!), 'text/markdown'), 'Markdown file'],
    ['HTML', html, 'HTML file'],
    ['PDF, Letter', pdf('letter'), 'PDF'],
    ['PDF, A4', pdf('a4'), 'PDF'],
  ]
  // The paper size most likely to fit comes first.
  if (defaultPageSize(navigator.language) === 'a4') items.push(...items.splice(3, 1))
  return (
    <div
      className="export-menu"
      ref={wrap}
      // Tabbing out of the menu closes it. A blur with nowhere to go (Safari doesn't focus a
      // clicked button) isn't leaving: the pointerdown listener handles clicks elsewhere.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next && !wrap.current?.contains(next)) setOpen(false)
      }}
    >
      {/* aria-disabled rather than disabled while a PDF is made, so focus stays on it. */}
      <button type="button" className="button" ref={button} aria-expanded={open} aria-controls={menuId} aria-disabled={makingPdf} onClick={() => !makingPdf && setOpen(!open)}>
        {makingPdf ? 'Making PDF…' : 'Export'}
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={menuId} className="export-menu__list" aria-label="Export as">
          {items.map(([label, run, what]) => (
            <li key={label}>
              <button type="button" className="export-menu__item" onClick={() => void choose(run, what)()}>
                {label}
              </button>
            </li>
          ))}
          <li className="export-menu__hint">JSON, Markdown and HTML files can be imported back. PDFs are for printing.</li>
        </ul>
      )}
      {error && (
        <p role="alert" className="error export-menu__error">
          {error}
        </p>
      )}
    </div>
  )
}
